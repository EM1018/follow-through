import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { colors, fontSize, spacing } from '@/theme';

import { LOG_LOAD_ERROR_MESSAGE } from './logCopy';

/** Inline, retryable load error for the log query -- fixed copy, unlike ScheduleErrorState's per-error-kind text. */
export function LogErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>{LOG_LOAD_ERROR_MESSAGE}</Text>
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
