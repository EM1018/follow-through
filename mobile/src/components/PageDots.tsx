import { StyleSheet, View } from 'react-native';

import { colors, dotSize, spacing } from '@/theme';

type PageDotsProps = {
  count: number;
  activeIndex: number;
};

/** Understated vertical page indicator for the plan stack's paged list. */
export function PageDots({ count, activeIndex }: PageDotsProps) {
  if (count <= 1) {
    return null;
  }
  return (
    <View style={styles.column} pointerEvents="none">
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={[styles.dot, index === activeIndex && styles.dotActive]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  column: {
    position: 'absolute',
    right: spacing.xs,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  dot: {
    width: dotSize.sm,
    height: dotSize.sm,
    borderRadius: dotSize.sm / 2,
    backgroundColor: colors.border,
  },
  dotActive: {
    backgroundColor: colors.accent,
  },
});
