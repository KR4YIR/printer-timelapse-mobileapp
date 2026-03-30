import { cacheDirectory, writeAsStringAsync } from 'expo-file-system/legacy';
import type { PrinterAdapter, PrintStatus, PrintState, GcodeFileInfo } from '../types';

export class MoonrakerService implements PrinterAdapter {
  private ws: WebSocket | null = null;
  private baseUrl = '';
  private connected = false;
  private layerCallback: ((layer: number, total: number) => void) | null = null;
  private stateCallback: ((state: PrintState) => void) | null = null;
  private lastLayer = -1;
  private lastZ = -1;
  private layerHeight = 0;
  private zDiffSamples: number[] = [];
  private requestId = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pollingInterval: ReturnType<typeof setInterval> | null = null;

  private addLayerHeightSample(zDiff: number): void {
    // Keep only plausible layer height samples (ignore z-hop / large z moves)
    if (zDiff < 0.05 || zDiff > 0.6) return;
    this.zDiffSamples.push(zDiff);
    if (this.zDiffSamples.length > 9) this.zDiffSamples.shift();

    // Once we have a few samples, lock to median (robust against outliers)
    if (this.layerHeight === 0 && this.zDiffSamples.length >= 5) {
      const sorted = [...this.zDiffSamples].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      // Clamp to a reasonable range for typical prints
      if (median >= 0.08 && median <= 0.4) {
        this.layerHeight = median;
      }
    }
  }

  private nextEstimatedLayer(): number {
    if (this.lastLayer < 0) return 1;
    return this.lastLayer + 1;
  }

  async connect(url: string): Promise<void> {
    this.baseUrl = url.replace(/\/+$/, '');
    const wsUrl = this.baseUrl.replace(/^http/, 'ws') + '/websocket';

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Moonraker bağlantı zaman aşımı'));
      }, 10000);

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        clearTimeout(timeout);
        this.connected = true;
        this.zDiffSamples = [];
        this.subscribeToPrintStatus();
        this.startPollingFallback();
        resolve();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onerror = () => {
        clearTimeout(timeout);
        this.connected = false;
        reject(new Error('Moonraker WebSocket bağlantı hatası'));
      };

      this.ws.onclose = () => {
        this.connected = false;
        this.scheduleReconnect();
      };
    });
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.lastLayer = -1;
    this.lastZ = -1;
    this.layerHeight = 0;
    this.zDiffSamples = [];
  }

  onLayerChange(callback: (layer: number, total: number) => void): void {
    this.layerCallback = callback;
  }

  onPrintStateChange(callback: (state: PrintState) => void): void {
    this.stateCallback = callback;
  }

  async getPrintStatus(): Promise<PrintStatus> {
    const res = await fetch(
      `${this.baseUrl}/printer/objects/query?print_stats&display_status&toolhead`
    );
    const data = await res.json();
    const ps = data.result?.status?.print_stats ?? {};
    const ds = data.result?.status?.display_status ?? {};
    const th = data.result?.status?.toolhead ?? {};

    return {
      state: this.mapState(ps.state),
      filename: ps.filename || null,
      currentLayer: ps.info?.current_layer ?? this.lastLayer,
      totalLayers: ps.info?.total_layer ?? 0,
      progress: Math.round((ds.progress ?? 0) * 100),
      zHeight: th.position?.[2] ?? 0,
      xPos: th.position?.[0] ?? undefined,
      yPos: th.position?.[1] ?? undefined,
    };
  }

  isConnected(): boolean {
    return this.connected;
  }

  /**
   * REST polling as fallback for layer detection.
   * print_stats.info.current_layer is only available on newer Klipper.
   * We also track Z position to detect layer changes via Z movement.
   */
  private startPollingFallback(): void {
    this.pollingInterval = setInterval(async () => {
      if (!this.connected) return;
      try {
        const status = await this.getPrintStatus();

        if (status.state === 'printing') {
          if (status.currentLayer > 0 && status.currentLayer !== this.lastLayer) {
            this.lastLayer = status.currentLayer;
            this.layerCallback?.(status.currentLayer, status.totalLayers);
            return;
          }

          const z = status.zHeight;
          if (z > 0 && this.lastZ >= 0) {
            const zDiff = z - this.lastZ;
            this.addLayerHeightSample(zDiff);

            const threshold = this.layerHeight > 0 ? this.layerHeight * 0.8 : 0.15;
            if (zDiff > 1.0) {
              // Z-hop or other large Z moves (clean mode park/unpark) should not be treated
              // as a layer change, but we still need to update lastZ to avoid locking detection.
              this.lastZ = z;
            } else if (zDiff <= -threshold) {
              // Z moved down (undo Z-hop). Update baseline.
              this.lastZ = z;
            } else if (zDiff >= threshold) {
              this.lastZ = z;
              // Incremental estimate is more stable than z/layerHeight (z-hop/outliers can skew)
              const estimatedLayer = this.nextEstimatedLayer();
              this.lastLayer = estimatedLayer;
              this.layerCallback?.(estimatedLayer, 0);
            }
          } else if (z > 0) {
            this.lastZ = z;
          }
        }

        const mapped = this.mapState(status.state as string);
        this.stateCallback?.(mapped);
      } catch {
        // polling error, will retry
      }
    }, 3000);
  }

  private subscribeToPrintStatus(): void {
    const id = ++this.requestId;
    this.ws?.send(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'printer.objects.subscribe',
        params: {
          objects: {
            print_stats: null,
            display_status: null,
            toolhead: ['position'],
          },
        },
        id,
      })
    );
  }

  private handleMessage(raw: string): void {
    try {
      const msg = JSON.parse(raw);
      if (msg.method === 'notify_status_update') {
        const params = msg.params?.[0] ?? {};
        this.processStatusUpdate(params);
      }
    } catch {
      // ignore malformed messages
    }
  }

  private processStatusUpdate(params: Record<string, unknown>): void {
    const ps = params.print_stats as Record<string, unknown> | undefined;

    if (ps) {
      if (ps.state !== undefined) {
        const mapped = this.mapState(ps.state as string);
        this.stateCallback?.(mapped);
      }

      const info = ps.info as Record<string, number> | undefined;
      if (info?.current_layer !== undefined && info.current_layer !== this.lastLayer) {
        this.lastLayer = info.current_layer;
        this.layerCallback?.(info.current_layer, info.total_layer ?? 0);
      }
    }

    const th = params.toolhead as Record<string, unknown> | undefined;
    if (th?.position) {
      const pos = th.position as number[];
      if (pos[2] !== undefined) {
        const z = pos[2];
        if (z > 0 && this.lastZ >= 0) {
          const zDiff = z - this.lastZ;
          this.addLayerHeightSample(zDiff);
          const threshold = this.layerHeight > 0 ? this.layerHeight * 0.8 : 0.15;
          if (zDiff > 1.0) {
            this.lastZ = z;
          } else if (zDiff <= -threshold) {
            this.lastZ = z;
          } else if (zDiff >= threshold) {
            this.lastZ = z;
            const estimatedLayer = this.nextEstimatedLayer();
            if (estimatedLayer !== this.lastLayer) {
              this.lastLayer = estimatedLayer;
              this.layerCallback?.(estimatedLayer, 0);
            }
          }
        } else if (z > 0 && this.lastZ < 0) {
          this.lastZ = z;
        }
      }
    }
  }

  private mapState(raw: string | undefined): PrintState {
    switch (raw) {
      case 'printing':
        return 'printing';
      case 'paused':
        return 'paused';
      case 'complete':
        return 'complete';
      case 'error':
        return 'error';
      case 'cancelled':
        return 'cancelled';
      default:
        return 'idle';
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (!this.connected && this.baseUrl) {
        try {
          await this.connect(this.baseUrl);
        } catch {
          this.scheduleReconnect();
        }
      }
    }, 5000);
  }
}

export async function listGcodeFiles(
  baseUrl: string
): Promise<GcodeFileInfo[]> {
  const base = baseUrl.replace(/\/+$/, '');
  const res = await fetch(`${base}/server/files/list?root=gcodes`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const files: GcodeFileInfo[] = (data.result ?? []).map(
    (f: { path: string; modified: number; size: number }) => ({
      path: f.path,
      modified: f.modified,
      size: f.size,
    })
  );
  files.sort((a, b) => b.modified - a.modified);
  return files;
}

export async function downloadGcodeFile(
  baseUrl: string,
  filename: string
): Promise<string> {
  const base = baseUrl.replace(/\/+$/, '');
  const encoded = encodeURIComponent(filename);
  const res = await fetch(`${base}/server/files/gcodes/${encoded}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

export async function uploadGcodeFile(
  baseUrl: string,
  filename: string,
  content: string
): Promise<boolean> {
  const r = await uploadGcodeFileDetailed(baseUrl, filename, content);
  return r.ok;
}

export async function uploadGcodeFileDetailed(
  baseUrl: string,
  filename: string,
  content: string
): Promise<{ ok: boolean; error?: string }> {
  const base = baseUrl.replace(/\/+$/, '');

  const tempPath = `${cacheDirectory}upload_${Date.now()}.gcode`;
  await writeAsStringAsync(tempPath, content);

  const formData = new FormData();
  formData.append('file', {
    uri: tempPath,
    type: 'application/octet-stream',
    name: filename,
  } as unknown as Blob);
  formData.append('root', 'gcodes');

  const res = await fetch(`${base}/server/files/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    let err = `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as { error?: { message?: string } };
      err = j.error?.message ?? err;
    } catch {
      /* ignore */
    }
    return { ok: false, error: err };
  }
  return { ok: true };
}

/**
 * Start printing a file already under the printer gcodes folder (path relative to gcodes root).
 */
export async function startPrintJob(
  baseUrl: string,
  filenameRelativeToGcodes: string
): Promise<{ ok: boolean; error?: string }> {
  const base = baseUrl.replace(/\/+$/, '');
  const q = encodeURIComponent(filenameRelativeToGcodes);
  const res = await fetch(`${base}/printer/print/start?filename=${q}`, {
    method: 'POST',
  });
  if (!res.ok) {
    let err = `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as { error?: { message?: string }; detail?: string };
      err = j.error?.message ?? j.detail ?? err;
    } catch {
      /* ignore */
    }
    return { ok: false, error: err };
  }
  return { ok: true };
}

export async function testMoonrakerConnection(
  url: string
): Promise<{ success: boolean; message: string; firmwareInfo?: string }> {
  try {
    const base = url.replace(/\/+$/, '');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${base}/server/info`, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      return { success: false, message: `HTTP ${res.status}` };
    }

    const data = await res.json();
    const version = data.result?.klippy_state ?? 'unknown';
    return {
      success: true,
      message: 'Moonraker bağlantısı başarılı',
      firmwareInfo: `Klippy: ${version}`,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Bilinmeyen hata';
    return { success: false, message: `Moonraker bağlantı hatası: ${msg}` };
  }
}
