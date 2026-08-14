import { addDays, differenceInCalendarDays, format, isBefore, isToday } from 'date-fns';
import { useCallback, useMemo } from 'react';
import {
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { Skeleton } from '@/components/Skeleton';
import { colors, fontSize, fontWeight, spacing } from '@/theme';

import { useSchedule, type DaySchedule, type EntryRef, type ResolvedEntry } from './api';
import { ScheduleErrorState } from './ScheduleErrorState';

// Fixed range of +/-180 days around today, rather than an infinite recentering
// window -- same rationale Stage 4 uses for week periods: simpler, adequate
// for the use case, and avoids scroll-position bugs.
const DAY_WINDOW = 180;
const DAY_OFFSETS = Array.from({ length: DAY_WINDOW * 2 + 1 }, (_, i) => i - DAY_WINDOW);

function EntryRow({ entry }: { entry: ResolvedEntry }) {
  if (entry.status === 'substituted') {
    return (
      <View style={styles.entryRow}>
        <View style={styles.substitutedHeader}>
          <Text style={styles.swapIcon}>⇄</Text>
          <Text style={styles.substitutedName}>{entry.name ?? 'Untitled'}</Text>
        </View>
        {entry.replaced ? (
          <Text style={styles.replacedText}>replaced {entry.replaced.name ?? 'Untitled'}</Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.entryRow}>
      <Text style={styles.scheduledName}>{entry.name ?? 'Untitled'}</Text>
    </View>
  );
}

function CancelledRow({ target }: { target: EntryRef }) {
  return (
    <View style={styles.cancelledRow}>
      <Text style={styles.cancelledName}>{target.name ?? 'Untitled'}</Text>
      <Badge label="Cancelled" variant="muted" />
    </View>
  );
}

function DaySkeleton() {
  return (
    <View style={styles.entryList}>
      <Skeleton style={styles.skeletonLineWide} />
      <Skeleton style={styles.skeletonLineNarrow} />
    </View>
  );
}

function DayContent({ day, isBeforePlanStart }: { day: DaySchedule | undefined; isBeforePlanStart: boolean }) {
  if (isBeforePlanStart) {
    return <Text style={styles.beforeStartText}>Before this plan starts</Text>;
  }

  if (!day || (day.entries.length === 0 && day.cancelled.length === 0)) {
    return <Text style={styles.emptyText}>Nothing scheduled</Text>;
  }

  return (
    <View style={styles.entryList}>
      {day.entries.map((entry) => (
        <EntryRow key={entry.entry_id} entry={entry} />
      ))}
      {day.cancelled.map((target) => (
        <CancelledRow key={target.entry_id} target={target} />
      ))}
    </View>
  );
}

function DayPage({ planId, date, planStartsOn }: { planId: string; date: Date; planStartsOn: Date }) {
  const dateParam = format(date, 'yyyy-MM-dd');
  const scheduleQuery = useSchedule(planId, date, date);
  const day = scheduleQuery.data?.days[dateParam];

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
          <DayContent day={day} isBeforePlanStart={isBefore(date, planStartsOn)} />
        )}
      </Card>
    </View>
  );
}

export function DayView({
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
        <DayPage planId={planId} date={addDays(today, offset)} planStartsOn={planStartsOn} />
      </View>
    ),
    [planId, today, width, planStartsOn],
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
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    textAlign: 'center',
  },
  beforeStartText: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  entryList: {
    gap: spacing.lg,
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
  entryRow: {
    gap: spacing.xs,
  },
  cancelledRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  scheduledName: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.accent,
  },
  substitutedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  swapIcon: {
    fontSize: fontSize.md,
    color: colors.accent,
  },
  substitutedName: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  replacedText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  cancelledName: {
    flexShrink: 1,
    fontSize: fontSize.md,
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
});
