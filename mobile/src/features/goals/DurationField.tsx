import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { colors, fontSize, fontWeight, radius, spacing } from '@/theme';

import { fieldStyles } from '@/features/logs/fieldStyles';

import type { GoalDuration } from './goalForm';
import { MAX_DURATION_WEEKS, MIN_DURATION_WEEKS } from './goalForm';

/** "For": Weeks (default, with a 1-8 stepper) or Ongoing. Ongoing greys out for a challenge, which must be fixed-length. */
export function DurationField({
  duration,
  onChange,
  ongoingDisabled = false,
}: {
  duration: GoalDuration;
  onChange: (duration: GoalDuration) => void;
  ongoingDisabled?: boolean;
}) {
  const weeks = duration.kind === 'weeks' ? duration.weeks : MIN_DURATION_WEEKS;

  return (
    <View style={fieldStyles.field}>
      <Text style={fieldStyles.label}>For</Text>
      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.toggle, duration.kind === 'weeks' && styles.toggleActive]}
          onPress={() => onChange({ kind: 'weeks', weeks })}
          accessibilityRole="button"
          accessibilityState={{ selected: duration.kind === 'weeks' }}
        >
          <Text style={[styles.toggleText, duration.kind === 'weeks' && styles.toggleTextActive]}>Weeks</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggle, duration.kind === 'ongoing' && styles.toggleActive]}
          onPress={() => onChange({ kind: 'ongoing' })}
          disabled={ongoingDisabled}
          accessibilityRole="button"
          accessibilityState={{ selected: duration.kind === 'ongoing', disabled: ongoingDisabled }}
        >
          <Text
            style={[
              styles.toggleText,
              duration.kind === 'ongoing' && styles.toggleTextActive,
              ongoingDisabled && styles.toggleTextDisabled,
            ]}
          >
            Ongoing
          </Text>
        </TouchableOpacity>
      </View>

      {duration.kind === 'weeks' ? (
        <View style={styles.stepperRow}>
          <TouchableOpacity
            style={styles.stepperButton}
            onPress={() => onChange({ kind: 'weeks', weeks: Math.max(MIN_DURATION_WEEKS, weeks - 1) })}
            disabled={weeks <= MIN_DURATION_WEEKS}
            accessibilityRole="button"
            accessibilityLabel="Fewer weeks"
          >
            <Text style={styles.stepperButtonText}>−</Text>
          </TouchableOpacity>
          <Text style={styles.stepperValue}>{weeks}</Text>
          <TouchableOpacity
            style={styles.stepperButton}
            onPress={() => onChange({ kind: 'weeks', weeks: Math.min(MAX_DURATION_WEEKS, weeks + 1) })}
            disabled={weeks >= MAX_DURATION_WEEKS}
            accessibilityRole="button"
            accessibilityLabel="More weeks"
          >
            <Text style={styles.stepperButtonText}>+</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
  toggleTextDisabled: {
    color: colors.textMuted,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  stepperButton: {
    width: spacing.xl,
    height: spacing.xl,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  stepperButtonText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  stepperValue: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.text,
    minWidth: spacing.xl,
    textAlign: 'center',
  },
});
