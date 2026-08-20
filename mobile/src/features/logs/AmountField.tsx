import { StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, fontSize, radius, spacing } from '@/theme';

import { fieldStyles } from './fieldStyles';
import { UnitChips } from './UnitChips';
import type { Unit } from './units';

/**
 * Value input + unit chips, shared by the Log tab's sheet and the schedule's
 * tap-then-add editor -- same nullable-default behaviour in both: leaving the
 * value blank (strength training's case) is a valid, valueless log, not an error.
 */
export function AmountField({
  value,
  unit,
  unitGroups,
  onChangeValue,
  onChangeUnit,
}: {
  value: string;
  unit: Unit | null;
  unitGroups: Unit[][];
  onChangeValue: (value: string) => void;
  onChangeUnit: (unit: Unit) => void;
}) {
  const showUnitChips = value.trim() !== '';

  return (
    <View style={fieldStyles.field}>
      <Text style={fieldStyles.label}>Amount</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeValue}
        placeholder="Leave blank to log without an amount"
        placeholderTextColor={colors.textMuted}
        keyboardType="decimal-pad"
      />
      {showUnitChips ? <UnitChips groups={unitGroups} selected={unit} onSelect={onChangeUnit} /> : null}
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
});
