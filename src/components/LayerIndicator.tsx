import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

interface Props {
  currentLayer: number;
  totalLayers: number;
}

export default function LayerIndicator({ currentLayer, totalLayers }: Props) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (currentLayer > 0) {
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.2,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [currentLayer, scaleAnim]);

  const progress = totalLayers > 0 ? currentLayer / totalLayers : 0;

  return (
    <Animated.View style={[styles.container, { transform: [{ scale: scaleAnim }] }]}>
      <View style={styles.circle}>
        <Text style={styles.layerNumber}>{currentLayer}</Text>
        {totalLayers > 0 && (
          <Text style={styles.totalLayers}>/ {totalLayers}</Text>
        )}
        <Text style={styles.label}>Katman</Text>
      </View>
      {totalLayers > 0 && (
        <View style={styles.miniBar}>
          <View style={[styles.miniBarFill, { width: `${progress * 100}%` }]} />
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  circle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#1e293b',
    borderWidth: 3,
    borderColor: '#818cf8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  layerNumber: {
    color: '#f1f5f9',
    fontSize: 28,
    fontWeight: '800',
  },
  totalLayers: {
    color: '#64748b',
    fontSize: 12,
    marginTop: -2,
  },
  label: {
    color: '#818cf8',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  miniBar: {
    width: 80,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#334155',
    marginTop: 8,
    overflow: 'hidden',
  },
  miniBarFill: {
    height: '100%',
    backgroundColor: '#818cf8',
    borderRadius: 2,
  },
});
