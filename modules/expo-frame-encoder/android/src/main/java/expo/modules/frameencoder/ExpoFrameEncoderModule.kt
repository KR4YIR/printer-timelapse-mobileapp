package expo.modules.frameencoder

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaCodecList
import android.media.MediaFormat
import android.media.MediaMuxer
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class ExpoFrameEncoderModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("ExpoFrameEncoder")

        AsyncFunction("encode") { frameDir: String, fps: Int, outputPath: String ->
            val dir = File(frameDir.removePrefix("file://"))
            require(dir.exists() && dir.isDirectory) { "Frame directory not found: $frameDir" }

            val frames = dir.listFiles { f ->
                f.name.startsWith("frame_") && f.name.endsWith(".jpg")
            }?.sortedBy { it.name } ?: emptyList()

            require(frames.isNotEmpty()) { "No frame files found" }

            val outFile = File(outputPath.removePrefix("file://"))
            if (outFile.exists()) outFile.delete()

            encodeFrames(frames, fps, outFile)
        }
    }

    private fun encodeFrames(frames: List<File>, fps: Int, outputFile: File): Map<String, Any> {
        val probeOpts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(frames[0].absolutePath, probeOpts)
        val width = (probeOpts.outWidth / 2) * 2
        val height = (probeOpts.outHeight / 2) * 2

        val colorFormat = findColorFormat()
        val isNV12 = colorFormat == MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420SemiPlanar
        val bitRate = (width * height * 2).coerceAtLeast(500_000)

        val format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, width, height).apply {
            setInteger(MediaFormat.KEY_COLOR_FORMAT, colorFormat)
            setInteger(MediaFormat.KEY_BIT_RATE, bitRate)
            setInteger(MediaFormat.KEY_FRAME_RATE, fps)
            setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1)
        }

        val codec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
        codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        codec.start()

        val muxer = MediaMuxer(outputFile.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
        var trackIdx = -1
        var muxerStarted = false
        val bufInfo = MediaCodec.BufferInfo()

        fun drain(eos: Boolean) {
            while (true) {
                val outIdx = codec.dequeueOutputBuffer(bufInfo, if (eos) 10_000L else 1_000L)
                when {
                    outIdx == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                        trackIdx = muxer.addTrack(codec.outputFormat)
                        muxer.start()
                        muxerStarted = true
                    }
                    outIdx >= 0 -> {
                        val buf = codec.getOutputBuffer(outIdx)
                        if (buf != null && muxerStarted && bufInfo.size > 0) {
                            buf.position(bufInfo.offset)
                            buf.limit(bufInfo.offset + bufInfo.size)
                            muxer.writeSampleData(trackIdx, buf, bufInfo)
                        }
                        codec.releaseOutputBuffer(outIdx, false)
                        if (bufInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) return
                    }
                    else -> {
                        if (!eos) return
                    }
                }
            }
        }

        try {
            for ((i, frameFile) in frames.withIndex()) {
                val bitmap = BitmapFactory.decodeFile(frameFile.absolutePath) ?: continue
                val yuv = if (isNV12) bitmapToNV12(bitmap, width, height)
                          else bitmapToI420(bitmap, width, height)
                bitmap.recycle()

                while (true) {
                    val inIdx = codec.dequeueInputBuffer(10_000)
                    if (inIdx >= 0) {
                        val inBuf = codec.getInputBuffer(inIdx)!!
                        inBuf.clear()
                        inBuf.put(yuv)
                        codec.queueInputBuffer(inIdx, 0, yuv.size, i * 1_000_000L / fps, 0)
                        break
                    }
                    drain(false)
                }
                drain(false)
            }

            while (true) {
                val inIdx = codec.dequeueInputBuffer(10_000)
                if (inIdx >= 0) {
                    codec.queueInputBuffer(inIdx, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                    break
                }
                drain(false)
            }
            drain(true)
        } finally {
            codec.stop()
            codec.release()
            if (muxerStarted) {
                muxer.stop()
            }
            muxer.release()
        }

        return mapOf(
            "success" to true,
            "duration" to frames.size.toDouble() / fps,
            "fileSize" to outputFile.length()
        )
    }

    private fun findColorFormat(): Int {
        val list = MediaCodecList(MediaCodecList.REGULAR_CODECS)
        for (info in list.codecInfos) {
            if (!info.isEncoder) continue
            for (type in info.supportedTypes) {
                if (type.equals(MediaFormat.MIMETYPE_VIDEO_AVC, ignoreCase = true)) {
                    val caps = info.getCapabilitiesForType(type)
                    if (MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420SemiPlanar in caps.colorFormats)
                        return MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420SemiPlanar
                    if (MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Planar in caps.colorFormats)
                        return MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Planar
                }
            }
        }
        return MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420SemiPlanar
    }

    private fun bitmapToNV12(bitmap: Bitmap, width: Int, height: Int): ByteArray {
        val scaled = if (bitmap.width != width || bitmap.height != height)
            Bitmap.createScaledBitmap(bitmap, width, height, true) else bitmap

        val pixels = IntArray(width * height)
        scaled.getPixels(pixels, 0, width, 0, 0, width, height)
        if (scaled !== bitmap) scaled.recycle()

        val ySize = width * height
        val nv12 = ByteArray(ySize * 3 / 2)
        var yIdx = 0
        var uvIdx = ySize

        for (j in 0 until height) {
            for (i in 0 until width) {
                val px = pixels[j * width + i]
                val r = (px shr 16) and 0xFF
                val g = (px shr 8) and 0xFF
                val b = px and 0xFF
                nv12[yIdx++] = (((66 * r + 129 * g + 25 * b + 128) shr 8) + 16).coerceIn(0, 255).toByte()
                if (j % 2 == 0 && i % 2 == 0) {
                    nv12[uvIdx++] = (((-38 * r - 74 * g + 112 * b + 128) shr 8) + 128).coerceIn(0, 255).toByte()
                    nv12[uvIdx++] = (((112 * r - 94 * g - 18 * b + 128) shr 8) + 128).coerceIn(0, 255).toByte()
                }
            }
        }
        return nv12
    }

    private fun bitmapToI420(bitmap: Bitmap, width: Int, height: Int): ByteArray {
        val scaled = if (bitmap.width != width || bitmap.height != height)
            Bitmap.createScaledBitmap(bitmap, width, height, true) else bitmap

        val pixels = IntArray(width * height)
        scaled.getPixels(pixels, 0, width, 0, 0, width, height)
        if (scaled !== bitmap) scaled.recycle()

        val ySize = width * height
        val uvSize = ySize / 4
        val i420 = ByteArray(ySize + uvSize * 2)
        var yIdx = 0
        var uIdx = ySize
        var vIdx = ySize + uvSize

        for (j in 0 until height) {
            for (i in 0 until width) {
                val px = pixels[j * width + i]
                val r = (px shr 16) and 0xFF
                val g = (px shr 8) and 0xFF
                val b = px and 0xFF
                i420[yIdx++] = (((66 * r + 129 * g + 25 * b + 128) shr 8) + 16).coerceIn(0, 255).toByte()
                if (j % 2 == 0 && i % 2 == 0) {
                    i420[uIdx++] = (((-38 * r - 74 * g + 112 * b + 128) shr 8) + 128).coerceIn(0, 255).toByte()
                    i420[vIdx++] = (((112 * r - 94 * g - 18 * b + 128) shr 8) + 128).coerceIn(0, 255).toByte()
                }
            }
        }
        return i420
    }
}
