import { addDays, differenceInCalendarDays, format } from 'date-fns';
import { useCallback, useMemo } from 'react';
import {
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  View,
} from 'react-native';

import { useSchedule } from './api';
import { DaySection } from './DaySection';
import type { EntryTarget } from './EntryActionsSheet';

// Fixed range of +/-180 days around today, rather than an infinite recentering
// window -- same rationale Stage 4 uses for week periods: simpler, adequate
// for the use case, and avoids scroll-position bugs.
const DAY_WINDOW = 180;
const DAY_OFFSETS = Array.from({ length: DAY_WINDOW * 2 + 1 }, (_, i) => i - DAY_WINDOW);

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

  return (
    <DaySection
      date={date}
      day={day}
      isLoading={scheduleQuery.isLoading}
      error={scheduleQuery.error}
      onRetry={scheduleQuery.refetch}
      planStartsOn={planStartsOn}
      planEndsOn={planEndsOn}
      onRequestAdd={onRequestAdd}
      onRequestEntryAction={onRequestEntryAction}
    />
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
