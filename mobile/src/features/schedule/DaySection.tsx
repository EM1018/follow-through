import { format, isToday } from 'date-fns';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { ApiError } from '@/api/errors';
import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { DayItem } from '@/components/DayItem';
import { Skeleton } from '@/components/Skeleton';
import { colors, fontSize, fontWeight, radius, spacing } from '@/theme';

import type { DaySchedule } from './api';
import type { EntryTarget } from './EntryActionsSheet';
import { planWindowState, type PlanWindowState } from './planWindow';
import { ScheduleErrorState } from './ScheduleErrorState';

function DaySkeleton() {
  return (
    <View style={styles.entryList}>
      <Skeleton style={styles.skeletonLineWide} />
      <Skeleton style={styles.skeletonLineNarrow} />
    </View>
  );
}

function EmptyDay() {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyText}>Nothing scheduled</Text>
      <Text style={styles.emptyHint}>Tap ⊕ to add a workout</Text>
    </View>
  );
}

function DayContent({
  day,
  windowState,
  onEntryPress,
}: {
  day: DaySchedule | undefined;
  windowState: PlanWindowState;
  onEntryPress: (target: EntryTarget) => void;
}) {
  if (windowState === 'before') {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.outOfWindowText}>Before this plan starts</Text>
      </View>
    );
  }
  if (windowState === 'after') {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.outOfWindowText}>After this plan ended</Text>
      </View>
    );
  }

  if (!day || (day.entries.length === 0 && day.cancelled.length === 0)) {
    return <EmptyDay />;
  }

  return (
    <View style={styles.entryList}>
      {day.entries.map((entry) => (
        <DayItem
          key={entry.entry_id}
          state={entry.status}
          name={entry.name ?? 'Untitled'}
          notes={entry.notes}
          replacedName={entry.replaced?.name}
          onPress={() => onEntryPress({ kind: 'resolved', entry })}
        />
      ))}
      {day.cancelled.map((target) => (
        <DayItem
          key={target.entry_id}
          state="cancelled"
          name={target.name ?? 'Untitled'}
          onPress={() => onEntryPress({ kind: 'cancelled', target })}
        />
      ))}
    </View>
  );
}

/**
 * Everything "a day looks like": header, entries, empty/out-of-window states,
 * the add button, and the tap-through to the entry actions sheet. Shared 1:1
 * by Day mode (one date, its own fetch) and Week mode (the selected date,
 * sliced out of the week's already-fetched schedule) -- neither fetches here,
 * both just hand in whatever `day`/`isLoading`/`error` their own query has.
 */
export function DaySection({
  date,
  day,
  isLoading,
  error,
  onRetry,
  planStartsOn,
  planEndsOn,
  onRequestAdd,
  onRequestEntryAction,
}: {
  date: Date;
  day: DaySchedule | undefined;
  isLoading: boolean;
  error: ApiError | null;
  onRetry: () => void;
  planStartsOn: Date;
  planEndsOn: Date | null;
  onRequestAdd: (date: Date) => void;
  onRequestEntryAction: (target: EntryTarget, date: Date) => void;
}) {
  const windowState = planWindowState(date, planStartsOn, planEndsOn);

  return (
    <View style={styles.dayPage}>
      <View style={styles.dayHeader}>
        <Text style={styles.dayHeaderText} numberOfLines={1}>
          {format(date, 'EEEE, MMMM d')}
        </Text>
        {isToday(date) ? <Badge label="Today" variant="accent" /> : null}
      </View>

      <Card style={styles.dayCard}>
        {isLoading ? (
          <DaySkeleton />
        ) : error ? (
          <ScheduleErrorState error={error} onRetry={onRetry} />
        ) : (
          <DayContent
            day={day}
            windowState={windowState}
            onEntryPress={(target) => onRequestEntryAction(target, date)}
          />
        )}
      </Card>

      {windowState === 'within' ? (
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => onRequestAdd(date)}
          accessibilityRole="button"
          accessibilityLabel="Add workout"
        >
          <Text style={styles.addButtonIcon}>⊕</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dayPage: {
    flex: 1,
    gap: spacing.md,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dayHeaderText: {
    flexShrink: 1,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  dayCard: {
    flex: 1,
    // Rows anchor from the top (see entryList); this bottom padding is what
    // keeps the last one from sitting under the FAB, which floats past the
    // card's own edge.
    paddingBottom: spacing.xl * 2,
  },
  addButton: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: spacing.xl,
    height: spacing.xl,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  addButtonIcon: {
    fontSize: fontSize.lg,
    color: colors.background,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  emptyText: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
  outOfWindowText: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  entryList: {
    gap: spacing.sm,
  },
  skeletonLineWide: {
    alignSelf: 'center',
    height: fontSize.lg,
    width: '65%',
  },
  skeletonLineNarrow: {
    alignSelf: 'center',
    height: fontSize.sm,
    width: '40%',
  },
});
