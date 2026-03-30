export type PrinterType = 'moonraker' | 'octoprint';

export type PrintState =
  | 'idle'
  | 'printing'
  | 'paused'
  | 'complete'
  | 'error'
  | 'cancelled';

export type TimelapseMode = 'quick' | 'clean';

export interface PrintStatus {
  state: PrintState;
  filename: string | null;
  currentLayer: number;
  totalLayers: number;
  progress: number;
  zHeight: number;
  xPos?: number;
  yPos?: number;
}

export interface PrinterAdapter {
  connect(url: string, apiKey?: string): Promise<void>;
  disconnect(): void;
  onLayerChange(callback: (layer: number, total: number) => void): void;
  onPrintStateChange(callback: (state: PrintState) => void): void;
  getPrintStatus(): Promise<PrintStatus>;
  isConnected(): boolean;
}

export interface VideoRecord {
  id: string;
  fps: number;
  path: string;
  duration: number;
  fileSize: number;
  createdAt: string;
}

export interface TimelapseRecord {
  id: string;
  name: string;
  date: string;
  photoCount: number;
  photoPaths: string[];
  videoPath: string | null;
  thumbnailPath: string | null;
  mode: TimelapseMode;
  fps: number;
  printerType: PrinterType;
  duration: number;
  videos: VideoRecord[];
}

export interface GcodeFileInfo {
  path: string;
  modified: number;
  size: number;
}

export interface GcodeModifierOptions {
  parkX: number;
  parkY: number;
  parkZHop: number;
  retractLength: number;
  dwellMs: number;
  travelSpeed: number;
}

export interface ConnectionTestResult {
  success: boolean;
  printerType?: PrinterType;
  message: string;
  firmwareInfo?: string;
}

export interface CaptureResult {
  success: boolean;
  path: string | null;
  error?: string;
}
