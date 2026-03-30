import ExpoModulesCore
import AVFoundation
import UIKit

public class ExpoFrameEncoderModule: Module {
    public func definition() -> ModuleDefinition {
        Name("ExpoFrameEncoder")

        AsyncFunction("encode") { (frameDir: String, fps: Int, outputPath: String) -> [String: Any] in
            let dirPath = frameDir.replacingOccurrences(of: "file://", with: "")
            let outPath = outputPath.replacingOccurrences(of: "file://", with: "")
            let outURL = URL(fileURLWithPath: outPath)

            let fm = FileManager.default
            guard let allFiles = try? fm.contentsOfDirectory(atPath: dirPath) else {
                throw NSError(domain: "ExpoFrameEncoder", code: 1, userInfo: [NSLocalizedDescriptionKey: "Frame directory not found"])
            }

            let frames = allFiles
                .filter { $0.hasPrefix("frame_") && $0.hasSuffix(".jpg") }
                .sorted()

            guard !frames.isEmpty else {
                throw NSError(domain: "ExpoFrameEncoder", code: 2, userInfo: [NSLocalizedDescriptionKey: "No frame files found"])
            }

            try? fm.removeItem(at: outURL)

            let firstPath = (dirPath as NSString).appendingPathComponent(frames[0])
            guard let firstImage = UIImage(contentsOfFile: firstPath),
                  let cgFirst = firstImage.cgImage else {
                throw NSError(domain: "ExpoFrameEncoder", code: 3, userInfo: [NSLocalizedDescriptionKey: "Cannot read first frame"])
            }

            let width = cgFirst.width
            let height = cgFirst.height

            let writer = try AVAssetWriter(outputURL: outURL, fileType: .mp4)

            let videoSettings: [String: Any] = [
                AVVideoCodecKey: AVVideoCodecType.h264,
                AVVideoWidthKey: width,
                AVVideoHeightKey: height,
                AVVideoCompressionPropertiesKey: [
                    AVVideoAverageBitRateKey: width * height * 2,
                    AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
                ]
            ]

            let writerInput = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
            writerInput.expectsMediaDataInRealTime = false

            let sourceAttrs: [String: Any] = [
                kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
                kCVPixelBufferWidthKey as String: width,
                kCVPixelBufferHeightKey as String: height,
            ]

            let adaptor = AVAssetWriterInputPixelBufferAdaptor(
                assetWriterInput: writerInput,
                sourcePixelBufferAttributes: sourceAttrs
            )

            writer.add(writerInput)
            guard writer.startWriting() else {
                throw NSError(domain: "ExpoFrameEncoder", code: 4,
                    userInfo: [NSLocalizedDescriptionKey: writer.error?.localizedDescription ?? "Cannot start writing"])
            }
            writer.startSession(atSourceTime: .zero)

            for (i, file) in frames.enumerated() {
                let imagePath = (dirPath as NSString).appendingPathComponent(file)
                guard let image = UIImage(contentsOfFile: imagePath),
                      let pixelBuffer = self.pixelBuffer(from: image, width: width, height: height) else {
                    continue
                }

                let time = CMTime(value: CMTimeValue(i), timescale: CMTimeScale(fps))

                while !writerInput.isReadyForMoreMediaData {
                    Thread.sleep(forTimeInterval: 0.01)
                }

                adaptor.append(pixelBuffer, withPresentationTime: time)
            }

            writerInput.markAsFinished()

            let semaphore = DispatchSemaphore(value: 0)
            writer.finishWriting { semaphore.signal() }
            semaphore.wait()

            let fileSize = (try? fm.attributesOfItem(atPath: outPath)[.size] as? Int64) ?? 0

            return [
                "success": true,
                "duration": Double(frames.count) / Double(fps),
                "fileSize": fileSize
            ]
        }
    }

    private func pixelBuffer(from image: UIImage, width: Int, height: Int) -> CVPixelBuffer? {
        let attrs: [String: Any] = [
            kCVPixelBufferCGImageCompatibilityKey as String: true,
            kCVPixelBufferCGBitmapContextCompatibilityKey as String: true,
        ]

        var pb: CVPixelBuffer?
        let status = CVPixelBufferCreate(
            kCFAllocatorDefault, width, height,
            kCVPixelFormatType_32ARGB,
            attrs as CFDictionary, &pb
        )

        guard status == kCVReturnSuccess, let buffer = pb else { return nil }

        CVPixelBufferLockBaseAddress(buffer, [])
        guard let ctx = CGContext(
            data: CVPixelBufferGetBaseAddress(buffer),
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue
        ) else {
            CVPixelBufferUnlockBaseAddress(buffer, [])
            return nil
        }

        if let cg = image.cgImage {
            ctx.draw(cg, in: CGRect(x: 0, y: 0, width: width, height: height))
        }
        CVPixelBufferUnlockBaseAddress(buffer, [])

        return buffer
    }
}
