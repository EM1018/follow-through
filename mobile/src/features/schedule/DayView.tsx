import { addDays, format } from 'date-fns';
import { useCallback, useState } from 'react';
import {
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  StyleSheet,
  View,
} from 'react-native';

import { useSchedule } from './api';
import { DaySection } from './DaySection';
import type { EntryTarget } from './EntryActionsSheet';

// Fixed range of +/-180 days around the focused date at mount, rather than an
// infinite recentering window -- same rationale Stage 4 uses for week periods:
// simpler, adequate for the use case, and avoids scroll-position bugs.
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
      planId={planId}
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
  // Frozen at mount: both directions of the page<->date mapping read this one
  // anchor, so a swipe can't shift the mapping under the user. The view
  // remounts on every mode switch, re-centring on whatever focusedDate is then.
  const [anchor] = useState(() => focusedDate);

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
      const offset = DAY_OFFSETS[index];
      if (offset !== undefined) {
        onFocusedDateChange(addDays(anchor, offset));
      }
    },
    [width, anchor, onFocusedDateChange],
  );

  const renderItem = useCallback(
    ({ item: offset }: { item: number }) => (
      <View style={{ width }}>
        <DayPage
          planId={planId}
          date={addDays(anchor, offset)}
          planStartsOn={planStartsOn}
          planEndsOn={planEndsOn}
          onRequestAdd={onRequestAdd}
          onRequestEntryAction={onRequestEntryAction}
        />
      </View>
    ),
    [planId, anchor, width, planStartsOn, planEndsOn, onRequestAdd, onRequestEntryAction],
  );

  return (
    <FlatList
      style={styles.pager}
      data={DAY_OFFSETS}
      keyExtractor={(offset) => String(offset)}
      renderItem={renderItem}
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      getItemLayout={getItemLayout}
      initialScrollIndex={DAY_WINDOW}
      onMomentumScrollEnd={onMomentumScrollEnd}
      windowSize={3}
    />
  );
}

const styles = StyleSheet.create({
  // Without this, the FlatList has no defined height for its own layout, so
  // it (and everything flex:1 below it -- DaySection's card included) shrinks
  // to content instead of filling CalendarArea. Cross-axis (height) stretch
  // for each paged item then falls out of the default flex behavior once
  // the FlatList itself has a real size to stretch into.
  pager: {
    flex: 1,
  },
});
