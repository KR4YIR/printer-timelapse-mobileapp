import React from 'react';
import {
  View,
  StyleSheet,
  PanResponder,
  LayoutChangeEvent,
} from 'react-native';

interface Props {
  value: number;
  maxValue: number;
  onValueChange: (value: number) => void;
}

export default function Slider({ value, maxValue, onValueChange }: Props) {
  const [width, setWidth] = React.useState(0);
  const progress = maxValue > 0 ? value / maxValue : 0;

  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const x = evt.nativeEvent.locationX;
        const newVal = Math.max(0, Math.min(maxValue, (x / width) * maxValue));
        onValueChange(newVal);
      },
      onPanResponderMove: (evt) => {
        const x = evt.nativeEvent.locationX;
        const newVal = Math.max(0, Math.min(maxValue, (x / width) * maxValue));
        onValueChange(newVal);
      },
    })
  ).current;

  const onLayout = (e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
  };

  return (
    <View
      style={styles.track}
      onLayout={onLayout}
      {...panResponder.panHandlers}
    >
      <View style={[styles.fill, { width: `${progress * 100}%` }]} />
      <View
        style={[
          styles.thumb,
          { left: `${progress * 100}%`, marginLeft: -8 },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 24,
    justifyContent: 'center',
    marginTop: 8,
    width: '90%',
  },
  fill: {
    height: 4,
    backgroundColor: '#818cf8',
    borderRadius: 2,
  },
  thumb: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#818cf8',
    top: 4,
  },
});
