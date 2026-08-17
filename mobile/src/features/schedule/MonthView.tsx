import { useQueryClient } from '@tanstack/react-query';
import { differenceInCalendarMonths, format, isToday } from 'date-fns';
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

import { DayStatusIndicator } from '@/components/DayStatusIndicator';
import { colors, fontSize, fontWeight, spacing } from '@/theme';

import { scheduleQueryOptions, useSchedule, type DaySchedule } from './api';
import { MONTH_OFFSETS, MONTH_WINDOW, monthGrid, monthStartFor, type MonthCell } from './month';
import { planWindowState } from './planWindow';
import { ScheduleErrorState } from './ScheduleErrorState';

const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function MonthDayCell({
  cell,
  day,
  isLoading,
  isOutOfWindow,
  onPress,
}: {
  cell: MonthCell;
  day: DaySchedule | undefined;
  isLoading: boolean;
  isOutOfWindow: boolean;
  onPress: (date: Date) => void;
}) {
  const today = isToday(cell.date);

  return (
    <TouchableOpacity
      style={[styles.cell, isOutOfWindow && styles.cellOutOfWindow]}
      onPress={() => onPress(cell.date)}
      accessibilityRole="button"
      accessibilityLabel={format(cell.date, 'EEEE, MMMM d')}
    >
      <Text style={[styles.cellDate, !cell.inMonth && styles.cellDateDim, today && styles.cellDateToday]}>
        {format(cell.date, 'd')}
      </Text>
      <View style={styles.indicatorSlot}>
        <DayStatusIndicator status={day?.status} isLoading={isLoading} />
      </View>
    </TouchableOpacity>
  );
}

function MonthPage({
  planId,
  monthStart,
  planStartsOn,
  planEndsOn,
  onSelectDate,
}: {
  planId: string;
  monthStart: Date;
  planStartsOn: Date;
  planEndsOn: Date | null;
  onSelectDate: (date: Date) => void;
}) {
  const grid = useMemo(() => monthGrid(monthStart), [monthStart]);
  const scheduleQuery = useSchedule(planId, grid[0].date, grid[grid.length - 1].date);

  const rows = useMemo(() => {
    const out: MonthCell[][] = [];
    for (let i = 0; i < grid.length; i += 7) {
      out.push(grid.slice(i, i + 7));
    }
    return out;
  }, [grid]);

  return (
    <View style={styles.monthPage}>
      <Text style={styles.monthTitle}>{format(monthStart, 'MMMM yyyy')}</Text>

      <View style={styles.headerRow}>
        {WEEKDAY_INITIALS.map((initial, index) => (
          <View key={index} style={styles.headerCell}>
            <Text style={styles.headerText}>{initial}</Text>
          </View>
        ))}
      </View>

      <View style={styles.grid}>
        {rows.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.gridRow}>
            {row.map((cell) => {
              const dateParam = format(cell.date, 'yyyy-MM-dd');
              return (
                <MonthDayCell
                  key={dateParam}
                  cell={cell}
                  day={scheduleQuery.data?.days[dateParam]}
                  isLoading={scheduleQuery.isLoading}
                  isOutOfWindow={planWindowState(cell.date, planStartsOn, planEndsOn) !== 'within'}
                  onPress={onSelectDate}
                />
              );
            })}
          </View>
        ))}
      </View>

      {scheduleQuery.isError ? <ScheduleErrorState error={scheduleQuery.error} onRetry={scheduleQuery.refetch} /> : null}
    </View>
  );
}

export function MonthView({
  planId,
  today,
  focusedDate,
  planStartsOn,
  planEndsOn,
  onSelectDate,
  width,
}: {
  planId: string;
  today: Date;
  focusedDate: Date;
  planStartsOn: Date;
  planEndsOn: Date | null;
  onSelectDate: (date: Date) => void;
  width: number;
}) {
  const queryClient = useQueryClient();

  const initialIndex = useMemo(() => {
    const offset = differenceInCalendarMonths(focusedDate, today);
    return Math.min(Math.max(offset + MONTH_WINDOW, 0), MONTH_OFFSETS.length - 1);
    // Only meaningful at mount -- see the matching note in DayView.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const prefetchOffset = useCallback(
    (offset: number) => {
      if (offset < -MONTH_WINDOW || offset > MONTH_WINDOW) {
        return;
      }
      const grid = monthGrid(monthStartFor(today, offset));
      queryClient.prefetchQuery(scheduleQueryOptions(planId, grid[0].date, grid[grid.length - 1].date));
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
      const offset = MONTH_OFFSETS[index];
      if (offset === undefined) {
        return;
      }
      prefetchOffset(offset - 1);
      prefetchOffset(offset + 1);
    },
    [width, prefetchOffset],
  );

  const renderItem = useCallback(
    ({ item: offset }: { item: number }) => (
      <View style={{ width }}>
        <MonthPage
          planId={planId}
          monthStart={monthStartFor(today, offset)}
          planStartsOn={planStartsOn}
          planEndsOn={planEndsOn}
          onSelectDate={onSelectDate}
        />
      </View>
    ),
    [planId, today, width, planStartsOn, planEndsOn, onSelectDate],
  );

  return (
    <FlatList
      data={MONTH_OFFSETS}
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
  monthPage: {
    flex: 1,
    gap: spacing.xs,
  },
  monthTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.text,
    textAlign: 'center',
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
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.textMuted,
  },
  grid: {
    flex: 1,
  },
  gridRow: {
    flex: 1,
    flexDirection: 'row',
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    paddingTop: spacing.xs,
    gap: spacing.xs,
  },
  cellOutOfWindow: {
    backgroundColor: colors.surfaceMuted,
  },
  cellDate: {
    fontSize: fontSize.sm,
    color: colors.text,
  },
  cellDateDim: {
    color: colors.textMuted,
    opacity: 0.5,
  },
  cellDateToday: {
    color: colors.accent,
    fontWeight: fontWeight.bold,
  },
  indicatorSlot: {
    height: fontSize.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
