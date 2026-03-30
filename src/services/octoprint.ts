import type { PrinterAdapter, PrintStatus, PrintState } from '../types';

export class OctoPrintService implements PrinterAdapter {
  private baseUrl = '';
  private apiKey = '';
  private connected = false;
  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private layerCallback: ((layer: number, total: number) => void) | null = null;
  private stateCallback: ((state: PrintState) => void) | null = null;
  private lastZHeight = -1;
  private estimatedLayer = 0;
  private lastState: PrintState = 'idle';
  private layerHeight = 0.2;

  async connect(url: string, apiKey?: string): Promise<void> {
    this.baseUrl = url.replace(/\/+$/, '');
    this.apiKey = apiKey ?? '';

    const status = await this.fetchJobStatus();
    if (status === null) {
      throw new Error('OctoPrint bağlantı hatası');
    }

    this.connected = true;
    this.startPolling();
  }

  disconnect(): void {
    this.stopPolling();
    this.connected = false;
    this.lastZHeight = -1;
    this.estimatedLayer = 0;
    this.lastState = 'idle';
  }

  onLayerChange(callback: (layer: number, total: number) => void): void {
    this.layerCallback = callback;
  }

  onPrintStateChange(callback: (state: PrintState) => void): void {
    this.stateCallback = callback;
  }

  async getPrintStatus(): Promise<PrintStatus> {
    const job = await this.fetchJobStatus();
    if (!job) {
      return {
        state: 'idle',
        filename: null,
        currentLayer: 0,
        totalLayers: 0,
        progress: 0,
        zHeight: 0,
        xPos: undefined,
        yPos: undefined,
      };
    }

    const state = this.mapState(job.state);
    const zHeight = job.job?.file?.name
      ? await this.getCurrentZ()
      : 0;

    return {
      state,
      filename: job.job?.file?.name ?? null,
      currentLayer: this.estimatedLayer,
      totalLayers: 0,
      progress: Math.round(job.progress?.completion ?? 0),
      zHeight,
      xPos: undefined,
      yPos: undefined,
    };
  }

  isConnected(): boolean {
    return this.connected;
  }

  private async fetchJobStatus(): Promise<OctoPrintJobResponse | null> {
    try {
      const headers: Record<string, string> = {};
      if (this.apiKey) headers['X-Api-Key'] = this.apiKey;

      const res = await fetch(`${this.baseUrl}/api/job`, { headers });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  private async getCurrentZ(): Promise<number> {
    try {
      const headers: Record<string, string> = {};
      if (this.apiKey) headers['X-Api-Key'] = this.apiKey;

      const res = await fetch(`${this.baseUrl}/api/printer`, { headers });
      if (!res.ok) return 0;
      const data = await res.json();
      return data.currentZ ?? 0;
    } catch {
      return 0;
    }
  }

  private startPolling(): void {
    this.pollingInterval = setInterval(async () => {
      if (!this.connected) return;

      try {
        const job = await this.fetchJobStatus();
        if (!job) return;

        const newState = this.mapState(job.state);
        if (newState !== this.lastState) {
          this.lastState = newState;
          this.stateCallback?.(newState);
        }

        if (newState === 'printing') {
          const z = await this.getCurrentZ();
          if (z > 0 && z !== this.lastZHeight) {
            const layerDiff = Math.abs(z - this.lastZHeight);
            if (layerDiff >= this.layerHeight * 0.8) {
              this.lastZHeight = z;
              this.estimatedLayer = Math.round(z / this.layerHeight);
              this.layerCallback?.(this.estimatedLayer, 0);
            }
          }
        }
      } catch {
        // polling error, will retry next interval
      }
    }, 2000);
  }

  private stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  private mapState(raw: string | undefined): PrintState {
    switch (raw) {
      case 'Printing':
        return 'printing';
      case 'Paused':
      case 'Pausing':
        return 'paused';
      case 'Operational':
      case 'Ready':
        return 'idle';
      case 'Finishing':
        return 'complete';
      case 'Error':
      case 'Offline':
      case 'Closed':
        return 'error';
      case 'Cancelling':
        return 'cancelled';
      default:
        return 'idle';
    }
  }
}

interface OctoPrintJobResponse {
  state: string;
  job?: {
    file?: {
      name?: string;
    };
    estimatedPrintTime?: number;
  };
  progress?: {
    completion?: number;
    printTime?: number;
    printTimeLeft?: number;
  };
}

/**
 * Upload a local G-code file to OctoPrint and start printing immediately.
 * `localUri` should be a file:// or content:// URI from DocumentPicker.
 */
export async function uploadGcodeFileAndPrint(
  baseUrl: string,
  apiKey: string,
  localUri: string,
  filename: string
): Promise<{ ok: boolean; error?: string }> {
  const base = baseUrl.replace(/\/+$/, '');
  const headers: Record<string, string> = {};
  if (apiKey) headers['X-Api-Key'] = apiKey;

  const formData = new FormData();
  formData.append('file', {
    uri: localUri,
    type: 'application/octet-stream',
    name: filename.endsWith('.gcode') || filename.endsWith('.g') ? filename : `${filename}.gcode`,
  } as unknown as Blob);

  const url = `${base}/api/files/local?print=true`;
  const res = await fetch(url, { method: 'POST', headers, body: formData });
  if (!res.ok) {
    let err = `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as { error?: string };
      err = j.error ?? err;
    } catch {
      /* ignore */
    }
    return { ok: false, error: err };
  }
  return { ok: true };
}

export async function testOctoPrintConnection(
  url: string,
  apiKey?: string
): Promise<{ success: boolean; message: string; firmwareInfo?: string }> {
  try {
    const base = url.replace(/\/+$/, '');
    const headers: Record<string, string> = {};
    if (apiKey) headers['X-Api-Key'] = apiKey;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${base}/api/version`, {
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return { success: false, message: `HTTP ${res.status} - API Key doğru mu?` };
    }

    const data = await res.json();
    return {
      success: true,
      message: 'OctoPrint bağlantısı başarılı',
      firmwareInfo: `OctoPrint ${data.server ?? 'unknown'}`,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Bilinmeyen hata';
    return { success: false, message: `OctoPrint bağlantı hatası: ${msg}` };
  }
}
