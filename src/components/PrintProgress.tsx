import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { PrintState } from '../types';

interface Props {
  state: PrintState;
  progress: number;
  currentLayer: number;
  totalLayers: number;
  photoCount: number;
}

const STATE_LABELS: Record<PrintState, string> = {
  idle: 'Bekleniyor',
  printing: 'Yazdırılıyor',
  paused: 'Duraklatıldı',
  complete: 'Tamamlandı',
  error: 'Hata',
  cancelled: 'İptal edildi',
};

const STATE_COLORS: Record<PrintState, string> = {
  idle: '#64748b',
  printing: '#22c55e',
  paused: '#f59e0b',
  complete: '#818cf8',
  error: '#ef4444',
  cancelled: '#ef4444',
};

export default function PrintProgress({
  state,
  progress,
  currentLayer,
  totalLayers,
  photoCount,
}: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.stateRow}>
        <View style={[styles.stateDot, { backgroundColor: STATE_COLORS[state] }]} />
        <Text style={[styles.stateText, { color: STATE_COLORS[state] }]}>
          {STATE_LABELS[state]}
        </Text>
      </View>

      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${Math.min(progress, 100)}%` }]} />
      </View>
      <Text style={styles.progressText}>{progress}%</Text>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>
            {currentLayer}
            {totalLayers > 0 ? ` / ${totalLayers}` : ''}
          </Text>
          <Text style={styles.statLabel}>Katman</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{photoCount}</Text>
          <Text style={styles.statLabel}>Fotoğraf</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  stateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  stateDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  stateText: {
    fontSize: 16,
    fontWeight: '700',
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#334155',
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#818cf8',
  },
  progressText: {
    color: '#94a3b8',
    fontSize: 12,
    textAlign: 'right',
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    color: '#f1f5f9',
    fontSize: 20,
    fontWeight: '700',
  },
  statLabel: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 2,
  },
});
