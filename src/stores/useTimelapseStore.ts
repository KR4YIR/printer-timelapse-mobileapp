import { create } from 'zustand';
import AsyncStorage from '../utils/asyncStorage';
import type {
  PrinterType,
  PrintState,
  TimelapseMode,
  TimelapseRecord,
  VideoRecord,
  GcodeModifierOptions,
} from '../types';

interface TimelapseState {
  printerUrl: string;
  printerType: PrinterType | null;
  cameraUrl: string;
  streamUrl: string;
  apiKey: string;
  isConnected: boolean;
  isPrinterTested: boolean;
  isCameraTested: boolean;
  firmwareInfo: string;

  isRecording: boolean;
  currentLayer: number;
  totalLayers: number;
  capturedPhotos: string[];
  currentTimelapseId: string | null;
  printState: PrintState;
  mode: TimelapseMode;
  fps: number;

  gcodeOptions: GcodeModifierOptions;

  completedTimelapses: TimelapseRecord[];

  setPrinterUrl: (url: string) => void;
  setCameraUrl: (url: string) => void;
  setStreamUrl: (url: string) => void;
  setApiKey: (key: string) => void;
  setPrinterType: (type: PrinterType | null) => void;
  setConnected: (connected: boolean) => void;
  setPrinterTested: (tested: boolean, firmwareInfo?: string) => void;
  setCameraTested: (tested: boolean) => void;
  setFirmwareInfo: (info: string) => void;

  startRecording: (id: string, mode: TimelapseMode) => void;
  stopRecording: () => void;
  setCurrentLayer: (layer: number, total: number) => void;
  addCapturedPhoto: (path: string) => void;
  setPrintState: (state: PrintState) => void;
  setFps: (fps: number) => void;
  setMode: (mode: TimelapseMode) => void;

  setGcodeOptions: (options: Partial<GcodeModifierOptions>) => void;

  addCompletedTimelapse: (record: TimelapseRecord) => void;
  removeTimelapse: (id: string) => void;
  updateTimelapseVideo: (id: string, videoPath: string) => void;
  addVideoToTimelapse: (timelapseId: string, video: VideoRecord) => void;
  removeVideoFromTimelapse: (timelapseId: string, videoId: string) => void;

  loadPersistedSettings: () => Promise<void>;
  persistSettings: () => Promise<void>;
}

export const useTimelapseStore = create<TimelapseState>((set, get) => ({
  printerUrl: '',
  printerType: null,
  cameraUrl: '',
  streamUrl: '',
  apiKey: '',
  isConnected: false,
  isPrinterTested: false,
  isCameraTested: false,
  firmwareInfo: '',

  isRecording: false,
  currentLayer: 0,
  totalLayers: 0,
  capturedPhotos: [],
  currentTimelapseId: null,
  printState: 'idle',
  mode: 'quick',
  fps: 30,

  gcodeOptions: {
    parkX: 0,
    parkY: 220,
    parkZHop: 2,
    retractLength: 1,
    dwellMs: 2000,
    travelSpeed: 9000,
  },

  completedTimelapses: [],

  setPrinterUrl: (url) => set({ printerUrl: url, isPrinterTested: false }),
  setCameraUrl: (url) => set({ cameraUrl: url, isCameraTested: false }),
  setStreamUrl: (url) => set({ streamUrl: url }),
  setApiKey: (key) => set({ apiKey: key }),
  setPrinterType: (type) => set({ printerType: type }),
  setConnected: (connected) => set({ isConnected: connected }),
  setPrinterTested: (tested, firmwareInfo) =>
    set({ isPrinterTested: tested, firmwareInfo: firmwareInfo ?? get().firmwareInfo }),
  setCameraTested: (tested) => set({ isCameraTested: tested }),
  setFirmwareInfo: (info) => set({ firmwareInfo: info }),

  startRecording: (id, mode) =>
    set({
      isRecording: true,
      currentTimelapseId: id,
      currentLayer: 0,
      totalLayers: 0,
      capturedPhotos: [],
      mode,
    }),
  stopRecording: () => set({ isRecording: false }),
  setCurrentLayer: (layer, total) =>
    set({ currentLayer: layer, totalLayers: total }),
  addCapturedPhoto: (path) =>
    set((s) => ({ capturedPhotos: [...s.capturedPhotos, path] })),
  setPrintState: (state) => set({ printState: state }),
  setFps: (fps) => set({ fps }),
  setMode: (mode) => set({ mode }),

  setGcodeOptions: (options) =>
    set((s) => ({ gcodeOptions: { ...s.gcodeOptions, ...options } })),

  addCompletedTimelapse: (record) =>
    set((s) => ({
      completedTimelapses: [record, ...s.completedTimelapses],
    })),
  removeTimelapse: (id) =>
    set((s) => ({
      completedTimelapses: s.completedTimelapses.filter((t) => t.id !== id),
    })),
  updateTimelapseVideo: (id, videoPath) =>
    set((s) => ({
      completedTimelapses: s.completedTimelapses.map((t) =>
        t.id === id ? { ...t, videoPath } : t
      ),
    })),
  addVideoToTimelapse: (timelapseId, video) =>
    set((s) => ({
      completedTimelapses: s.completedTimelapses.map((t) =>
        t.id === timelapseId
          ? { ...t, videos: [...(t.videos ?? []), video] }
          : t
      ),
    })),
  removeVideoFromTimelapse: (timelapseId, videoId) =>
    set((s) => ({
      completedTimelapses: s.completedTimelapses.map((t) =>
        t.id === timelapseId
          ? { ...t, videos: (t.videos ?? []).filter((v) => v.id !== videoId) }
          : t
      ),
    })),

  loadPersistedSettings: async () => {
    try {
      const raw = await AsyncStorage.getItem('timelapse_settings');
      if (raw) {
        const saved = JSON.parse(raw);
        set({
          printerUrl: saved.printerUrl ?? '',
          cameraUrl: saved.cameraUrl ?? '',
          streamUrl: saved.streamUrl ?? '',
          apiKey: saved.apiKey ?? '',
          printerType: saved.printerType ?? null,
          fps: saved.fps ?? 30,
          mode: saved.mode ?? 'quick',
          gcodeOptions: saved.gcodeOptions ?? get().gcodeOptions,
          completedTimelapses: saved.completedTimelapses ?? [],
        });
      }
    } catch {
      // ignore load errors
    }
  },

  persistSettings: async () => {
    try {
      const s = get();
      await AsyncStorage.setItem(
        'timelapse_settings',
        JSON.stringify({
          printerUrl: s.printerUrl,
          cameraUrl: s.cameraUrl,
          streamUrl: s.streamUrl,
          apiKey: s.apiKey,
          printerType: s.printerType,
          fps: s.fps,
          mode: s.mode,
          gcodeOptions: s.gcodeOptions,
          completedTimelapses: s.completedTimelapses,
        })
      );
    } catch {
      // ignore save errors
    }
  },
}));
