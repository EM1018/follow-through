import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { colors, fontSize, fontWeight, minRowHeight, radius, spacing } from '@/theme';

export type DayItemState = 'scheduled' | 'substituted' | 'cancelled';

type DayItemProps = {
  state: DayItemState;
  name: string;
  /** Already resolved to the right workout (e.g. the replacement's, for a substituted day) by the caller -- this component only decides whether to show it. */
  notes?: string | null;
  /** Substituted only: the name of the workout this day replaced. */
  replacedName?: string | null;
  onPress: () => void;
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
export function DayItem({ state, name, notes, replacedName, onPress }: DayItemProps) {
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

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
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
    width: spacing.xs,
    backgroundColor: colors.accent,
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
