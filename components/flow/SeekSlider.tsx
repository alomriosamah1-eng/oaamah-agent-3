import React, { useRef } from 'react';
import { PanResponder, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { withAlpha, CyanNeon } from '@/theme/colors';

interface SeekSliderProps {
  /** 0..1 */
  value: number;
  onSeek: (ratio: number) => void;
  trackHeight?: number;
  thumbSize?: number;
  color?: string;
  disabled?: boolean;
  style?: object;
}

/**
 * Lightweight drag-to-set slider used for the seek bar and the volume control.
 * Captures horizontal pans only, so vertical feed scrolling stays intact.
 */
export function SeekSlider({
  value,
  onSeek,
  trackHeight = 4,
  thumbSize = 12,
  color = CyanNeon,
  disabled = false,
  style,
}: SeekSliderProps) {
  const widthRef = useRef(1);
  const valueRef = useRef(value);
  valueRef.current = value;

  const setFromX = (x: number) => {
    if (widthRef.current <= 0) return;
    const ratio = Math.max(0, Math.min(1, x / widthRef.current));
    onSeek(ratio);
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled,
      onMoveShouldSetPanResponder: (_, g) => !disabled && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderGrant: (evt) => setFromX(evt.nativeEvent.locationX),
      onPanResponderMove: (evt) => setFromX(evt.nativeEvent.locationX),
    })
  ).current;

  const onLayout = (e: LayoutChangeEvent) => {
    widthRef.current = e.nativeEvent.layout.width;
  };

  const clamped = Math.max(0, Math.min(1, value));

  return (
    <View
      {...responder.panHandlers}
      onLayout={onLayout}
      style={[{ height: Math.max(20, thumbSize + 8), justifyContent: 'center' }, style]}>
      <View
        style={{
          height: trackHeight,
          borderRadius: trackHeight / 2,
          backgroundColor: withAlpha('#FFFFFF', 0.25),
          overflow: 'hidden',
        }}>
        <View
          style={{
            height: '100%',
            width: `${clamped * 100}%`,
            borderRadius: trackHeight / 2,
            backgroundColor: color,
          }}
        />
      </View>
      <View
        style={[
          styles.thumb,
          {
            left: `${clamped * 100}%`,
            marginLeft: -thumbSize / 2,
            width: thumbSize,
            height: thumbSize,
            borderRadius: thumbSize / 2,
            backgroundColor: color,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  thumb: {
    position: 'absolute',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
});