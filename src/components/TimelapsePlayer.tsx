import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Slider from '../components/Slider';

interface Props {
  frames: string[];
  fps?: number;
  autoPlay?: boolean;
}

export default function TimelapsePlayer({
  frames,
  fps = 30,
  autoPlay = false,
}: Props) {
  const [currentFrame, setCurrentFrame] = useState(0);
  const [playing, setPlaying] = useState(autoPlay);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const width = Dimensions.get('window').width - 32;
  const height = (width * 3) / 4;

  const play = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setCurrentFrame((prev) => {
        if (prev >= frames.length - 1) {
          setPlaying(false);
          return 0;
        }
        return prev + 1;
      });
    }, 1000 / fps);
    setPlaying(true);
  }, [fps, frames.length]);

  const pause = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setPlaying(false);
  }, []);

  useEffect(() => {
    if (autoPlay && frames.length > 0) play();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoPlay, frames.length, play]);

  if (frames.length === 0) {
    return (
      <View style={[styles.container, { width, height }]}>
        <Text style={styles.emptyText}>Henüz fotoğraf yok</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <View style={[styles.container, { width, height }]}>
        <Image
          source={{ uri: frames[currentFrame] }}
          style={{ width, height }}
          resizeMode="cover"
        />
      </View>

      <View style={styles.controls}>
        <TouchableOpacity
          onPress={() => {
            pause();
            setCurrentFrame(0);
          }}
        >
          <Ionicons name="play-skip-back" size={22} color="#94a3b8" />
        </TouchableOpacity>

        <TouchableOpacity onPress={playing ? pause : play}>
          <Ionicons
            name={playing ? 'pause-circle' : 'play-circle'}
            size={44}
            color="#818cf8"
          />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            pause();
            setCurrentFrame(frames.length - 1);
          }}
        >
          <Ionicons name="play-skip-forward" size={22} color="#94a3b8" />
        </TouchableOpacity>
      </View>

      <Slider
        value={currentFrame}
        maxValue={frames.length - 1}
        onValueChange={(v) => {
          pause();
          setCurrentFrame(Math.round(v));
        }}
      />

      <Text style={styles.frameText}>
        {currentFrame + 1} / {frames.length}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
  },
  container: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#64748b',
    fontSize: 14,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    marginTop: 12,
  },
  frameText: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 4,
  },
});
