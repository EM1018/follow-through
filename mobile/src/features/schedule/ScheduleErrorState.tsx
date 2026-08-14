import { StyleSheet, Text, View } from 'react-native';

import { describeApiError, type ApiError } from '@/api/errors';
import { Button } from '@/components/Button';
import { colors, fontSize, spacing } from '@/theme';

/** Inline, retryable error for a schedule query. Never covers the plan header above it. */
export function ScheduleErrorState({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>{describeApiError(error)}</Text>
      <Button label="Retry" onPress={onRetry} variant="secondary" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.md,
  },
  text: {
    fontSize: fontSize.sm,
    color: colors.danger,
    textAlign: 'center',
  },
});
