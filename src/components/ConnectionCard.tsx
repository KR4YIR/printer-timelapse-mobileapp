import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  status: 'idle' | 'testing' | 'success' | 'error';
  message?: string;
  onTest: () => void;
  children?: React.ReactNode;
}

export default function ConnectionCard({
  title,
  icon,
  status,
  message,
  onTest,
  children,
}: Props) {
  const statusColors = {
    idle: '#64748b',
    testing: '#f59e0b',
    success: '#22c55e',
    error: '#ef4444',
  };

  const statusLabels = {
    idle: 'Test edilmedi',
    testing: 'Test ediliyor...',
    success: 'Bağlı',
    error: 'Hata',
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name={icon} size={22} color="#818cf8" />
        <Text style={styles.title}>{title}</Text>
        <View style={[styles.statusDot, { backgroundColor: statusColors[status] }]} />
        <Text style={[styles.statusText, { color: statusColors[status] }]}>
          {statusLabels[status]}
        </Text>
      </View>

      {children}

      {message ? (
        <Text
          style={[
            styles.message,
            { color: status === 'error' ? '#f87171' : '#94a3b8' },
          ]}
        >
          {message}
        </Text>
      ) : null}

      <TouchableOpacity
        style={[styles.testButton, status === 'testing' && styles.testButtonDisabled]}
        onPress={onTest}
        disabled={status === 'testing'}
        activeOpacity={0.7}
      >
        {status === 'testing' ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <Ionicons name="flash" size={16} color="#fff" />
            <Text style={styles.testButtonText}>Bağlantıyı Test Et</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    color: '#f1f5f9',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
    flex: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  message: {
    fontSize: 12,
    marginTop: 8,
    marginBottom: 4,
  },
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366f1',
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 12,
    gap: 6,
  },
  testButtonDisabled: {
    opacity: 0.6,
  },
  testButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
});
