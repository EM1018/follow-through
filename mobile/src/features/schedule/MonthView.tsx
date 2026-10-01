import { useQueryClient } from '@tanstack/react-query';
import { format, isSameDay, isToday, startOfMonth } from 'date-fns';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { colors, fontSize, fontWeight, monthGridRow, selectionCircle, spacing } from '@/theme';

import { scheduleQueryOptions, useSchedule, type DaySchedule } from './api';
import { MAX_GRID_ROWS, MONTH_OFFSETS, MONTH_WINDOW, monthGrid, monthStartFor, sameDayOfMonthIn, type MonthCell } from './month';
import { planWindowState } from './planWindow';
import { DaySection } from './DaySection';
import type { EntryTarget } from './EntryActionsSheet';

const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function MonthDayCell({
  cell,
  day,
  isLoading,
  isOutOfWindow,
  selected,
  onPress,
}: {
  cell: MonthCell;
  day: DaySchedule | undefined;
  isLoading: boolean;
  isOutOfWindow: boolean;
  selected: boolean;
  onPress: (date: Date) => void;
}) {
  const today = isToday(cell.date);

  return (
    <TouchableOpacity
      style={[styles.cell, isOutOfWindow && styles.cellOutOfWindow]}
      // Spill days stay visible but inert: selecting one would move focusedDate into a
      // month whose page isn't on screen, and the pager can't follow without re-seeking.
      onPress={cell.inMonth ? () => onPress(cell.date) : undefined}
      disabled={!cell.inMonth}
      accessibilityRole="button"
      accessibilityLabel={format(cell.date, 'EEEE, MMMM d')}
    >
      {/* Selected wins over today: same fill either way, and the day section's header still says Today. */}
      <View style={[styles.dateCircle, selected && styles.dateCircleSelected]}>
        <Text
          style={[
            styles.cellDate,
            !cell.inMonth && styles.cellDateDim,
            today && styles.cellDateToday,
            selected && styles.cellDateSelected,
          ]}
        >
          {format(cell.date, 'd')}
        </Text>
      </View>
      <View style={styles.indicatorSlot}>
        <DayStatusIndicator status={day?.status} completed={day?.completed} isLoading={isLoading} />
      </View>
    </TouchableOpacity>
  );
}

export function MonthPage({
  planId,
  monthStart,
  planStartsOn,
  planEndsOn,
  selectedDate,
  onSelectDate,
}: {
  planId: string;
  monthStart: Date;
  planStartsOn: Date;
  planEndsOn: Date | null;
  selectedDate: Date;
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
                  // inMonth: a neighbouring page's spill copy of the same date stays unselected.
                  selected={cell.inMonth && isSameDay(cell.date, selectedDate)}
                  onPress={onSelectDate}
                />
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

export function MonthView({
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

  // The day section reads the focused month's page query -- same range, so same
  // cache entry, so no second fetch. Spill days aren't selectable, which keeps
  // focusedDate inside the month whose page is on screen.
  const focusedMonthTime = startOfMonth(focusedDate).getTime();
  const focusedGrid = useMemo(() => monthGrid(new Date(focusedMonthTime)), [focusedMonthTime]);
  const focusedQuery = useSchedule(planId, focusedGrid[0].date, focusedGrid[focusedGrid.length - 1].date);

  // Frozen at mount: both directions of the page<->date mapping read this one
  // anchor, so a swipe can't shift the mapping under the user. The view
  // remounts on every mode switch, re-centring on whatever focusedDate is then.
  const [anchor] = useState(() => focusedDate);

  const prefetchOffset = useCallback(
    (offset: number) => {
      if (offset < -MONTH_WINDOW || offset > MONTH_WINDOW) {
        return;
      }
      const grid = monthGrid(monthStartFor(anchor, offset));
      queryClient.prefetchQuery(scheduleQueryOptions(planId, grid[0].date, grid[grid.length - 1].date));
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
      const offset = MONTH_OFFSETS[index];
      if (offset === undefined) {
        return;
      }
      prefetchOffset(offset - 1);
      prefetchOffset(offset + 1);
      // Keep the day-of-month (clamped): Sep 29 -> Dec 29 -> Sep 29.
      const target = sameDayOfMonthIn(monthStartFor(anchor, offset), focusedDate);
      if (!isSameDay(target, focusedDate)) {
        onFocusedDateChange(target);
      }
    },
    [width, prefetchOffset, anchor, focusedDate, onFocusedDateChange],
  );

  // Selecting stays in Month: the day section below follows focusedDate.
  const onSelectDate = useCallback(
    (date: Date) => {
      if (!isSameDay(date, focusedDate)) {
        onFocusedDateChange(date);
      }
    },
    [focusedDate, onFocusedDateChange],
  );

  const renderItem = useCallback(
    ({ item: offset }: { item: number }) => (
      <View style={{ width }}>
        <MonthPage
          planId={planId}
          monthStart={monthStartFor(anchor, offset)}
          planStartsOn={planStartsOn}
          planEndsOn={planEndsOn}
          selectedDate={focusedDate}
          onSelectDate={onSelectDate}
        />
      </View>
    ),
    [planId, anchor, width, planStartsOn, planEndsOn, focusedDate, onSelectDate],
  );

  return (
    <View style={styles.monthView}>
      <FlatList
        style={styles.pager}
        data={MONTH_OFFSETS}
        keyExtractor={(offset) => String(offset)}
        renderItem={renderItem}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        getItemLayout={getItemLayout}
        initialScrollIndex={MONTH_WINDOW}
        onMomentumScrollEnd={onMomentumScrollEnd}
        windowSize={3}
      />

      {/* Outside the pager: the grid swipes, the card stays put and follows focusedDate once a swipe settles. */}
      <DaySection
        planId={planId}
        date={focusedDate}
        day={focusedQuery.data?.days[format(focusedDate, 'yyyy-MM-dd')]}
        isLoading={focusedQuery.isLoading}
        error={focusedQuery.error}
        onRetry={focusedQuery.refetch}
        planStartsOn={planStartsOn}
        planEndsOn={planEndsOn}
        onRequestAdd={onRequestAdd}
        onRequestEntryAction={onRequestEntryAction}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  monthView: {
    flex: 1,
    gap: spacing.md,
  },
  // ScrollView defaults to flexGrow: 1; without this the pager would take the card's space.
  // Its height is then just one page's: weekday row + the fixed six-row grid.
  pager: {
    flexGrow: 0,
  },
  monthPage: {
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
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.textMuted,
  },
  // Always six rows tall, even for 4- and 5-week months, so content below the grid never moves.
  grid: {
    height: monthGridRow.height * MAX_GRID_ROWS,
  },
  gridRow: {
    height: monthGridRow.height,
    flexDirection: 'row',
  },
  // No top padding: circle + gap + dot slot (26 + 4 + 14) has to fit the 48pt row.
  cell: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
  },
  cellOutOfWindow: {
    backgroundColor: colors.surfaceMuted,
  },
  dateCircle: {
    width: selectionCircle.size,
    height: selectionCircle.size,
    borderRadius: selectionCircle.size / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateCircleSelected: {
    backgroundColor: colors.accent,
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
  cellDateSelected: {
    color: colors.background,
  },
  indicatorSlot: {
    height: fontSize.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
