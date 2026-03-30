import type { PrinterAdapter, PrinterType, ConnectionTestResult } from '../types';
import { MoonrakerService, testMoonrakerConnection } from './moonraker';
import { OctoPrintService, testOctoPrintConnection } from './octoprint';

export async function detectPrinterType(url: string): Promise<ConnectionTestResult> {
  const base = url.replace(/\/+$/, '');

  const moonraker = await testMoonrakerConnection(base);
  if (moonraker.success) {
    return {
      success: true,
      printerType: 'moonraker',
      message: moonraker.message,
      firmwareInfo: moonraker.firmwareInfo,
    };
  }

  const octoprint = await testOctoPrintConnection(base);
  if (octoprint.success) {
    return {
      success: true,
      printerType: 'octoprint',
      message: octoprint.message,
      firmwareInfo: octoprint.firmwareInfo,
    };
  }

  return {
    success: false,
    message:
      'Bağlantı kurulamadı. URL\'nin doğru olduğundan ve Moonraker/OctoPrint çalıştığından emin olun.',
  };
}

export function createPrinterAdapter(type: PrinterType): PrinterAdapter {
  switch (type) {
    case 'moonraker':
      return new MoonrakerService();
    case 'octoprint':
      return new OctoPrintService();
  }
}

export async function testCameraConnection(
  url: string
): Promise<{ success: boolean; message: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      return { success: false, message: `Kamera HTTP ${res.status}` };
    }

    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('image')) {
      return {
        success: false,
        message: `Beklenen image, alınan: ${contentType}`,
      };
    }

    return { success: true, message: 'Kamera bağlantısı başarılı' };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Bilinmeyen hata';
    return { success: false, message: `Kamera bağlantı hatası: ${msg}` };
  }
}
