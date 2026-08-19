import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { colors, fontSize, fontWeight, minRowHeight, radius, spacing } from '@/theme';

export type DayItemState = 'scheduled' | 'substituted' | 'cancelled';

export type CompletionControl = {
  /** null: not logged (hollow circle). A string: the completion to unlog on tap (filled circle). */
  completionId: string | null;
  onToggle: () => void;
  /** Disables the circle while a log/unlog request is in flight. */
  pending: boolean;
};

type DayItemProps = {
  state: DayItemState;
  name: string;
  /** Already resolved to the right workout (e.g. the replacement's, for a substituted day) by the caller -- this component only decides whether to show it. */
  notes?: string | null;
  /** Substituted only: the name of the workout this day replaced. */
  replacedName?: string | null;
  onPress: () => void;
  /** Present only when this row can be logged right now -- absent hides the leading circle entirely (future days, and cancelled rows never get one at all), not just disables it. */
  completion?: CompletionControl;
};

function visibleNotes(notes: string | null | undefined): string | null {
  if (!notes) {
    return null;
  }
  const trimmed = notes.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * A single scheduled/substituted/cancelled workout row in Day view. Filled
 * with `colors.background` (not `colors.surface`, which the day card itself
 * uses) so each item reads as its own block against the card behind it.
 */
export function DayItem({ state, name, notes, replacedName, onPress, completion }: DayItemProps) {
  const cancelled = state === 'cancelled';
  const substituted = state === 'substituted';
  const notesText = cancelled ? null : visibleNotes(notes);

  return (
    <TouchableOpacity
      style={[styles.row, cancelled && styles.rowCancelled]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={cancelled ? `Manage ${name}, cancelled` : `Manage ${name}`}
    >
      {substituted ? <View style={styles.accentBar} /> : null}
      {completion ? (
        <TouchableOpacity
          style={styles.circleSlot}
          onPress={completion.onToggle}
          disabled={completion.pending}
          accessibilityRole="button"
          accessibilityLabel={completion.completionId !== null ? `Mark ${name} not done` : `Mark ${name} done`}
          accessibilityState={{ disabled: completion.pending, checked: completion.completionId !== null }}
        >
          {/* The fill itself is the optimistic feedback -- pending only dims
              it, rather than swapping in a spinner that would hide the fill
              the tap just produced. */}
          <View
            style={[
              styles.circle,
              completion.completionId !== null ? styles.circleFilled : styles.circleHollow,
              completion.pending && styles.circlePending,
            ]}
          />
        </TouchableOpacity>
      ) : null}
      <View style={styles.content}>
        <Text style={[styles.name, cancelled && styles.nameCancelled]} numberOfLines={1}>
          {name}
        </Text>
        {substituted && replacedName ? <Text style={styles.secondaryLine}>instead of {replacedName}</Text> : null}
        {notesText ? (
          <Text style={styles.notesText} numberOfLines={2}>
            {notesText}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const CIRCLE_SIZE = 22;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: minRowHeight.day,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.background,
  },
  rowCancelled: {
    backgroundColor: colors.surfaceMuted,
    opacity: 0.5,
  },
  accentBar: {
    alignSelf: 'stretch',
    width: spacing.xs,
    backgroundColor: colors.accent,
  },
  circleSlot: {
    width: minRowHeight.day,
    height: minRowHeight.day,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
  },
  circleFilled: {
    backgroundColor: colors.accent,
  },
  circleHollow: {
    borderWidth: 2,
    borderColor: colors.border,
  },
  circlePending: {
    opacity: 0.5,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  name: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.text,
  },
  nameCancelled: {
    textDecorationLine: 'line-through',
  },
  secondaryLine: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  notesText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
});
