import React, { useEffect, useRef, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
  FlatList,
  AppState,
  Platform,
  Modal,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { startForegroundTimelapse, stopForegroundTimelapse } from '../../modules/expo-foreground-service';

import { useTimelapseStore } from '../../src/stores/useTimelapseStore';
import { createPrinterAdapter } from '../../src/services/printer';
import { capturePhoto } from '../../src/services/camera';
import PrintProgress from '../../src/components/PrintProgress';
import LayerIndicator from '../../src/components/LayerIndicator';
import CameraPreview from '../../src/components/CameraPreview';
import type { PrinterAdapter, TimelapseMode } from '../../src/types';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: false,
    shouldShowList: false,
  }),
});

const FOREGROUND_NOTIF_ID = 'timelapse-foreground';

async function showForegroundNotification(layer: number, photoCount: number) {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.dismissNotificationAsync(FOREGROUND_NOTIF_ID);
  } catch { /* first time */ }
  await Notifications.scheduleNotificationAsync({
    identifier: FOREGROUND_NOTIF_ID,
    content: {
      title: 'Timelapse Aktif',
      body: `Katman ${layer} • ${photoCount} fotoğraf çekildi`,
      sticky: true,
      priority: Notifications.AndroidNotificationPriority.LOW,
    },
    trigger: null,
  });
}

async function dismissForegroundNotification() {
  try {
    await Notifications.dismissNotificationAsync(FOREGROUND_NOTIF_ID);
  } catch { /* ok */ }
}

async function requestNotifPermission() {
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    await Notifications.requestPermissionsAsync();
  }
}

export default function TimelapseScreen() {
  const store = useTimelapseStore();
  const adapterRef = useRef<PrinterAdapter | null>(null);
  const [progress, setProgress] = useState(0);
  const frameCounter = useRef(0);
  const lastLayerRef = useRef(0);
  const lastCaptureAtRef = useRef(0);
  const captureInFlightRef = useRef(false);

  const timelapseIdRef = useRef<string | null>(null);
  const cameraUrlRef = useRef<string>('');
  const isRecordingRef = useRef(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  useEffect(() => {
    timelapseIdRef.current = store.currentTimelapseId;
    cameraUrlRef.current = store.cameraUrl;
    isRecordingRef.current = store.isRecording;
  }, [store.currentTimelapseId, store.cameraUrl, store.isRecording]);

  const canStart = store.isPrinterTested && store.isCameraTested && !store.isRecording;
  const isActive = store.isRecording;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' && isRecordingRef.current) {
        console.log('[Timelapse] Arka planda çalışmaya devam ediyor...');
      }
    });
    return () => subscription.remove();
  }, []);

  const handleLayerChange = useCallback(
    async (layer: number, total: number) => {
      const storeState = useTimelapseStore.getState();
      if (captureInFlightRef.current) {
        return;
      }
      // Basit guard: ayni veya daha dusuk katman icin veya cok sik cagri gelirse ignore et
      const now = Date.now();
      if (layer <= lastLayerRef.current) {
        return;
      }
      if (now - lastCaptureAtRef.current < 700) {
        return;
      }
      storeState.setCurrentLayer(layer, total);

      const tlId = timelapseIdRef.current;
      const camUrl = cameraUrlRef.current;

      if (!tlId || !camUrl) return;
      captureInFlightRef.current = true;

      try {
        // Clean mode: wait until the head reaches park XY, then capture during dwell.
        const mode = storeState.mode;
        if (mode === 'clean') {
          const dwellMs = storeState.gcodeOptions?.dwellMs ?? 2000;
          const parkX = storeState.gcodeOptions?.parkX ?? 0;
          const parkY = storeState.gcodeOptions?.parkY ?? 220;

          let parked = false;
          const pollStart = Date.now();
          const maxWait = Math.min(8000, Math.max(2500, dwellMs + 2500));
          while (Date.now() - pollStart < maxWait) {
            try {
              const st = await adapterRef.current?.getPrintStatus();
              if (st?.xPos !== undefined && st?.yPos !== undefined) {
                const dx = Math.abs(st.xPos - parkX);
                const dy = Math.abs(st.yPos - parkY);
                if (dx <= 2.0 && dy <= 2.0) {
                  parked = true;
                  break;
                }
              }
            } catch {
              // ignore single poll errors
            }
            await new Promise((r) => setTimeout(r, 150));
          }

          if (parked) {
            // small buffer to land inside dwell after XY park is reached
            await new Promise((r) => setTimeout(r, 1200));
          } else {
            // fallback when XY position is unavailable
            const fallbackDelay = Math.min(2200, Math.max(900, dwellMs - 250));
            await new Promise((r) => setTimeout(r, fallbackDelay));
          }
        }

        frameCounter.current++;
        const result = await capturePhoto(camUrl, tlId, frameCounter.current);

        if (result.success && result.path) {
          useTimelapseStore.getState().addCapturedPhoto(result.path);
        }

        const s = useTimelapseStore.getState();
        showForegroundNotification(layer, s.capturedPhotos.length);
        lastLayerRef.current = layer;
        lastCaptureAtRef.current = now;
      } finally {
        captureInFlightRef.current = false;
      }
    },
    []
  );

  const handlePrintStateChange = useCallback(
    async (state: string) => {
      useTimelapseStore.getState().setPrintState(state as any);

      if (state === 'complete' && isRecordingRef.current) {
        await stopTimelapse(true);
      }
    },
    []
  );

  const startTimelapse = async (mode: TimelapseMode) => {
    if (!store.printerType) {
      Alert.alert('Hata', 'Önce yazıcı bağlantısını test edin');
      return;
    }

    await requestNotifPermission();

    try {
      const adapter = createPrinterAdapter(store.printerType);
      await adapter.connect(store.printerUrl, store.apiKey || undefined);

      adapterRef.current = adapter;
      const id = `tl_${Date.now()}`;
      frameCounter.current = 0;

      store.startRecording(id, mode);
      store.setConnected(true);

      if (Platform.OS === 'android') {
        startForegroundTimelapse({
          title: 'G-code Timelapse',
          body: 'Timelapse kaydı devam ediyor',
        });
      }

      adapter.onLayerChange(handleLayerChange);
      adapter.onPrintStateChange(handlePrintStateChange);

      showForegroundNotification(0, 0);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Bilinmeyen hata';
      Alert.alert('Bağlantı Hatası', msg);
    }
  };

  const stopTimelapse = async (autoComplete = false) => {
    if (adapterRef.current) {
      adapterRef.current.disconnect();
      adapterRef.current = null;
    }

    await dismissForegroundNotification();

    if (Platform.OS === 'android') {
      stopForegroundTimelapse();
    }

    const currentState = useTimelapseStore.getState();
    const photos = currentState.capturedPhotos;
    const tlId = currentState.currentTimelapseId;

    currentState.stopRecording();
    currentState.setConnected(false);

    if (tlId && photos.length > 0) {
      currentState.addCompletedTimelapse({
        id: tlId,
        name: `Timelapse ${new Date().toLocaleDateString('tr-TR')}`,
        date: new Date().toISOString(),
        photoCount: photos.length,
        photoPaths: photos,
        videoPath: null,
        thumbnailPath: photos[0] ?? null,
        mode: currentState.mode,
        fps: 30,
        printerType: currentState.printerType!,
        duration: 0,
        videos: [],
      });

      currentState.persistSettings();

      if (autoComplete) {
        Alert.alert(
          'Timelapse Tamamlandı',
          `${photos.length} fotoğraf çekildi. Galeri sekmesinden video oluşturabilirsiniz.`
        );
      }
    }
  };

  useEffect(() => {
    return () => {
      if (adapterRef.current) {
        adapterRef.current.disconnect();
      }
    };
  }, []);

  const fetchProgress = useCallback(async () => {
    if (!adapterRef.current?.isConnected()) return;
    try {
      const status = await adapterRef.current.getPrintStatus();
      setProgress(status.progress);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(fetchProgress, 5000);
    return () => clearInterval(interval);
  }, [isActive, fetchProgress]);

  const renderPhotoItem = ({ item }: { item: string }) => (
    <TouchableOpacity onPress={() => setPreviewUri(item)}>
      <Image source={{ uri: item }} style={styles.thumbImage} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.heading}>Timelapse</Text>

        {!isActive && (
          <>
            <Text style={styles.subtitle}>Mod seçin ve başlatın</Text>

            <View style={styles.modeRow}>
              <TouchableOpacity
                style={[
                  styles.modeCard,
                  store.mode === 'quick' && styles.modeCardActive,
                ]}
                onPress={() => store.setMode('quick')}
              >
                <Ionicons name="flash" size={28} color={store.mode === 'quick' ? '#818cf8' : '#64748b'} />
                <Text style={[styles.modeTitle, store.mode === 'quick' && styles.modeTitleActive]}>
                  Hızlı Mod
                </Text>
                <Text style={styles.modeDesc}>
                  G-code değişikliği yok. API dinleyerek fotoğraf çeker. Kafa görünebilir.
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modeCard,
                  store.mode === 'clean' && styles.modeCardActive,
                ]}
                onPress={() => store.setMode('clean')}
              >
                <Ionicons name="sparkles" size={28} color={store.mode === 'clean' ? '#818cf8' : '#64748b'} />
                <Text style={[styles.modeTitle, store.mode === 'clean' && styles.modeTitleActive]}>
                  Temiz Mod
                </Text>
                <Text style={styles.modeDesc}>
                  G-code'u modify edin (G-code sekmesi). Kafa park eder, profesyonel sonuç.
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.startButton, !canStart && styles.startButtonDisabled]}
              onPress={() => startTimelapse(store.mode)}
              disabled={!canStart}
            >
              <Ionicons name="play" size={22} color="#fff" />
              <Text style={styles.startButtonText}>Timelapse Başlat</Text>
            </TouchableOpacity>

            {!store.isPrinterTested || !store.isCameraTested ? (
              <Text style={styles.warningText}>
                Önce "Bağlantı" sekmesinden yazıcı ve kamerayı test edin
              </Text>
            ) : null}
          </>
        )}

        {isActive && (
          <>
            <View style={styles.activeBanner}>
              <Ionicons name="radio" size={16} color="#22c55e" />
              <Text style={styles.activeText}>
                Timelapse aktif. Uygulamadan çıkabilirsiniz, arka planda çalışmaya devam eder.
              </Text>
            </View>

            <View style={styles.liveSection}>
              <LayerIndicator
                currentLayer={store.currentLayer}
                totalLayers={store.totalLayers}
              />
            </View>

            <PrintProgress
              state={store.printState}
              progress={progress}
              currentLayer={store.currentLayer}
              totalLayers={store.totalLayers}
              photoCount={store.capturedPhotos.length}
            />

            {store.streamUrl ? (
              <View style={styles.previewSection}>
                <Text style={styles.sectionTitle}>Canlı Kamera</Text>
                <CameraPreview
                  url={store.streamUrl}
                  isStream
                  width={280}
                  height={210}
                />
              </View>
            ) : null}

            {store.capturedPhotos.length > 0 && (
              <View style={styles.thumbSection}>
                <Text style={styles.sectionTitle}>
                  Son Fotoğraflar ({store.capturedPhotos.length})
                </Text>
                <FlatList
                  data={[...store.capturedPhotos].reverse().slice(0, 20)}
                  renderItem={renderPhotoItem}
                  keyExtractor={(_, i) => `${i}`}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.thumbList}
                />
              </View>
            )}

            <TouchableOpacity
              style={styles.stopButton}
              onPress={() => {
                Alert.alert(
                  'Timelapse Durdur',
                  'Timelapse durdurmak istediğinize emin misiniz?',
                  [
                    { text: 'İptal', style: 'cancel' },
                    {
                      text: 'Durdur',
                      style: 'destructive',
                      onPress: () => stopTimelapse(false),
                    },
                  ]
                );
              }}
            >
              <Ionicons name="stop" size={22} color="#fff" />
              <Text style={styles.stopButtonText}>Timelapse Durdur</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
      <Modal
        visible={!!previewUri}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewUri(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setPreviewUri(null)}>
          <View style={styles.modalImageContainer}>
            {previewUri && (
              <Image
                source={{ uri: previewUri }}
                style={styles.modalImage}
                resizeMode="contain"
              />
            )}
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  scroll: {
    padding: 16,
    paddingBottom: 40,
  },
  heading: {
    color: '#f1f5f9',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 4,
  },
  subtitle: {
    color: '#64748b',
    fontSize: 14,
    marginBottom: 20,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  modeCard: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: '#334155',
    alignItems: 'center',
  },
  modeCardActive: {
    borderColor: '#818cf8',
    backgroundColor: '#1e1b4b',
  },
  modeTitle: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 6,
  },
  modeTitleActive: {
    color: '#c7d2fe',
  },
  modeDesc: {
    color: '#64748b',
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#22c55e',
    borderRadius: 14,
    paddingVertical: 14,
    gap: 8,
    marginBottom: 12,
  },
  startButtonDisabled: {
    opacity: 0.4,
  },
  startButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  warningText: {
    color: '#f59e0b',
    fontSize: 12,
    textAlign: 'center',
  },
  activeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#052e16',
    borderRadius: 10,
    padding: 10,
    gap: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#16a34a',
  },
  activeText: {
    color: '#bbf7d0',
    fontSize: 12,
    flex: 1,
  },
  liveSection: {
    alignItems: 'center',
    marginBottom: 16,
  },
  previewSection: {
    alignItems: 'center',
    marginTop: 16,
  },
  sectionTitle: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  thumbSection: {
    marginTop: 16,
  },
  thumbList: {
    flexGrow: 0,
  },
  thumbImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 6,
    backgroundColor: '#1e293b',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalImage: {
    width: '90%',
    height: '80%',
  },
  modalImageContainer: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dc2626',
    borderRadius: 14,
    paddingVertical: 14,
    gap: 8,
    marginTop: 24,
  },
  stopButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
