import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';
import * as Sharing from 'expo-sharing';

import { useTimelapseStore } from '../../src/stores/useTimelapseStore';
import { deleteTimelapse } from '../../src/services/camera';
import {
  generateVideo,
  deleteVideo,
  loadSlideshowManifest,
  isNativeVideo,
  type SlideshowManifest,
} from '../../src/services/videoGenerator';
import type { TimelapseRecord, VideoRecord } from '../../src/types';

const FPS_OPTIONS = [10, 15, 24, 30, 60];
const SCREEN_W = Dimensions.get('window').width;
const THUMB_SIZE = (SCREEN_W - 32 - 12) / 4;

function NativeVideoPlayer({ uri }: { uri: string }) {
  const videoRef = useRef<Video>(null);

  return (
    <View style={styles.playerContainer}>
      <Video
        ref={videoRef}
        source={{ uri }}
        style={styles.playerImage}
        resizeMode={ResizeMode.CONTAIN}
        useNativeControls
        isLooping={false}
      />
    </View>
  );
}

function SlideshowPlayer({ manifest }: { manifest: SlideshowManifest }) {
  const [frameIdx, setFrameIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setPlaying(false);
  }, []);

  const play = useCallback(() => {
    stop();
    setFrameIdx(0);
    setPlaying(true);
    timerRef.current = setInterval(() => {
      setFrameIdx((prev) => {
        if (prev >= manifest.frames.length - 1) {
          stop();
          return 0;
        }
        return prev + 1;
      });
    }, 1000 / manifest.fps);
  }, [manifest, stop]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const frameUri = manifest.frames[frameIdx];

  return (
    <View style={styles.playerContainer}>
      <Image
        source={{ uri: frameUri }}
        style={styles.playerImage}
        resizeMode="contain"
      />
      <View style={styles.playerControls}>
        <TouchableOpacity onPress={playing ? stop : play} style={styles.playBtn}>
          <Ionicons name={playing ? 'pause' : 'play'} size={28} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.playerInfo}>
          {frameIdx + 1}/{manifest.frames.length} @ {manifest.fps} FPS
        </Text>
      </View>
    </View>
  );
}

export default function GalleryScreen() {
  const store = useTimelapseStore();
  const [selectedTl, setSelectedTl] = useState<TimelapseRecord | null>(null);
  const [selectedFps, setSelectedFps] = useState(24);
  const [generating, setGenerating] = useState(false);
  const [activeManifest, setActiveManifest] = useState<SlideshowManifest | null>(null);
  const [activeVideoUri, setActiveVideoUri] = useState<string | null>(null);

  const freshTl = selectedTl
    ? store.completedTimelapses.find((t) => t.id === selectedTl.id) ?? selectedTl
    : null;

  const handleDelete = (tl: TimelapseRecord) => {
    Alert.alert(
      'Timelapse Sil',
      `"${tl.name}" silinsin mi? Bu işlem geri alınamaz.`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            await deleteTimelapse(tl.id);
            store.removeTimelapse(tl.id);
            store.persistSettings();
            if (selectedTl?.id === tl.id) setSelectedTl(null);
          },
        },
      ]
    );
  };

  const handleGenerateVideo = async () => {
    if (!freshTl) return;
    setGenerating(true);
    try {
      const result = await generateVideo(freshTl.id, selectedFps);
      if (result.success && result.videoPath) {
        const vid: VideoRecord = {
          id: `vid_${selectedFps}_${Date.now()}`,
          fps: selectedFps,
          path: result.videoPath,
          duration: result.duration,
          fileSize: result.fileSize,
          createdAt: new Date().toISOString(),
        };
        store.addVideoToTimelapse(freshTl.id, vid);
        store.persistSettings();
        const label = result.isNative ? 'MP4 video' : 'slideshow';
        Alert.alert('Hazır', `${selectedFps} FPS ${label} oluşturuldu (${formatDuration(result.duration)})`);
      } else {
        Alert.alert('Hata', result.error ?? 'Oluşturulamadı');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Hata';
      Alert.alert('Hata', msg);
    } finally {
      setGenerating(false);
    }
  };

  const handlePlayVideo = async (vid: VideoRecord) => {
    if (isNativeVideo(vid.path)) {
      setActiveManifest(null);
      setActiveVideoUri(vid.path);
    } else {
      setActiveVideoUri(null);
      const manifest = await loadSlideshowManifest(vid.path);
      if (manifest) {
        setActiveManifest(manifest);
      } else {
        Alert.alert('Hata', 'Video verisi yüklenemedi');
      }
    }
  };

  const handleShareVideo = async (vid: VideoRecord) => {
    if (!isNativeVideo(vid.path)) {
      Alert.alert('Bilgi', 'Sadece MP4 videolar paylaşılabilir');
      return;
    }
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(vid.path, { mimeType: 'video/mp4' });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Paylaşım hatası';
      Alert.alert('Hata', msg);
    }
  };

  const handleSharePhotos = async () => {
    if (!freshTl?.photoPaths.length) return;
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (canShare && freshTl.photoPaths[0]) {
        await Sharing.shareAsync(freshTl.photoPaths[0]);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Paylaşım hatası';
      Alert.alert('Hata', msg);
    }
  };

  const handleDeleteVideo = (vid: VideoRecord) => {
    if (!freshTl) return;
    const label = isNativeVideo(vid.path) ? 'MP4 video' : 'slideshow';
    Alert.alert('Sil', `${vid.fps} FPS ${label} silinsin mi?`, [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          await deleteVideo(vid.path);
          store.removeVideoFromTimelapse(freshTl.id, vid.id);
          store.persistSettings();
          if (activeVideoUri === vid.path) setActiveVideoUri(null);
          if (activeManifest && activeManifest.fps === vid.fps) setActiveManifest(null);
        },
      },
    ]);
  };

  if (freshTl) {
    const videos = freshTl.videos ?? [];

    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              setSelectedTl(null);
              setActiveManifest(null);
              setActiveVideoUri(null);
            }}
          >
            <Ionicons name="arrow-back" size={20} color="#818cf8" />
            <Text style={styles.backText}>Geri</Text>
          </TouchableOpacity>

          <Text style={styles.heading}>{freshTl.name}</Text>
          <Text style={styles.subtitle}>
            {new Date(freshTl.date).toLocaleDateString('tr-TR', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>

          <View style={styles.metaRow}>
            <MetaItem icon="images" label="Fotoğraf" value={`${freshTl.photoCount}`} />
            <MetaItem
              icon={freshTl.mode === 'clean' ? 'sparkles' : 'flash'}
              label="Mod"
              value={freshTl.mode === 'clean' ? 'Temiz' : 'Hızlı'}
            />
            <MetaItem icon="videocam" label="Video" value={`${videos.length}`} />
          </View>

          {/* Video player */}
          {activeVideoUri && (
            <View style={styles.playerSection}>
              <View style={styles.playerHeader}>
                <Text style={styles.sectionTitle}>Video Oynatıcı</Text>
                <TouchableOpacity onPress={() => setActiveVideoUri(null)}>
                  <Ionicons name="close-circle" size={22} color="#64748b" />
                </TouchableOpacity>
              </View>
              <NativeVideoPlayer uri={activeVideoUri} />
            </View>
          )}

          {/* Slideshow player */}
          {activeManifest && !activeVideoUri && (
            <View style={styles.playerSection}>
              <View style={styles.playerHeader}>
                <Text style={styles.sectionTitle}>Slideshow Oynatıcı</Text>
                <TouchableOpacity onPress={() => setActiveManifest(null)}>
                  <Ionicons name="close-circle" size={22} color="#64748b" />
                </TouchableOpacity>
              </View>
              <SlideshowPlayer manifest={activeManifest} />
            </View>
          )}

          {/* Photo grid */}
          <Text style={styles.sectionTitle}>Fotoğraflar</Text>
          <View style={styles.photoGrid}>
            {freshTl.photoPaths.slice(0, 20).map((p, i) => (
              <Image key={i} source={{ uri: p }} style={styles.gridThumb} />
            ))}
            {freshTl.photoPaths.length > 20 && (
              <View style={[styles.gridThumb, styles.moreThumb]}>
                <Text style={styles.moreText}>+{freshTl.photoPaths.length - 20}</Text>
              </View>
            )}
          </View>

          {/* Generate video */}
          <View style={styles.generateSection}>
            <Text style={styles.sectionTitle}>Video Oluştur</Text>
            <View style={styles.fpsRow}>
              {FPS_OPTIONS.map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[styles.fpsChip, selectedFps === f && styles.fpsChipActive]}
                  onPress={() => setSelectedFps(f)}
                >
                  <Text style={[styles.fpsChipText, selectedFps === f && styles.fpsChipTextActive]}>
                    {f} FPS
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.durationHint}>
              Tahmini süre: {formatDuration(freshTl.photoCount / selectedFps)}
            </Text>
            <TouchableOpacity
              style={[styles.generateButton, generating && styles.generateButtonDisabled]}
              onPress={handleGenerateVideo}
              disabled={generating}
            >
              {generating ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name="film" size={20} color="#fff" />
              )}
              <Text style={styles.generateButtonText}>
                {generating ? 'Oluşturuluyor...' : 'Video Oluştur'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Video list */}
          {videos.length > 0 && (
            <View style={styles.videoListSection}>
              <Text style={styles.sectionTitle}>Oluşturulan Videolar</Text>
              {videos.map((vid) => {
                const native = isNativeVideo(vid.path);
                return (
                  <View key={vid.id} style={styles.videoCard}>
                    <View style={styles.videoInfo}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.videoFps}>{vid.fps} FPS</Text>
                        <View style={[styles.videoTypeBadge, native && styles.videoTypeBadgeMp4]}>
                          <Text style={styles.videoTypeBadgeText}>{native ? 'MP4' : 'Slideshow'}</Text>
                        </View>
                      </View>
                      <Text style={styles.videoDuration}>
                        {formatDuration(vid.duration)}
                        {native ? ` • ${formatFileSize(vid.fileSize)}` : ''}
                      </Text>
                    </View>
                    <View style={styles.videoActions}>
                      <TouchableOpacity
                        style={styles.videoActionBtn}
                        onPress={() => handlePlayVideo(vid)}
                      >
                        <Ionicons name="play-circle" size={24} color="#22c55e" />
                      </TouchableOpacity>
                      {native && (
                        <TouchableOpacity
                          style={styles.videoActionBtn}
                          onPress={() => handleShareVideo(vid)}
                        >
                          <Ionicons name="share-outline" size={22} color="#0ea5e9" />
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={styles.videoActionBtn}
                        onPress={() => handleDeleteVideo(vid)}
                      >
                        <Ionicons name="trash-outline" size={22} color="#ef4444" />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Share + Delete */}
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.shareBtn} onPress={handleSharePhotos}>
              <Ionicons name="share-outline" size={18} color="#fff" />
              <Text style={styles.actionBtnText}>Fotoğrafları Paylaş</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.deleteTlButton}
              onPress={() => handleDelete(freshTl)}
            >
              <Ionicons name="trash" size={18} color="#fff" />
              <Text style={styles.actionBtnText}>Sil</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.heading}>Galeri</Text>
        <Text style={styles.subtitle}>
          {store.completedTimelapses.length === 0
            ? 'Henüz timelapse kaydı yok'
            : `${store.completedTimelapses.length} timelapse`}
        </Text>

        {store.completedTimelapses.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="film-outline" size={64} color="#334155" />
            <Text style={styles.emptyText}>
              İlk timelapse'inizi oluşturmak için "Timelapse" sekmesine gidin
            </Text>
          </View>
        )}

        {store.completedTimelapses.map((tl) => (
          <TouchableOpacity
            key={tl.id}
            style={styles.tlCard}
            onPress={() => setSelectedTl(tl)}
            activeOpacity={0.7}
          >
            <View style={styles.tlThumb}>
              {tl.thumbnailPath ? (
                <Image source={{ uri: tl.thumbnailPath }} style={styles.tlThumbImage} />
              ) : (
                <Ionicons name="film" size={28} color="#475569" />
              )}
            </View>
            <View style={styles.tlInfo}>
              <Text style={styles.tlName}>{tl.name}</Text>
              <Text style={styles.tlDate}>
                {new Date(tl.date).toLocaleDateString('tr-TR')}
              </Text>
              <Text style={styles.tlMeta}>
                {tl.photoCount} fotoğraf • {(tl.videos ?? []).length} video • {tl.mode === 'clean' ? 'Temiz' : 'Hızlı'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#475569" />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function MetaItem({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.metaItem}>
      <Ionicons name={icon} size={18} color="#818cf8" />
      <Text style={styles.metaValue}>{value}</Text>
      <Text style={styles.metaLabel}>{label}</Text>
    </View>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 1) return '< 1s';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}dk ${s}s` : `${s}s`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 12,
  },
  backText: {
    color: '#818cf8',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: '#475569',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 16,
    maxWidth: 240,
    lineHeight: 20,
  },
  tlCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  tlThumb: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    marginRight: 12,
  },
  tlThumbImage: {
    width: 56,
    height: 56,
    borderRadius: 10,
  },
  tlInfo: {
    flex: 1,
  },
  tlName: {
    color: '#f1f5f9',
    fontSize: 15,
    fontWeight: '600',
  },
  tlDate: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 2,
  },
  tlMeta: {
    color: '#818cf8',
    fontSize: 11,
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  metaItem: {
    alignItems: 'center',
  },
  metaValue: {
    color: '#f1f5f9',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 4,
  },
  metaLabel: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2,
  },
  sectionTitle: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
    marginTop: 8,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 16,
  },
  gridThumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 8,
    backgroundColor: '#1e293b',
  },
  moreThumb: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  moreText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '700',
  },
  playerSection: {
    marginBottom: 16,
  },
  playerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  playerContainer: {
    backgroundColor: '#000',
    borderRadius: 12,
    overflow: 'hidden',
  },
  playerImage: {
    width: '100%',
    height: 220,
  },
  playerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    gap: 12,
  },
  playBtn: {
    backgroundColor: '#334155',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playerInfo: {
    color: '#94a3b8',
    fontSize: 13,
  },
  generateSection: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 16,
  },
  fpsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  fpsChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
  },
  fpsChipActive: {
    borderColor: '#818cf8',
    backgroundColor: '#1e1b4b',
  },
  fpsChipText: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '600',
  },
  fpsChipTextActive: {
    color: '#c7d2fe',
  },
  durationHint: {
    color: '#64748b',
    fontSize: 12,
    marginBottom: 12,
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingVertical: 12,
    gap: 8,
  },
  generateButtonDisabled: {
    opacity: 0.5,
  },
  generateButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  videoListSection: {
    marginBottom: 16,
  },
  videoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  videoInfo: {
    flex: 1,
  },
  videoFps: {
    color: '#f1f5f9',
    fontSize: 15,
    fontWeight: '700',
  },
  videoDuration: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 2,
  },
  videoTypeBadge: {
    backgroundColor: '#334155',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  videoTypeBadgeMp4: {
    backgroundColor: '#065f46',
  },
  videoTypeBadgeText: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
  },
  videoActions: {
    flexDirection: 'row',
    gap: 12,
  },
  videoActionBtn: {
    padding: 4,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  shareBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0ea5e9',
    borderRadius: 12,
    paddingVertical: 12,
    gap: 6,
  },
  deleteTlButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dc2626',
    borderRadius: 12,
    paddingVertical: 12,
    gap: 6,
  },
  actionBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
});
