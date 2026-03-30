import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTimelapseStore } from '../../src/stores/useTimelapseStore';
import { detectPrinterType, testCameraConnection } from '../../src/services/printer';
import ConnectionCard from '../../src/components/ConnectionCard';
import CameraPreview from '../../src/components/CameraPreview';

type TestStatus = 'idle' | 'testing' | 'success' | 'error';

export default function SetupScreen() {
  const store = useTimelapseStore();
  const [printerStatus, setPrinterStatus] = useState<TestStatus>('idle');
  const [cameraStatus, setCameraStatus] = useState<TestStatus>('idle');
  const [printerMessage, setPrinterMessage] = useState('');
  const [cameraMessage, setCameraMessage] = useState('');

  const testPrinter = async () => {
    if (!store.printerUrl.trim()) {
      setPrinterMessage('URL giriniz');
      setPrinterStatus('error');
      return;
    }

    setPrinterStatus('testing');
    setPrinterMessage('');

    const result = await detectPrinterType(store.printerUrl.trim());

    if (result.success && result.printerType) {
      setPrinterStatus('success');
      setPrinterMessage(
        `${result.message}${result.firmwareInfo ? ` (${result.firmwareInfo})` : ''}`
      );
      store.setPrinterType(result.printerType);
      store.setPrinterTested(true, result.firmwareInfo);
      store.persistSettings();
    } else {
      setPrinterStatus('error');
      setPrinterMessage(result.message);
      store.setPrinterTested(false);
    }
  };

  const testCamera = async () => {
    if (!store.cameraUrl.trim()) {
      setCameraMessage('URL giriniz');
      setCameraStatus('error');
      return;
    }

    setCameraStatus('testing');
    setCameraMessage('');

    const result = await testCameraConnection(store.cameraUrl.trim());

    if (result.success) {
      setCameraStatus('success');
      setCameraMessage(result.message);
      store.setCameraTested(true);
      store.persistSettings();
    } else {
      setCameraStatus('error');
      setCameraMessage(result.message);
      store.setCameraTested(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.heading}>Bağlantı Kurulumu</Text>
          <Text style={styles.subtitle}>
            Yazıcı ve kamera bilgilerini girerek başlayın
          </Text>

          <ConnectionCard
            title="Yazıcı (Moonraker / OctoPrint)"
            icon="print"
            status={printerStatus}
            message={printerMessage}
            onTest={testPrinter}
          >
            <TextInput
              style={styles.input}
              value={store.printerUrl}
              onChangeText={store.setPrinterUrl}
              placeholder="http://192.168.1.100"
              placeholderTextColor="#475569"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            {store.printerType === 'octoprint' && (
              <TextInput
                style={[styles.input, { marginTop: 8 }]}
                value={store.apiKey}
                onChangeText={store.setApiKey}
                placeholder="OctoPrint API Key (opsiyonel)"
                placeholderTextColor="#475569"
                autoCapitalize="none"
                autoCorrect={false}
              />
            )}
          </ConnectionCard>

          <ConnectionCard
            title="Fotoğraf Çekme URL"
            icon="camera"
            status={cameraStatus}
            message={cameraMessage}
            onTest={testCamera}
          >
            <TextInput
              style={styles.input}
              value={store.cameraUrl}
              onChangeText={store.setCameraUrl}
              placeholder="http://192.168.1.21:8080/photo.jpg"
              placeholderTextColor="#475569"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <Text style={styles.inputHint}>
              Her katman değişiminde bu URL'den tek fotoğraf çekilir
            </Text>
          </ConnectionCard>

          <View style={styles.streamCard}>
            <View style={styles.streamHeader}>
              <Text style={styles.streamTitle}>Canlı İzleme URL (opsiyonel)</Text>
            </View>
            <TextInput
              style={styles.input}
              value={store.streamUrl}
              onChangeText={(url) => {
                store.setStreamUrl(url);
                store.persistSettings();
              }}
              placeholder="http://192.168.1.21:8080/video"
              placeholderTextColor="#475569"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <Text style={styles.inputHint}>
              MJPEG stream URL'si. Girilirse timelapse sırasında canlı görüntü gösterilir.
              Boş bırakılabilir.
            </Text>
          </View>

          {store.streamUrl ? (
            <View style={styles.previewSection}>
              <Text style={styles.sectionTitle}>Canlı Önizleme</Text>
              <CameraPreview
                url={store.streamUrl}
                isStream
                width={320}
                height={240}
              />
            </View>
          ) : null}

          {store.isPrinterTested && store.isCameraTested && (
            <View style={styles.readyBanner}>
              <Text style={styles.readyText}>
                Her şey hazır! "Timelapse" sekmesine geçerek başlayabilirsiniz.
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  flex: {
    flex: 1,
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
    marginBottom: 24,
  },
  input: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#f1f5f9',
    fontSize: 14,
  },
  inputHint: {
    color: '#475569',
    fontSize: 11,
    marginTop: 6,
    lineHeight: 16,
  },
  streamCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  streamHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  streamTitle: {
    color: '#f1f5f9',
    fontSize: 16,
    fontWeight: '600',
  },
  previewSection: {
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  readyBanner: {
    backgroundColor: '#065f46',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#059669',
  },
  readyText: {
    color: '#a7f3d0',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});
