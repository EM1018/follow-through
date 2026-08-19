import { useQueryClient } from '@tanstack/react-query';
import { addDays, differenceInCalendarWeeks, format } from 'date-fns';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  StyleSheet,
  View,
} from 'react-native';

import { spacing } from '@/theme';

import { scheduleQueryOptions, useSchedule } from './api';
import { DaySection } from './DaySection';
import type { EntryTarget } from './EntryActionsSheet';
import { selectedDateForWeek } from './weekSelection';
import { WEEK_OFFSETS, WEEK_WINDOW, weekDates, weekStartFor } from './week';
import { WeekStrip } from './WeekStrip';

function WeekPage({
  planId,
  weekStart,
  today,
  planStartsOn,
  planEndsOn,
  onRequestAdd,
  onRequestEntryAction,
}: {
  planId: string;
  weekStart: Date;
  today: Date;
  planStartsOn: Date;
  planEndsOn: Date | null;
  onRequestAdd: (date: Date) => void;
  onRequestEntryAction: (target: EntryTarget, date: Date) => void;
}) {
  const weekEnd = addDays(weekStart, 6);
  const scheduleQuery = useSchedule(planId, weekStart, weekEnd);
  const dates = useMemo(() => weekDates(weekStart), [weekStart]);

  // Per-week, ephemeral: a fresh WeekPage mounts (and this re-initializes)
  // every time paging brings a different week into view -- see the matching
  // note on WeekView's FlatList windowSize. Never persisted.
  const [selectedDate, setSelectedDate] = useState(() =>
    selectedDateForWeek(dates, today, planStartsOn, planEndsOn),
  );

  const selectedDateParam = format(selectedDate, 'yyyy-MM-dd');
  const selectedDay = scheduleQuery.data?.days[selectedDateParam];

  return (
    <View style={styles.weekPage}>
      <WeekStrip
        dates={dates}
        schedule={scheduleQuery.data}
        isLoading={scheduleQuery.isLoading}
        selectedDate={selectedDate}
        planStartsOn={planStartsOn}
        planEndsOn={planEndsOn}
        // `dates` is memoized on weekStart, so tapping the already-selected
        // cell hands back the exact same Date reference -- React's setState
        // bails out on that by itself, which is what makes the tap a no-op.
        onSelectDate={setSelectedDate}
      />

      <DaySection
        planId={planId}
        date={selectedDate}
        day={selectedDay}
        isLoading={scheduleQuery.isLoading}
        error={scheduleQuery.error}
        onRetry={scheduleQuery.refetch}
        planStartsOn={planStartsOn}
        planEndsOn={planEndsOn}
        onRequestAdd={onRequestAdd}
        onRequestEntryAction={onRequestEntryAction}
      />
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
          today={today}
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
    flex: 1,
    gap: spacing.md,
  },
});
