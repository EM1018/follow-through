import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { colors, fontSize, fontWeight, radius, spacing } from '@/theme';

import type { ActivityInfo, UnitInfo } from '@/features/logs/activities';
import { groupUnitsByDimension } from '@/features/logs/completionForm';
import { fieldStyles } from '@/features/logs/fieldStyles';
import { UnitChips } from '@/features/logs/UnitChips';

import { isAmountValueDisabled, startSettingTarget, type GoalAmount } from './goalForm';

/**
 * "At least": inert with "-" until an activity is picked (there's no
 * permitted-units set to offer yet), then a real No target / Set one choice
 * -- an untargeted goal is a selection, not a blank the user forgot. The
 * value input stays disabled until a unit is chosen, which is what makes
 * "a value with no unit" unconstructable rather than merely rejected by the
 * API afterward.
 */
export function GoalAmountField({
  activity,
  amount,
  unitInfos,
  onChange,
}: {
  activity: ActivityInfo | null;
  amount: GoalAmount;
  unitInfos: UnitInfo[];
  onChange: (amount: GoalAmount) => void;
}) {
  if (activity === null) {
    return (
      <View style={fieldStyles.field}>
        <Text style={fieldStyles.label}>At least</Text>
        <View style={[styles.inertBox]}>
          <Text style={styles.inertText}>—</Text>
        </View>
      </View>
    );
  }

  const valueDisabled = isAmountValueDisabled({ amount });
  const unitGroups = groupUnitsByDimension(activity.units, unitInfos);

  return (
    <View style={fieldStyles.field}>
      <Text style={fieldStyles.label}>At least</Text>
      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.toggle, amount.kind === 'none' && styles.toggleActive]}
          onPress={() => onChange({ kind: 'none' })}
          accessibilityRole="button"
          accessibilityState={{ selected: amount.kind === 'none' }}
        >
          <Text style={[styles.toggleText, amount.kind === 'none' && styles.toggleTextActive]}>No target</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggle, amount.kind === 'set' && styles.toggleActive]}
          onPress={() => onChange(amount.kind === 'set' ? amount : startSettingTarget(activity))}
          accessibilityRole="button"
          accessibilityState={{ selected: amount.kind === 'set' }}
        >
          <Text style={[styles.toggleText, amount.kind === 'set' && styles.toggleTextActive]}>Set one</Text>
        </TouchableOpacity>
      </View>

      {amount.kind === 'set' ? (
        <>
          <UnitChips
            groups={unitGroups}
            selected={amount.unit}
            onSelect={(unit) => onChange({ kind: 'set', value: amount.value, unit })}
          />
          <TextInput
            style={[styles.input, valueDisabled && styles.inputDisabled]}
            value={amount.value}
            onChangeText={(text) => onChange({ kind: 'set', value: text, unit: amount.unit })}
            editable={!valueDisabled}
            placeholder={valueDisabled ? 'Choose a unit first' : 'Amount'}
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  inertBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceMuted,
  },
  inertText: {
    fontSize: fontSize.md,
    color: colors.textMuted,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  toggle: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  toggleActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  toggleText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.text,
  },
  toggleTextActive: {
    color: colors.background,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
    color: colors.text,
  },
  inputDisabled: {
    backgroundColor: colors.surfaceMuted,
    color: colors.textMuted,
  },
});
