import { StyleSheet, View } from 'react-native';

import { Skeleton } from '@/components/Skeleton';
import { minRowHeight, radius, spacing } from '@/theme';

/** One header block and four row blocks, using the existing skeleton primitive. */
export function LogSkeleton() {
  return (
    <View style={styles.container}>
      <Skeleton style={styles.header} />
      <Skeleton style={styles.row} />
      <Skeleton style={styles.row} />
      <Skeleton style={styles.row} />
      <Skeleton style={styles.row} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  header: {
    width: '40%',
    height: spacing.md,
    marginBottom: spacing.xs,
  },
  row: {
    height: minRowHeight.day,
    borderRadius: radius.md,
  },
});
