import { format, isSameDay, isToday } from 'date-fns';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { DayStatusIndicator } from '@/components/DayStatusIndicator';
import { colors, fontSize, fontWeight, radius, spacing } from '@/theme';

import type { ScheduleResponse } from './api';
import { planWindowState } from './planWindow';

const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

type WeekStripProps = {
  /** Seven dates, Sunday through Saturday, matching the column order Week view already uses (see week.ts's weekDates). */
  dates: Date[];
  schedule: ScheduleResponse | undefined;
  isLoading: boolean;
  selectedDate: Date;
  planStartsOn: Date;
  planEndsOn: Date | null;
  onSelectDate: (date: Date) => void;
};

/**
 * The compact day selector that replaces the old seven-column layout: a
 * letter, a date number, and the same status glyph Month view draws for that
 * day. Taps only -- paging between weeks/days is the FlatList's job, not
 * this component's.
 */
export function WeekStrip({ dates, schedule, isLoading, selectedDate, planStartsOn, planEndsOn, onSelectDate }: WeekStripProps) {
  return (
    <View style={styles.row}>
      {dates.map((date, index) => {
        const dateParam = format(date, 'yyyy-MM-dd');
        const day = schedule?.days[dateParam];
        const isOutOfWindow = planWindowState(date, planStartsOn, planEndsOn) !== 'within';
        const selected = isSameDay(date, selectedDate);
        const today = isToday(date);
        const variantStyle = selected && today ? styles.cellSelectedToday : selected ? styles.cellSelected : today ? styles.cellToday : null;

        return (
          <TouchableOpacity
            key={dateParam}
            style={[styles.cell, isOutOfWindow && styles.cellOutOfWindow, variantStyle]}
            onPress={() => onSelectDate(date)}
            accessibilityRole="button"
            accessibilityLabel={format(date, 'EEEE, MMMM d')}
          >
            <Text style={[styles.weekdayLabel, selected && styles.textSelected]}>{WEEKDAY_INITIALS[index]}</Text>
            <Text style={[styles.dateLabel, today && styles.dateLabelToday, selected && styles.textSelected]}>
              {format(date, 'd')}
            </Text>
            <View style={styles.indicatorSlot}>
              <DayStatusIndicator status={day?.status} isLoading={isLoading} />
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.xs,
    gap: spacing.xs,
    borderRadius: radius.md,
  },
  cellOutOfWindow: {
    backgroundColor: colors.surfaceMuted,
  },
  cellToday: {
    borderWidth: 2,
    borderColor: colors.accent,
  },
  cellSelected: {
    backgroundColor: colors.accent,
  },
  // Selected wins the fill; the ring goes background-colored instead of
  // accent so "today" is still visible against the accent fill rather than
  // disappearing into it.
  cellSelectedToday: {
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.background,
  },
  weekdayLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.textMuted,
  },
  dateLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.text,
  },
  dateLabelToday: {
    color: colors.accent,
    fontWeight: fontWeight.bold,
  },
  textSelected: {
    color: colors.background,
  },
  indicatorSlot: {
    height: fontSize.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
