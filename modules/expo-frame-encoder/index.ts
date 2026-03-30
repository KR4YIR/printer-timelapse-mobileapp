import { requireNativeModule } from 'expo-modules-core';

interface EncodeResult {
  success: boolean;
  duration: number;
  fileSize: number;
}

const ExpoFrameEncoder = requireNativeModule('ExpoFrameEncoder');

export async function encodeFramesToVideo(
  frameDir: string,
  fps: number,
  outputPath: string
): Promise<EncodeResult> {
  return await ExpoFrameEncoder.encode(frameDir, fps, outputPath);
}
