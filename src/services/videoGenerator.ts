import {
  documentDirectory,
  readDirectoryAsync,
  getInfoAsync,
  writeAsStringAsync,
  readAsStringAsync,
  deleteAsync,
} from 'expo-file-system/legacy';

const TIMELAPSE_DIR = `${documentDirectory}timelapses/`;

export interface VideoGenerationResult {
  success: boolean;
  videoPath: string | null;
  duration: number;
  fileSize: number;
  isNative: boolean;
  error?: string;
}

export async function generateVideo(
  timelapseId: string,
  fps: number,
  _onProgress?: (percent: number) => void
): Promise<VideoGenerationResult> {
  const dir = `${TIMELAPSE_DIR}${timelapseId}/`;
  const files = await readDirectoryAsync(dir);
  const frames = files
    .filter((f) => f.startsWith('frame_') && (f.endsWith('.jpg') || f.endsWith('.png')))
    .sort();

  if (frames.length === 0) {
    return { success: false, videoPath: null, duration: 0, fileSize: 0, isNative: false, error: 'Fotoğraf bulunamadı' };
  }

  try {
    const { encodeFramesToVideo } = require('../../modules/expo-frame-encoder');
    const outputPath = `${dir}video_${fps}fps.mp4`;
    const result = await encodeFramesToVideo(dir, fps, outputPath);

    return {
      success: true,
      videoPath: outputPath,
      duration: result.duration,
      fileSize: result.fileSize,
      isNative: true,
    };
  } catch {
    // Native module not available (e.g. Expo Go) -- fall back to slideshow manifest
  }

  return generateSlideshow(timelapseId, fps, dir, frames);
}

async function generateSlideshow(
  timelapseId: string,
  fps: number,
  dir: string,
  frames: string[]
): Promise<VideoGenerationResult> {
  const duration = frames.length / fps;
  const manifestPath = `${dir}video_${fps}fps.json`;

  const manifest = {
    type: 'slideshow',
    timelapseId,
    fps,
    frameCount: frames.length,
    frames: frames.map((f) => `${dir}${f}`),
    duration,
    createdAt: new Date().toISOString(),
  };

  await writeAsStringAsync(manifestPath, JSON.stringify(manifest));

  return {
    success: true,
    videoPath: manifestPath,
    duration,
    fileSize: JSON.stringify(manifest).length,
    isNative: false,
  };
}

export interface SlideshowManifest {
  type: 'slideshow';
  timelapseId: string;
  fps: number;
  frameCount: number;
  frames: string[];
  duration: number;
  createdAt: string;
}

export async function loadSlideshowManifest(
  manifestPath: string
): Promise<SlideshowManifest | null> {
  try {
    const info = await getInfoAsync(manifestPath);
    if (!info.exists) return null;
    const raw = await readAsStringAsync(manifestPath);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function isNativeVideo(path: string): boolean {
  return path.endsWith('.mp4');
}

export async function deleteVideo(videoPath: string): Promise<void> {
  try {
    await deleteAsync(videoPath, { idempotent: true });
  } catch { /* ok */ }
}
