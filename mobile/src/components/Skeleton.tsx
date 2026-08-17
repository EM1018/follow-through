import { StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, radius } from '@/theme';

/** Static muted placeholder block. Used in place of a spinner so surrounding structure stays put while data loads. */
export function Skeleton({ style }: { style?: ViewStyle }) {
  return <View style={[styles.base, style]} />;
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
  },
});
