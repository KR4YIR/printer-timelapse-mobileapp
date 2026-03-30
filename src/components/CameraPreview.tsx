import React, { useState } from 'react';
import { View, Image, StyleSheet, Text, ActivityIndicator } from 'react-native';

interface Props {
  url: string;
  isStream?: boolean;
  width?: number;
  height?: number;
}

export default function CameraPreview({
  url,
  isStream = false,
  width = 320,
  height = 240,
}: Props) {
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  if (!url) {
    return (
      <View style={[styles.container, { width, height }]}>
        <Text style={styles.placeholder}>Kamera URL girilmedi</Text>
      </View>
    );
  }

  const imageUri = isStream ? url : `${url}${url.includes('?') ? '&' : '?'}_t=${Date.now()}`;

  return (
    <View style={[styles.container, { width, height }]}>
      {loading && (
        <ActivityIndicator style={styles.loader} color="#818cf8" size="large" />
      )}
      {error ? (
        <Text style={styles.errorText}>Kamera bağlantısı kurulamadı</Text>
      ) : (
        <Image
          source={{ uri: imageUri }}
          style={[styles.image, { width, height }]}
          resizeMode="cover"
          onLoad={() => {
            setLoading(false);
            setError(false);
          }}
          onError={() => {
            setLoading(false);
            setError(true);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    borderRadius: 12,
  },
  loader: {
    position: 'absolute',
  },
  placeholder: {
    color: '#64748b',
    fontSize: 14,
  },
  errorText: {
    color: '#f87171',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
});
