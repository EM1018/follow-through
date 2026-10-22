import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { colors, fontSize, radius, spacing } from '@/theme';

import { fieldStyles } from '@/features/logs/fieldStyles';

import { GO_TO_PROFILE_LABEL, sendToMessage, type SendToProblem } from './sendTo';

export const SEND_TO_PLACEHOLDER = 'Username (optional)';
export const SEND_TO_HINT = 'Leave empty for a solo goal.';

/**
 * "Send to": the optional last row. A username here makes the save a
 * challenge; empty, the sheet creates a goal exactly as before. Input is
 * kept as typed -- usernames keep their capitals, and the server matches
 * them without regard to case.
 */
export function SendToField({
  value,
  onChange,
  onBlur,
  problem,
  onGoToProfile,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  problem: SendToProblem | null;
  onGoToProfile: () => void;
}) {
  const name = value.trim();
  return (
    <View style={fieldStyles.field}>
      <Text style={fieldStyles.label}>Send to</Text>
      <TextInput
        style={[styles.input, problem !== null && problem !== 'username_required' && styles.inputError]}
        value={value}
        onChangeText={onChange}
        onBlur={onBlur}
        placeholder={SEND_TO_PLACEHOLDER}
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Send to"
      />
      {problem === 'username_required' ? (
        // A soft gate, not an error: muted, with the way out right here.
        <View style={styles.gate}>
          <Text style={styles.hint}>{sendToMessage(problem, name)}</Text>
          <Button label={GO_TO_PROFILE_LABEL} variant="ghost" onPress={onGoToProfile} />
        </View>
      ) : problem !== null ? (
        <Text style={styles.error}>{sendToMessage(problem, name)}</Text>
      ) : (
        <Text style={styles.hint}>{SEND_TO_HINT}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
    color: colors.text,
  },
  inputError: {
    borderColor: colors.danger,
  },
  hint: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  error: {
    fontSize: fontSize.xs,
    color: colors.danger,
  },
  gate: {
    gap: spacing.xs,
    alignItems: 'flex-start',
  },
});
