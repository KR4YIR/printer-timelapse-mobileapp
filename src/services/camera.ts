import {
  documentDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  downloadAsync,
  readDirectoryAsync,
  deleteAsync,
} from 'expo-file-system/legacy';
import type { CaptureResult } from '../types';

const TIMELAPSE_DIR = `${documentDirectory}timelapses/`;

export async function ensureTimelapseDir(timelapseId: string): Promise<string> {
  const dir = `${TIMELAPSE_DIR}${timelapseId}/`;
  const dirInfo = await getInfoAsync(dir);
  if (!dirInfo.exists) {
    await makeDirectoryAsync(dir, { intermediates: true });
  }
  return dir;
}

export async function capturePhoto(
  cameraUrl: string,
  timelapseId: string,
  frameNumber: number
): Promise<CaptureResult> {
  try {
    const dir = await ensureTimelapseDir(timelapseId);
    const paddedNum = String(frameNumber).padStart(5, '0');
    const filePath = `${dir}frame_${paddedNum}.jpg`;

    const downloadResult = await downloadAsync(cameraUrl, filePath);

    if (downloadResult.status !== 200) {
      return {
        success: false,
        path: null,
        error: `Kamera HTTP ${downloadResult.status}`,
      };
    }

    return { success: true, path: filePath };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Bilinmeyen hata';
    return { success: false, path: null, error: msg };
  }
}

export async function getTimelapsePhotos(timelapseId: string): Promise<string[]> {
  const dir = `${TIMELAPSE_DIR}${timelapseId}/`;
  const dirInfo = await getInfoAsync(dir);
  if (!dirInfo.exists) return [];

  const files = await readDirectoryAsync(dir);
  return files
    .filter((f) => f.startsWith('frame_') && f.endsWith('.jpg'))
    .sort()
    .map((f) => `${dir}${f}`);
}

export async function deleteTimelapse(timelapseId: string): Promise<void> {
  const dir = `${TIMELAPSE_DIR}${timelapseId}/`;
  const dirInfo = await getInfoAsync(dir);
  if (dirInfo.exists) {
    await deleteAsync(dir, { idempotent: true });
  }
}

export async function getStorageUsage(): Promise<{
  totalFiles: number;
  totalSizeMB: number;
}> {
  const dirInfo = await getInfoAsync(TIMELAPSE_DIR);
  if (!dirInfo.exists) return { totalFiles: 0, totalSizeMB: 0 };

  const timelapses = await readDirectoryAsync(TIMELAPSE_DIR);
  let totalFiles = 0;
  let totalSize = 0;

  for (const tl of timelapses) {
    const tlDir = `${TIMELAPSE_DIR}${tl}/`;
    const files = await readDirectoryAsync(tlDir);
    for (const f of files) {
      const info = await getInfoAsync(`${tlDir}${f}`);
      if (info.exists && 'size' in info) {
        totalFiles++;
        totalSize += (info as { size: number }).size ?? 0;
      }
    }
  }

  return {
    totalFiles,
    totalSizeMB: Math.round((totalSize / (1024 * 1024)) * 10) / 10,
  };
}
