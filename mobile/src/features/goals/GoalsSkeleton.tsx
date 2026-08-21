import { StyleSheet, View } from 'react-native';

import { Skeleton } from '@/components/Skeleton';
import { radius, spacing } from '@/theme';

/** One expanded-card-shaped block, then two collapsed-row-shaped blocks -- matches the real populated layout's shape. */
export function GoalsSkeleton() {
  return (
    <View style={styles.container}>
      <Skeleton style={styles.expanded} />
      <Skeleton style={styles.collapsed} />
      <Skeleton style={styles.collapsed} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
    paddingTop: spacing.md,
  },
  expanded: {
    height: 180,
    borderRadius: radius.lg,
  },
  collapsed: {
    height: 64,
    borderRadius: radius.lg,
  },
});
