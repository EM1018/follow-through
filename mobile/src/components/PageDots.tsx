import { StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/theme';

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
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  dotActive: {
    backgroundColor: colors.accent,
  },
});
