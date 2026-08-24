import { useQuery } from '@tanstack/react-query';
import { startOfToday } from 'date-fns';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, type LayoutChangeEvent, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { api } from '@/api/client';
import { unwrap, type ApiError } from '@/api/errors';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { PlanHeader, ScheduleHeaderFallback } from '@/features/home/PlanHeader';
import { isPlanListEmpty, selectOrderedPlans, type PlanRead } from '@/features/home/planStack';
import { PlanSwitcherDropdown } from '@/features/home/PlanSwitcherDropdown';
import { useScheduleSelection } from '@/features/home/useScheduleSelection';
import { AddWorkoutModal } from '@/features/schedule/AddWorkoutModal';
import { DayView } from '@/features/schedule/DayView';
import { EntryActionsSheet, type EntryTarget } from '@/features/schedule/EntryActionsSheet';
import { MonthView } from '@/features/schedule/MonthView';
import { CREATE_PLAN_BUTTON_LABEL, EMPTY_SCHEDULE_SUBTITLE, EMPTY_SCHEDULE_TITLE } from '@/features/schedule/scheduleCopy';
import { ScheduleErrorState } from '@/features/schedule/ScheduleErrorState';
import { useViewMode, type ViewMode } from '@/features/schedule/viewMode';
import { WeekView } from '@/features/schedule/WeekView';
import { parseDateOnly } from '@/lib/dates';
import { colors, fontSize, fontWeight, spacing } from '@/theme';

// Sign out lives only on the Profile tab now -- see signOut.ts for why it
// has to go through queryClient.clear(), not just supabase.auth.signOut().
function TopBar() {
  return (
    <View style={styles.topBar}>
      <TouchableOpacity onPress={() => router.push('/(app)/plans')} accessibilityRole="button">
        <Text style={styles.topBarLink}>Manage plans</Text>
      </TouchableOpacity>
    </View>
  );
}

function CalendarArea({
  planId,
  planStartsOn,
  planEndsOn,
  today,
  viewMode,
  onViewModeChange,
  focusedDate,
  onFocusedDateChange,
}: {
  planId: string;
  planStartsOn: Date;
  planEndsOn: Date | null;
  today: Date;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  focusedDate: Date;
  onFocusedDateChange: (date: Date) => void;
}) {
  const [width, setWidth] = useState(0);
  const [addModalDate, setAddModalDate] = useState<Date | null>(null);
  const [entryAction, setEntryAction] = useState<{ target: EntryTarget; date: Date } | null>(null);

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const measured = event.nativeEvent.layout.width;
      if (measured > 0 && measured !== width) {
        setWidth(measured);
      }
    },
    [width],
  );

  const onSelectDateFromMonth = useCallback(
    (date: Date) => {
      onFocusedDateChange(date);
      onViewModeChange('day');
    },
    [onFocusedDateChange, onViewModeChange],
  );

  const closeAddModal = useCallback(() => setAddModalDate(null), []);

  const onRequestEntryAction = useCallback(
    (target: EntryTarget, date: Date) => setEntryAction({ target, date }),
    [],
  );
  const closeEntryAction = useCallback(() => setEntryAction(null), []);

  return (
    <View style={styles.calendarArea} onLayout={onLayout}>
      {width > 0 && viewMode === 'day' ? (
        <DayView
          planId={planId}
          today={today}
          focusedDate={focusedDate}
          onFocusedDateChange={onFocusedDateChange}
          planStartsOn={planStartsOn}
          planEndsOn={planEndsOn}
          onRequestAdd={setAddModalDate}
          onRequestEntryAction={onRequestEntryAction}
          width={width}
        />
      ) : null}
      {width > 0 && viewMode === 'week' ? (
        <WeekView
          planId={planId}
          today={today}
          focusedDate={focusedDate}
          onFocusedDateChange={onFocusedDateChange}
          planStartsOn={planStartsOn}
          planEndsOn={planEndsOn}
          onRequestAdd={setAddModalDate}
          onRequestEntryAction={onRequestEntryAction}
          width={width}
        />
      ) : null}
      {width > 0 && viewMode === 'month' ? (
        <MonthView
          planId={planId}
          today={today}
          focusedDate={focusedDate}
          planStartsOn={planStartsOn}
          planEndsOn={planEndsOn}
          onSelectDate={onSelectDateFromMonth}
          width={width}
        />
      ) : null}

      {addModalDate ? (
        <AddWorkoutModal planId={planId} date={addModalDate} onClose={closeAddModal} />
      ) : null}

      {entryAction ? (
        <EntryActionsSheet
          planId={planId}
          date={entryAction.date}
          target={entryAction.target}
          planStartsOn={planStartsOn}
          planEndsOn={planEndsOn}
          onClose={closeEntryAction}
        />
      ) : null}
    </View>
  );
}

function PlanPage({
  plan,
  today,
  viewMode,
  onViewModeChange,
  focusedDate,
  onFocusedDateChange,
}: {
  plan: PlanRead;
  today: Date;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  focusedDate: Date;
  onFocusedDateChange: (date: Date) => void;
}) {
  const planStartsOn = useMemo(() => parseDateOnly(plan.starts_on), [plan.starts_on]);
  const planEndsOn = useMemo(() => (plan.ends_on ? parseDateOnly(plan.ends_on) : null), [plan.ends_on]);

  return (
    <View style={styles.page}>
      <CalendarArea
        planId={plan.id}
        planStartsOn={planStartsOn}
        planEndsOn={planEndsOn}
        today={today}
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
        focusedDate={focusedDate}
        onFocusedDateChange={onFocusedDateChange}
      />
    </View>
  );
}

export default function HomeScreen() {
  const { viewMode, setViewMode } = useViewMode();

  const plansQuery = useQuery<PlanRead[], ApiError>({
    queryKey: ['plans'],
    queryFn: () => unwrap(api.GET('/plans')),
  });

  const today = useMemo(() => startOfToday(), []);
  const orderedPlans = useMemo(
    () => (plansQuery.data ? selectOrderedPlans(plansQuery.data, today) : []),
    [plansQuery.data, today],
  );

  const { currentPlan, selectPlan, focusedDate, setFocusedDate } = useScheduleSelection(orderedPlans, today);
  const isEmpty = isPlanListEmpty(plansQuery.data, orderedPlans);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [headerBottom, setHeaderBottom] = useState(0);

  return (
    <Screen style={styles.screen}>
      <TopBar />
      {currentPlan ? (
        <PlanHeader
          plan={currentPlan}
          open={dropdownOpen}
          onToggle={() => setDropdownOpen((open) => !open)}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onLayoutBottom={setHeaderBottom}
        />
      ) : isEmpty ? (
        <ScheduleHeaderFallback />
      ) : null}
      <View style={styles.container}>
        {/* Loading/error only cover the whole screen on a genuinely empty cache --
            once plan data has ever loaded, it stays on screen (stale-while-error)
            rather than getting replaced by a background refetch failure. */}
        {plansQuery.isLoading && !plansQuery.data ? (
          <ActivityIndicator style={styles.centered} color={colors.accent} />
        ) : null}

        {plansQuery.isError && !plansQuery.data ? (
          <View style={styles.centered}>
            <ScheduleErrorState error={plansQuery.error} onRetry={plansQuery.refetch} />
          </View>
        ) : null}

        {isEmpty ? (
          <View style={styles.centered}>
            <EmptyState
              title={EMPTY_SCHEDULE_TITLE}
              subtitle={EMPTY_SCHEDULE_SUBTITLE}
              action={<Button label={CREATE_PLAN_BUTTON_LABEL} onPress={() => router.push('/(app)/plans')} />}
            />
          </View>
        ) : null}

        {currentPlan ? (
          <PlanPage
            plan={currentPlan}
            today={today}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            focusedDate={focusedDate}
            onFocusedDateChange={setFocusedDate}
          />
        ) : null}
      </View>
      {dropdownOpen && currentPlan ? (
        <PlanSwitcherDropdown
          plans={orderedPlans}
          currentPlanId={currentPlan.id}
          top={headerBottom}
          onSelect={(planId) => {
            selectPlan(planId);
            setDropdownOpen(false);
          }}
          onClose={() => setDropdownOpen(false)}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 0,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  topBarLink: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.accent,
  },
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  page: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  calendarArea: {
    flex: 1,
  },
});
