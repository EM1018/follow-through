import { useQueryClient } from '@tanstack/react-query';
import { addDays, format, isSameDay } from 'date-fns';
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
import { WEEK_OFFSETS, WEEK_WINDOW, sameWeekdayIn, weekDates, weekStartFor } from './week';
import { WeekStrip } from './WeekStrip';

function WeekPage({
  planId,
  weekStart,
  focusedDate,
  onFocusedDateChange,
  planStartsOn,
  planEndsOn,
  onRequestAdd,
  onRequestEntryAction,
}: {
  planId: string;
  weekStart: Date;
  focusedDate: Date;
  onFocusedDateChange: (date: Date) => void;
  planStartsOn: Date;
  planEndsOn: Date | null;
  onRequestAdd: (date: Date) => void;
  onRequestEntryAction: (target: EntryTarget, date: Date) => void;
}) {
  const weekEnd = addDays(weekStart, 6);
  const scheduleQuery = useSchedule(planId, weekStart, weekEnd);
  const dates = useMemo(() => weekDates(weekStart), [weekStart]);

  // focusedDate is the one selected day for every view. Off-screen neighbour
  // pages (whose week doesn't contain it) show the same weekday below the
  // strip -- the day paging onto them will land on.
  const dayDate = useMemo(() => sameWeekdayIn(dates, focusedDate), [dates, focusedDate]);
  const selectedDay = scheduleQuery.data?.days[format(dayDate, 'yyyy-MM-dd')];

  const onSelectDate = useCallback(
    (date: Date) => {
      if (!isSameDay(date, focusedDate)) {
        onFocusedDateChange(date);
      }
    },
    [focusedDate, onFocusedDateChange],
  );

  return (
    <View style={styles.weekPage}>
      <WeekStrip
        dates={dates}
        schedule={scheduleQuery.data}
        isLoading={scheduleQuery.isLoading}
        // Highlighting is by isSameDay against this page's own seven dates, so a
        // neighbour page whose week doesn't contain focusedDate lights up nothing.
        selectedDate={focusedDate}
        planStartsOn={planStartsOn}
        planEndsOn={planEndsOn}
        onSelectDate={onSelectDate}
      />

      <DaySection
        planId={planId}
        date={dayDate}
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
  focusedDate,
  onFocusedDateChange,
  planStartsOn,
  planEndsOn,
  onRequestAdd,
  onRequestEntryAction,
  width,
}: {
  planId: string;
  focusedDate: Date;
  onFocusedDateChange: (date: Date) => void;
  planStartsOn: Date;
  planEndsOn: Date | null;
  onRequestAdd: (date: Date) => void;
  onRequestEntryAction: (target: EntryTarget, date: Date) => void;
  width: number;
}) {
  const queryClient = useQueryClient();

  // Frozen at mount: both directions of the page<->date mapping read this one
  // anchor, so a swipe can't shift the mapping under the user. The view
  // remounts on every mode switch, re-centring on whatever focusedDate is then.
  const [anchor] = useState(() => focusedDate);

  const prefetchOffset = useCallback(
    (offset: number) => {
      if (offset < -WEEK_WINDOW || offset > WEEK_WINDOW) {
        return;
      }
      const start = weekStartFor(anchor, offset);
      queryClient.prefetchQuery(scheduleQueryOptions(planId, start, addDays(start, 6)));
    },
    [planId, anchor, queryClient],
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
      // Keep the weekday: Thu -> next week's Thu, so forward-then-back round-trips.
      const target = sameWeekdayIn(weekDates(weekStartFor(anchor, offset)), focusedDate);
      if (!isSameDay(target, focusedDate)) {
        onFocusedDateChange(target);
      }
    },
    [width, prefetchOffset, anchor, focusedDate, onFocusedDateChange],
  );

  const renderItem = useCallback(
    ({ item: offset }: { item: number }) => (
      <View style={{ width }}>
        <WeekPage
          planId={planId}
          weekStart={weekStartFor(anchor, offset)}
          focusedDate={focusedDate}
          onFocusedDateChange={onFocusedDateChange}
          planStartsOn={planStartsOn}
          planEndsOn={planEndsOn}
          onRequestAdd={onRequestAdd}
          onRequestEntryAction={onRequestEntryAction}
        />
      </View>
    ),
    [planId, anchor, width, focusedDate, onFocusedDateChange, planStartsOn, planEndsOn, onRequestAdd, onRequestEntryAction],
  );

  return (
    <FlatList
      style={styles.pager}
      data={WEEK_OFFSETS}
      keyExtractor={(offset) => String(offset)}
      renderItem={renderItem}
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      getItemLayout={getItemLayout}
      initialScrollIndex={WEEK_WINDOW}
      onMomentumScrollEnd={onMomentumScrollEnd}
      windowSize={3}
    />
  );
}

const styles = StyleSheet.create({
  // See the matching note in DayView -- without this the FlatList has no
  // defined height, so weekPage/DaySection's flex:1 below it has nothing to
  // fill.
  pager: {
    flex: 1,
  },
  weekPage: {
    flex: 1,
    gap: spacing.md,
  },
});
