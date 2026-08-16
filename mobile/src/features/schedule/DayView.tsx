import { addDays, differenceInCalendarDays, format, isToday } from 'date-fns';
import { useCallback, useMemo } from 'react';
import {
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { DayItem } from '@/components/DayItem';
import { Skeleton } from '@/components/Skeleton';
import { colors, fontSize, fontWeight, radius, spacing } from '@/theme';

import { useSchedule, type DaySchedule } from './api';
import type { EntryTarget } from './EntryActionsSheet';
import { planWindowState, type PlanWindowState } from './planWindow';
import { ScheduleErrorState } from './ScheduleErrorState';

// Fixed range of +/-180 days around today, rather than an infinite recentering
// window -- same rationale Stage 4 uses for week periods: simpler, adequate
// for the use case, and avoids scroll-position bugs.
const DAY_WINDOW = 180;
const DAY_OFFSETS = Array.from({ length: DAY_WINDOW * 2 + 1 }, (_, i) => i - DAY_WINDOW);

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

function DayPage({
  planId,
  date,
  planStartsOn,
  planEndsOn,
  onRequestAdd,
  onRequestEntryAction,
}: {
  planId: string;
  date: Date;
  planStartsOn: Date;
  planEndsOn: Date | null;
  onRequestAdd: (date: Date) => void;
  onRequestEntryAction: (target: EntryTarget, date: Date) => void;
}) {
  const dateParam = format(date, 'yyyy-MM-dd');
  const scheduleQuery = useSchedule(planId, date, date);
  const day = scheduleQuery.data?.days[dateParam];
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
        {scheduleQuery.isLoading ? (
          <DaySkeleton />
        ) : scheduleQuery.isError ? (
          <ScheduleErrorState error={scheduleQuery.error} onRetry={scheduleQuery.refetch} />
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

export function DayView({
  planId,
  today,
  focusedDate,
  onFocusedDateChange,
  planStartsOn,
  planEndsOn,
  onRequestAdd,
  onRequestEntryAction,
  width,
}: {
  planId: string;
  today: Date;
  focusedDate: Date;
  onFocusedDateChange: (date: Date) => void;
  planStartsOn: Date;
  planEndsOn: Date | null;
  onRequestAdd: (date: Date) => void;
  onRequestEntryAction: (target: EntryTarget, date: Date) => void;
  width: number;
}) {
  const offsets = useMemo(() => DAY_OFFSETS, []);

  const initialIndex = useMemo(() => {
    const offset = differenceInCalendarDays(focusedDate, today);
    return Math.min(Math.max(offset + DAY_WINDOW, 0), offsets.length - 1);
    // Only meaningful at mount -- FlatList's initialScrollIndex isn't reactive,
    // which is fine here since DayView remounts fresh whenever the mode switches
    // back to 'day', picking up whatever focusedDate is current at that point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getItemLayout = useCallback(
    (_data: ArrayLike<number> | null | undefined, index: number) => ({
      length: width,
      offset: width * index,
      index,
    }),
    [width],
  );

  const onMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!width) {
        return;
      }
      const index = Math.round(event.nativeEvent.contentOffset.x / width);
      const offset = offsets[index];
      if (offset !== undefined) {
        onFocusedDateChange(addDays(today, offset));
      }
    },
    [width, offsets, today, onFocusedDateChange],
  );

  const renderItem = useCallback(
    ({ item: offset }: { item: number }) => (
      <View style={{ width }}>
        <DayPage
          planId={planId}
          date={addDays(today, offset)}
          planStartsOn={planStartsOn}
          planEndsOn={planEndsOn}
          onRequestAdd={onRequestAdd}
          onRequestEntryAction={onRequestEntryAction}
        />
      </View>
    ),
    [planId, today, width, planStartsOn, planEndsOn, onRequestAdd, onRequestEntryAction],
  );

  return (
    <FlatList
      data={offsets}
      keyExtractor={(offset) => String(offset)}
      renderItem={renderItem}
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      getItemLayout={getItemLayout}
      initialScrollIndex={initialIndex}
      onMomentumScrollEnd={onMomentumScrollEnd}
      windowSize={3}
    />
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
