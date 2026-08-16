import { useQueryClient } from '@tanstack/react-query';
import { addDays, differenceInCalendarWeeks, format, isToday } from 'date-fns';
import { useCallback, useEffect, useMemo } from 'react';
import {
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { Skeleton } from '@/components/Skeleton';
import { WeekItem } from '@/components/WeekItem';
import { colors, fontSize, fontWeight, minRowHeight, radius, spacing } from '@/theme';

import { scheduleQueryOptions, useSchedule, type DaySchedule } from './api';
import type { EntryTarget } from './EntryActionsSheet';
import { planWindowState } from './planWindow';
import { ScheduleErrorState } from './ScheduleErrorState';
import { WEEK_OFFSETS, WEEK_WINDOW, weekDates, weekStartFor } from './week';

const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function WeekCell({
  date,
  day,
  isLoading,
  planStartsOn,
  planEndsOn,
  onRequestAdd,
  onEntryPress,
}: {
  date: Date;
  day: DaySchedule | undefined;
  isLoading: boolean;
  planStartsOn: Date;
  planEndsOn: Date | null;
  onRequestAdd: (date: Date) => void;
  onEntryPress: (target: EntryTarget) => void;
}) {
  const today = isToday(date);
  const isOutOfWindow = planWindowState(date, planStartsOn, planEndsOn) !== 'within';
  const entries = day?.entries ?? [];
  const cancelled = day?.cancelled ?? [];
  const isEmpty = entries.length === 0 && cancelled.length === 0;

  return (
    <View style={[styles.cell, today && styles.cellToday, isOutOfWindow && styles.cellOutOfWindow]}>
      <Text style={[styles.cellDate, today && styles.cellDateToday]}>{format(date, 'd')}</Text>
      {isLoading ? (
        <Skeleton style={styles.cellSkeleton} />
      ) : isOutOfWindow ? null : isEmpty ? (
        <TouchableOpacity
          style={styles.emptyColumn}
          onPress={() => onRequestAdd(date)}
          accessibilityRole="button"
          accessibilityLabel="Add workout"
        >
          <Text style={styles.emptyColumnIcon}>⊕</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.cellEntries}>
          {entries.map((entry) => (
            <WeekItem
              key={entry.entry_id}
              state={entry.status}
              name={entry.name ?? 'Untitled'}
              onPress={() => onEntryPress({ kind: 'resolved', entry })}
            />
          ))}
          {cancelled.map((target) => (
            <WeekItem
              key={target.entry_id}
              state="cancelled"
              name={target.name ?? 'Untitled'}
              onPress={() => onEntryPress({ kind: 'cancelled', target })}
            />
          ))}
          <TouchableOpacity
            style={styles.cellAddButton}
            onPress={() => onRequestAdd(date)}
            accessibilityRole="button"
            accessibilityLabel="Add workout"
          >
            <Text style={styles.cellAddButtonIcon}>⊕</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function WeekPage({
  planId,
  weekStart,
  planStartsOn,
  planEndsOn,
  onRequestAdd,
  onRequestEntryAction,
}: {
  planId: string;
  weekStart: Date;
  planStartsOn: Date;
  planEndsOn: Date | null;
  onRequestAdd: (date: Date) => void;
  onRequestEntryAction: (target: EntryTarget, date: Date) => void;
}) {
  const weekEnd = addDays(weekStart, 6);
  const scheduleQuery = useSchedule(planId, weekStart, weekEnd);
  const dates = useMemo(() => weekDates(weekStart), [weekStart]);

  return (
    <View style={styles.weekPage}>
      <View style={styles.headerRow}>
        {WEEKDAY_INITIALS.map((initial, index) => (
          <View key={index} style={styles.headerCell}>
            <Text style={styles.headerText}>{initial}</Text>
          </View>
        ))}
      </View>

      <View style={styles.gridRow}>
        {dates.map((date) => {
          const dateParam = format(date, 'yyyy-MM-dd');
          return (
            <WeekCell
              key={dateParam}
              date={date}
              day={scheduleQuery.data?.days[dateParam]}
              isLoading={scheduleQuery.isLoading}
              planStartsOn={planStartsOn}
              planEndsOn={planEndsOn}
              onRequestAdd={onRequestAdd}
              onEntryPress={(target) => onRequestEntryAction(target, date)}
            />
          );
        })}
      </View>

      {scheduleQuery.isError ? <ScheduleErrorState error={scheduleQuery.error} onRetry={scheduleQuery.refetch} /> : null}
    </View>
  );
}

export function WeekView({
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
  const queryClient = useQueryClient();

  const initialIndex = useMemo(() => {
    const offset = differenceInCalendarWeeks(focusedDate, today);
    return Math.min(Math.max(offset + WEEK_WINDOW, 0), WEEK_OFFSETS.length - 1);
    // Only meaningful at mount -- see the matching note in DayView.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const prefetchOffset = useCallback(
    (offset: number) => {
      if (offset < -WEEK_WINDOW || offset > WEEK_WINDOW) {
        return;
      }
      const start = weekStartFor(today, offset);
      queryClient.prefetchQuery(scheduleQueryOptions(planId, start, addDays(start, 6)));
    },
    [planId, today, queryClient],
  );

  useEffect(() => {
    prefetchOffset(-1);
    prefetchOffset(1);
  }, [prefetchOffset]);

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
      const offset = WEEK_OFFSETS[index];
      if (offset === undefined) {
        return;
      }
      prefetchOffset(offset - 1);
      prefetchOffset(offset + 1);
      onFocusedDateChange(weekStartFor(today, offset));
    },
    [width, prefetchOffset, today, onFocusedDateChange],
  );

  const renderItem = useCallback(
    ({ item: offset }: { item: number }) => (
      <View style={{ width }}>
        <WeekPage
          planId={planId}
          weekStart={weekStartFor(today, offset)}
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
      data={WEEK_OFFSETS}
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
  weekPage: {
    gap: spacing.xs,
  },
  headerRow: {
    flexDirection: 'row',
  },
  headerCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  headerText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textMuted,
  },
  // No flex:1 here (or on `cell`'s height) -- removing the forced full-screen
  // stretch is what lets columns size to their tallest sibling instead of the
  // screen. Row children still equalize height via the default cross-axis
  // stretch; `cell`'s own minHeight is the floor for an empty day.
  gridRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  cell: {
    flex: 1,
    minHeight: minRowHeight.week * 2,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.xs,
    gap: spacing.xs,
  },
  cellToday: {
    borderColor: colors.accent,
    borderWidth: 2,
  },
  cellOutOfWindow: {
    backgroundColor: colors.surfaceMuted,
  },
  emptyColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyColumnIcon: {
    fontSize: fontSize.sm,
    color: colors.accent,
  },
  cellAddButton: {
    alignSelf: 'center',
    paddingTop: spacing.xs,
  },
  cellAddButtonIcon: {
    fontSize: fontSize.sm,
    color: colors.accent,
  },
  cellSkeleton: {
    height: fontSize.xs,
    width: '70%',
  },
  cellEntries: {
    gap: spacing.xs,
  },
  cellDate: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textMuted,
  },
  cellDateToday: {
    color: colors.accent,
    fontWeight: fontWeight.bold,
  },
});
