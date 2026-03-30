import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { readAsStringAsync, writeAsStringAsync, cacheDirectory } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { useTimelapseStore } from '../../src/stores/useTimelapseStore';
import {
  modifyGcode,
  analyzeGcode,
  type GcodeAnalysis,
  type ModifyResult,
} from '../../src/utils/gcodeModifier';
import {
  listGcodeFiles,
  downloadGcodeFile,
  uploadGcodeFile,
  uploadGcodeFileDetailed,
  startPrintJob,
} from '../../src/services/moonraker';
import { uploadGcodeFileAndPrint } from '../../src/services/octoprint';
import type { GcodeFileInfo } from '../../src/types';

export default function GcodeScreen() {
  const store = useTimelapseStore();
  const [fileName, setFileName] = useState<string | null>(null);
  const [rawGcode, setRawGcode] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<GcodeAnalysis | null>(null);
  const [modifyResult, setModifyResult] = useState<ModifyResult | null>(null);
  const [processing, setProcessing] = useState(false);

  const [printerFilesVisible, setPrinterFilesVisible] = useState(false);
  const [printerFiles, setPrinterFiles] = useState<GcodeFileInfo[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [printingLocal, setPrintingLocal] = useState(false);

  const isMoonraker = store.printerType === 'moonraker';
  const isOctoPrint = store.printerType === 'octoprint';

  const runLocalPrint = async (uri: string, name: string) => {
    if (!store.printerUrl) return;

    setPrintingLocal(true);
    try {
      if (isMoonraker) {
        const content = await readAsStringAsync(uri);
        const uploadName = name.split(/[/\\]/).pop() ?? name;
        const up = await uploadGcodeFileDetailed(store.printerUrl, uploadName, content);
        if (!up.ok) {
          Alert.alert('Yükleme hatası', up.error ?? 'Dosya yüklenemedi');
          return;
        }
        const start = await startPrintJob(store.printerUrl, uploadName);
        if (!start.ok) {
          Alert.alert('Baskı başlatılamadı', start.error ?? 'Bilinmeyen hata');
          return;
        }
        Alert.alert('Baskı başladı', `"${uploadName}" yazıcıda çalışıyor.`);
      } else if (isOctoPrint) {
        const r = await uploadGcodeFileAndPrint(
          store.printerUrl,
          store.apiKey,
          uri,
          name.split(/[/\\]/).pop() ?? name
        );
        if (!r.ok) {
          Alert.alert('Hata', r.error ?? 'Yükleme veya baskı başarısız');
          return;
        }
        Alert.alert('Baskı başladı', `"${name}" OctoPrint üzerinde başlatıldı.`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'İşlem hatası';
      Alert.alert('Hata', msg);
    } finally {
      setPrintingLocal(false);
    }
  };

  const pickFileAndPrint = async () => {
    if (!store.printerUrl) {
      Alert.alert('Hata', 'Önce Bağlantı sekmesinden yazıcı URL\'sini kaydedin');
      return;
    }
    if (isOctoPrint && !store.apiKey.trim()) {
      Alert.alert('Hata', 'OctoPrint için API anahtarı gerekli (Bağlantı sekmesi)');
      return;
    }
    if (!isMoonraker && !isOctoPrint) {
      Alert.alert('Hata', 'Önce yazıcı tipini doğrulayın (Bağlantı sekmesi)');
      return;
    }

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const file = result.assets[0];
      const n = file.name ?? 'dosya.gcode';
      if (!n.endsWith('.gcode') && !n.endsWith('.g')) {
        Alert.alert('Hata', 'Lütfen .gcode veya .g uzantılı dosya seçin');
        return;
      }

      Alert.alert(
        'Yazdırmayı başlat',
        `"${n}" yazıcıya yüklenecek ve baskı hemen başlayacak. Onaylıyor musunuz?`,
        [
          { text: 'İptal', style: 'cancel' },
          {
            text: 'Başlat',
            style: 'destructive',
            onPress: () => runLocalPrint(file.uri, n),
          },
        ]
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Dosya seçilemedi';
      Alert.alert('Hata', msg);
    }
  };

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const file = result.assets[0];
      if (!file.name?.endsWith('.gcode') && !file.name?.endsWith('.g')) {
        Alert.alert('Hata', 'Lütfen .gcode veya .g uzantılı dosya seçin');
        return;
      }

      setFileName(file.name);
      setModifyResult(null);

      const content = await readAsStringAsync(file.uri);
      setRawGcode(content);

      const analyzed = analyzeGcode(content);
      setAnalysis(analyzed);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Dosya okunamadı';
      Alert.alert('Hata', msg);
    }
  };

  const openPrinterFiles = async () => {
    if (!store.printerUrl) {
      Alert.alert('Hata', 'Önce yazıcı bağlantısını kurun');
      return;
    }

    setLoadingFiles(true);
    setPrinterFilesVisible(true);
    try {
      const files = await listGcodeFiles(store.printerUrl);
      setPrinterFiles(files);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Dosya listesi alınamadı';
      Alert.alert('Hata', msg);
      setPrinterFilesVisible(false);
    } finally {
      setLoadingFiles(false);
    }
  };

  const selectPrinterFile = async (file: GcodeFileInfo) => {
    setDownloading(true);
    try {
      const content = await downloadGcodeFile(store.printerUrl, file.path);
      const name = file.path.split('/').pop() ?? file.path;
      setFileName(name);
      setRawGcode(content);
      setModifyResult(null);

      const analyzed = analyzeGcode(content);
      setAnalysis(analyzed);

      setPrinterFilesVisible(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Dosya indirilemedi';
      Alert.alert('Hata', msg);
    } finally {
      setDownloading(false);
    }
  };

  const processGcode = async () => {
    if (!rawGcode) return;

    setProcessing(true);
    try {
      await new Promise((r) => setTimeout(r, 100));

      const result = modifyGcode(rawGcode, store.gcodeOptions);
      setModifyResult(result);

      Alert.alert(
        'G-code Hazır',
        `${result.layersModified} katman modify edildi.`
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'İşlem hatası';
      Alert.alert('Hata', msg);
    } finally {
      setProcessing(false);
    }
  };

  const shareModifiedGcode = async () => {
    if (!modifyResult || !fileName) return;

    try {
      const outName = fileName.replace(/\.(gcode|g)$/, '_timelapse.$1');
      const outPath = `${cacheDirectory}${outName}`;
      await writeAsStringAsync(outPath, modifyResult.gcode);

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(outPath);
      } else {
        Alert.alert('Bilgi', `Dosya kaydedildi: ${outPath}`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Paylaşım hatası';
      Alert.alert('Hata', msg);
    }
  };

  const uploadToPrinter = async () => {
    if (!modifyResult || !fileName) return;

    setUploading(true);
    try {
      const outName = fileName.replace(/\.(gcode|g)$/, '_timelapse.$1');
      const success = await uploadGcodeFile(store.printerUrl, outName, modifyResult.gcode);
      if (success) {
        Alert.alert('Yüklendi', `"${outName}" yazıcıya yüklendi.`);
      } else {
        Alert.alert('Hata', 'Yükleme başarısız oldu');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Yükleme hatası';
      Alert.alert('Hata', msg);
    } finally {
      setUploading(false);
    }
  };

  const renderFileItem = ({ item }: { item: GcodeFileInfo }) => {
    const name = item.path.split('/').pop() ?? item.path;
    const date = new Date(item.modified * 1000).toLocaleDateString('tr-TR');
    const size = item.size < 1024 * 1024
      ? `${(item.size / 1024).toFixed(0)} KB`
      : `${(item.size / (1024 * 1024)).toFixed(1)} MB`;

    return (
      <TouchableOpacity
        style={styles.fileItem}
        onPress={() => selectPrinterFile(item)}
        disabled={downloading}
      >
        <Ionicons name="document-text" size={24} color="#818cf8" />
        <View style={styles.fileInfo}>
          <Text style={styles.fileName} numberOfLines={1}>{name}</Text>
          <Text style={styles.fileMeta}>{date} • {size}</Text>
        </View>
        {downloading ? (
          <ActivityIndicator size="small" color="#818cf8" />
        ) : (
          <Ionicons name="download-outline" size={20} color="#64748b" />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.heading}>G-code Modifier</Text>
        <Text style={styles.subtitle}>
          "Temiz Mod" için G-code dosyanızı modify edin. Her katman değişiminde
          baskı kafası park pozisyonuna gider.
        </Text>

        <View style={styles.printLocalCard}>
          <View style={styles.printLocalHeader}>
            <Ionicons name="print" size={22} color="#22c55e" />
            <Text style={styles.printLocalTitle}>Yerel dosyadan yazdır</Text>
          </View>
          <Text style={styles.printLocalDesc}>
            Telefondaki G-code dosyasını yazıcıya yükleyip baskıyı başlatır (Moonraker:
            yükle + print start; OctoPrint: tek adımda yükle ve yazdır).
          </Text>
          <TouchableOpacity
            style={[styles.printLocalButton, printingLocal && styles.printLocalButtonDisabled]}
            onPress={pickFileAndPrint}
            disabled={printingLocal || !store.printerUrl}
          >
            {printingLocal ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="cloud-upload" size={18} color="#fff" />
            )}
            <Text style={styles.printLocalButtonText}>
              {printingLocal ? 'Gönderiliyor...' : 'Dosya seç ve yazdır'}
            </Text>
          </TouchableOpacity>
          {!store.printerUrl ? (
            <Text style={styles.printLocalHint}>Önce yazıcı bağlantısını kaydedin.</Text>
          ) : null}
        </View>

        <View style={styles.sourceRow}>
          <TouchableOpacity style={styles.sourceButton} onPress={pickFile}>
            <Ionicons name="document-attach" size={20} color="#94a3b8" />
            <Text style={styles.sourceButtonText}>Dosyadan Seç</Text>
          </TouchableOpacity>

          {isMoonraker && (
            <TouchableOpacity style={styles.sourceButton} onPress={openPrinterFiles}>
              <Ionicons name="print" size={20} color="#94a3b8" />
              <Text style={styles.sourceButtonText}>Yazıcıdan Seç</Text>
            </TouchableOpacity>
          )}
        </View>

        {fileName && (
          <View style={styles.selectedFileCard}>
            <Ionicons name="checkmark-circle" size={18} color="#22c55e" />
            <Text style={styles.selectedFileName} numberOfLines={1}>{fileName}</Text>
          </View>
        )}

        {analysis && (
          <View style={styles.analysisCard}>
            <Text style={styles.cardTitle}>Dosya Analizi</Text>
            <View style={styles.analysisRow}>
              <AnalysisItem label="Katman" value={`${analysis.layerCount}`} />
              <AnalysisItem label="Yükseklik" value={`${analysis.maxZ.toFixed(1)}mm`} />
              <AnalysisItem label="Dilimleyici" value={analysis.slicer} />
            </View>
            <AnalysisItem
              label="Satır sayısı"
              value={analysis.lineCount.toLocaleString()}
            />
          </View>
        )}

        <View style={styles.settingsCard}>
          <Text style={styles.cardTitle}>Park Ayarları</Text>

          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Park X</Text>
            <TextInput
              style={styles.settingInput}
              value={String(store.gcodeOptions.parkX)}
              onChangeText={(v) => store.setGcodeOptions({ parkX: Number(v) || 0 })}
              keyboardType="numeric"
            />
          </View>

          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Park Y</Text>
            <TextInput
              style={styles.settingInput}
              value={String(store.gcodeOptions.parkY)}
              onChangeText={(v) => store.setGcodeOptions({ parkY: Number(v) || 0 })}
              keyboardType="numeric"
            />
          </View>

          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Z Hop (mm)</Text>
            <TextInput
              style={styles.settingInput}
              value={String(store.gcodeOptions.parkZHop)}
              onChangeText={(v) =>
                store.setGcodeOptions({ parkZHop: Number(v) || 0 })
              }
              keyboardType="numeric"
            />
          </View>

          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Bekleme (ms)</Text>
            <TextInput
              style={styles.settingInput}
              value={String(store.gcodeOptions.dwellMs)}
              onChangeText={(v) =>
                store.setGcodeOptions({ dwellMs: Number(v) || 0 })
              }
              keyboardType="numeric"
            />
          </View>

          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Retract (mm)</Text>
            <TextInput
              style={styles.settingInput}
              value={String(store.gcodeOptions.retractLength)}
              onChangeText={(v) =>
                store.setGcodeOptions({ retractLength: Number(v) || 0 })
              }
              keyboardType="numeric"
            />
          </View>
        </View>

        {rawGcode && (
          <TouchableOpacity
            style={[styles.processButton, processing && styles.processButtonDisabled]}
            onPress={processGcode}
            disabled={processing}
          >
            <Ionicons name="construct" size={20} color="#fff" />
            <Text style={styles.processButtonText}>
              {processing ? 'İşleniyor...' : 'G-code Modify Et'}
            </Text>
          </TouchableOpacity>
        )}

        {modifyResult && (
          <View style={styles.resultCard}>
            <Text style={styles.cardTitle}>Sonuç</Text>
            <Text style={styles.resultText}>
              {modifyResult.layersModified} katman modify edildi
            </Text>
            <Text style={styles.resultDetail}>
              {modifyResult.originalLineCount.toLocaleString()} →{' '}
              {modifyResult.modifiedLineCount.toLocaleString()} satır
            </Text>

            <View style={styles.resultActions}>
              <TouchableOpacity style={styles.shareButton} onPress={shareModifiedGcode}>
                <Ionicons name="share" size={18} color="#fff" />
                <Text style={styles.shareButtonText}>Paylaş</Text>
              </TouchableOpacity>

              {isMoonraker && (
                <TouchableOpacity
                  style={[styles.uploadButton, uploading && styles.uploadButtonDisabled]}
                  onPress={uploadToPrinter}
                  disabled={uploading}
                >
                  {uploading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="cloud-upload" size={18} color="#fff" />
                  )}
                  <Text style={styles.shareButtonText}>
                    {uploading ? 'Yükleniyor...' : 'Yazıcıya Yükle'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Printer files modal */}
      <Modal
        visible={printerFilesVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setPrinterFilesVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Yazıcıdaki G-code Dosyaları</Text>
              <TouchableOpacity onPress={() => setPrinterFilesVisible(false)}>
                <Ionicons name="close" size={24} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            {loadingFiles ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#818cf8" />
                <Text style={styles.loadingText}>Dosyalar yükleniyor...</Text>
              </View>
            ) : printerFiles.length === 0 ? (
              <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>Dosya bulunamadı</Text>
              </View>
            ) : (
              <FlatList
                data={printerFiles}
                renderItem={renderFileItem}
                keyExtractor={(item) => item.path}
                contentContainerStyle={styles.fileList}
              />
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function AnalysisItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.analysisItem}>
      <Text style={styles.analysisValue}>{value}</Text>
      <Text style={styles.analysisLabel}>{label}</Text>
    </View>
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
    lineHeight: 20,
  },
  printLocalCard: {
    backgroundColor: '#14532d',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#166534',
  },
  printLocalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  printLocalTitle: {
    color: '#bbf7d0',
    fontSize: 16,
    fontWeight: '700',
  },
  printLocalDesc: {
    color: '#86efac',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 14,
  },
  printLocalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16a34a',
    borderRadius: 12,
    paddingVertical: 12,
    gap: 8,
  },
  printLocalButtonDisabled: {
    opacity: 0.6,
  },
  printLocalButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  printLocalHint: {
    color: '#86efac',
    fontSize: 11,
    marginTop: 8,
  },
  sourceRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  sourceButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 14,
    paddingVertical: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: '#334155',
    borderStyle: 'dashed',
  },
  sourceButtonText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
  selectedFileCard: {
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
  selectedFileName: {
    color: '#bbf7d0',
    fontSize: 13,
    flex: 1,
  },
  analysisCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardTitle: {
    color: '#f1f5f9',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  analysisRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  analysisItem: {
    alignItems: 'center',
  },
  analysisValue: {
    color: '#c7d2fe',
    fontSize: 16,
    fontWeight: '700',
  },
  analysisLabel: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2,
  },
  settingsCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  settingLabel: {
    color: '#94a3b8',
    fontSize: 14,
  },
  settingInput: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    color: '#f1f5f9',
    fontSize: 14,
    width: 80,
    textAlign: 'center',
  },
  processButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366f1',
    borderRadius: 14,
    paddingVertical: 14,
    gap: 8,
    marginBottom: 16,
  },
  processButtonDisabled: {
    opacity: 0.5,
  },
  processButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  resultCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  resultText: {
    color: '#22c55e',
    fontSize: 14,
    fontWeight: '600',
  },
  resultDetail: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 4,
    marginBottom: 12,
  },
  resultActions: {
    flexDirection: 'row',
    gap: 10,
  },
  shareButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0ea5e9',
    borderRadius: 10,
    paddingVertical: 10,
    gap: 6,
  },
  uploadButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#22c55e',
    borderRadius: 10,
    paddingVertical: 10,
    gap: 6,
  },
  uploadButtonDisabled: {
    opacity: 0.5,
  },
  shareButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1e293b',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '75%',
    minHeight: 300,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  modalTitle: {
    color: '#f1f5f9',
    fontSize: 17,
    fontWeight: '700',
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    color: '#64748b',
    fontSize: 14,
    marginTop: 12,
  },
  fileList: {
    padding: 12,
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 12,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    color: '#f1f5f9',
    fontSize: 14,
    fontWeight: '600',
  },
  fileMeta: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2,
  },
});
