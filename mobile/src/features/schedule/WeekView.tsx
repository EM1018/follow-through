import { useQueryClient } from '@tanstack/react-query';
import { addDays, differenceInCalendarWeeks, format, isBefore, isToday } from 'date-fns';
import { useCallback, useEffect, useMemo } from 'react';
import {
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Skeleton } from '@/components/Skeleton';
import { colors, fontSize, fontWeight, radius, spacing } from '@/theme';

import { scheduleQueryOptions, useSchedule, type DaySchedule } from './api';
import { ScheduleErrorState } from './ScheduleErrorState';
import { WEEK_OFFSETS, WEEK_WINDOW, weekDates, weekStartFor } from './week';

const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function WeekCell({
  date,
  day,
  isLoading,
  isBeforeStart,
}: {
  date: Date;
  day: DaySchedule | undefined;
  isLoading: boolean;
  isBeforeStart: boolean;
}) {
  const today = isToday(date);
  const primary = day?.entries[0];
  const cancelled = day?.cancelled[0];

  return (
    <View style={[styles.cell, today && styles.cellToday, isBeforeStart && styles.cellBeforeStart]}>
      <Text style={[styles.cellDate, today && styles.cellDateToday]}>{format(date, 'd')}</Text>
      {isLoading ? (
        <Skeleton style={styles.cellSkeleton} />
      ) : isBeforeStart ? null : primary ? (
        <Text
          style={primary.status === 'substituted' ? styles.cellNameSubstituted : styles.cellNameScheduled}
          numberOfLines={2}
        >
          {primary.status === 'substituted' ? `⇄ ${primary.name ?? 'Untitled'}` : (primary.name ?? 'Untitled')}
        </Text>
      ) : cancelled ? (
        <Text style={styles.cellNameCancelled} numberOfLines={2}>
          {cancelled.name ?? 'Untitled'}
        </Text>
      ) : null}
    </View>
  );
}

function WeekPage({
  planId,
  weekStart,
  planStartsOn,
}: {
  planId: string;
  weekStart: Date;
  planStartsOn: Date;
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
              isBeforeStart={isBefore(date, planStartsOn)}
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
  width,
}: {
  planId: string;
  today: Date;
  focusedDate: Date;
  onFocusedDateChange: (date: Date) => void;
  planStartsOn: Date;
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
        <WeekPage planId={planId} weekStart={weekStartFor(today, offset)} planStartsOn={planStartsOn} />
      </View>
    ),
    [planId, today, width, planStartsOn],
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
    flex: 1,
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
  gridRow: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
  },
  cell: {
    flex: 1,
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
  cellBeforeStart: {
    backgroundColor: colors.surfaceMuted,
  },
  cellSkeleton: {
    height: fontSize.xs,
    width: '70%',
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
  cellNameScheduled: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: colors.accent,
  },
  cellNameSubstituted: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: colors.text,
  },
  cellNameCancelled: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
});
