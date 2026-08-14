import { useQuery } from '@tanstack/react-query';
import { startOfToday } from 'date-fns';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { api } from '@/api/client';
import { unwrap, type ApiError } from '@/api/errors';
import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { PageDots } from '@/components/PageDots';
import { Screen } from '@/components/Screen';
import { buildPlanStack, type PlanRead, type PlanStackItem } from '@/features/home/planStack';
import { AddWorkoutModal } from '@/features/schedule/AddWorkoutModal';
import { DayView } from '@/features/schedule/DayView';
import { MonthView } from '@/features/schedule/MonthView';
import { ScheduleErrorState } from '@/features/schedule/ScheduleErrorState';
import { ViewModeControl } from '@/features/schedule/ViewModeControl';
import { useViewMode, type ViewMode } from '@/features/schedule/viewMode';
import { WeekView } from '@/features/schedule/WeekView';
import { parseDateOnly } from '@/lib/dates';
import { supabase } from '@/lib/supabase';
import { colors, fontSize, fontWeight, spacing } from '@/theme';

function TopBar() {
  return (
    <View style={styles.topBar}>
      <TouchableOpacity onPress={() => router.push('/(app)/plans')} accessibilityRole="button">
        <Text style={styles.topBarLink}>Manage plans</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => supabase.auth.signOut()} accessibilityRole="button">
        <Text style={styles.topBarLink}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

function CreatePlanCard() {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => router.push('/(app)/plans/new')}
      accessibilityRole="button"
      accessibilityLabel="Create plan or split"
      style={styles.createTouchable}
    >
      <Card style={styles.createCard}>
        <Text style={styles.createIcon}>⊕</Text>
        <Text style={styles.createLabel}>create plan/split</Text>
      </Card>
    </TouchableOpacity>
  );
}

function CalendarArea({
  planId,
  planStartsOn,
  planEndsOn,
  today,
  viewMode,
  onViewModeChange,
}: {
  planId: string;
  planStartsOn: Date;
  planEndsOn: Date | null;
  today: Date;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}) {
  const [width, setWidth] = useState(0);
  const [focusedDate, setFocusedDate] = useState(today);
  const [addModalDate, setAddModalDate] = useState<Date | null>(null);

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
      setFocusedDate(date);
      onViewModeChange('day');
    },
    [onViewModeChange],
  );

  const closeAddModal = useCallback(() => setAddModalDate(null), []);

  return (
    <View style={styles.calendarArea} onLayout={onLayout}>
      {width > 0 && viewMode === 'day' ? (
        <DayView
          planId={planId}
          today={today}
          focusedDate={focusedDate}
          onFocusedDateChange={setFocusedDate}
          planStartsOn={planStartsOn}
          planEndsOn={planEndsOn}
          onRequestAdd={setAddModalDate}
          width={width}
        />
      ) : null}
      {width > 0 && viewMode === 'week' ? (
        <WeekView
          planId={planId}
          today={today}
          focusedDate={focusedDate}
          onFocusedDateChange={setFocusedDate}
          planStartsOn={planStartsOn}
          planEndsOn={planEndsOn}
          onRequestAdd={setAddModalDate}
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
    </View>
  );
}

function PlanPage({
  plan,
  today,
  viewMode,
  onViewModeChange,
}: {
  plan: PlanRead;
  today: Date;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}) {
  const planStartsOn = useMemo(() => parseDateOnly(plan.starts_on), [plan.starts_on]);
  const planEndsOn = useMemo(() => (plan.ends_on ? parseDateOnly(plan.ends_on) : null), [plan.ends_on]);

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.planName} numberOfLines={1}>
            {plan.name}
          </Text>
          {plan.is_active ? <Badge label="Active" variant="success" /> : null}
        </View>
        <ViewModeControl value={viewMode} onChange={onViewModeChange} />
      </View>

      <CalendarArea
        planId={plan.id}
        planStartsOn={planStartsOn}
        planEndsOn={planEndsOn}
        today={today}
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
      />
    </View>
  );
}

function CreatePage() {
  return (
    <View style={styles.createPage}>
      <CreatePlanCard />
    </View>
  );
}

export default function HomeScreen() {
  const [pageHeight, setPageHeight] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const { viewMode, setViewMode } = useViewMode();

  const plansQuery = useQuery<PlanRead[], ApiError>({
    queryKey: ['plans'],
    queryFn: () => unwrap(api.GET('/plans')),
  });

  const today = useMemo(() => startOfToday(), []);
  const stack = useMemo(
    () => (plansQuery.data ? buildPlanStack(plansQuery.data, today) : []),
    [plansQuery.data, today],
  );
  const isEmpty = stack.length <= 1;

  const onContainerLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { height } = event.nativeEvent.layout;
      if (height > 0 && height !== pageHeight) {
        setPageHeight(height);
      }
    },
    [pageHeight],
  );

  const onMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!pageHeight) {
        return;
      }
      setActiveIndex(Math.round(event.nativeEvent.contentOffset.y / pageHeight));
    },
    [pageHeight],
  );

  const getItemLayout = useCallback(
    (_data: ArrayLike<PlanStackItem> | null | undefined, index: number) => ({
      length: pageHeight,
      offset: pageHeight * index,
      index,
    }),
    [pageHeight],
  );

  const renderItem = useCallback(
    ({ item }: { item: PlanStackItem }) => (
      <View style={{ height: pageHeight }}>
        {item.kind === 'plan' ? (
          <PlanPage plan={item.plan} today={today} viewMode={viewMode} onViewModeChange={setViewMode} />
        ) : (
          <CreatePage />
        )}
      </View>
    ),
    [pageHeight, today, viewMode, setViewMode],
  );

  return (
    <Screen style={styles.screen}>
      <TopBar />
      <View style={styles.container} onLayout={onContainerLayout}>
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

        {plansQuery.data && isEmpty ? (
          <View style={styles.centered}>
            <CreatePlanCard />
          </View>
        ) : null}

        {plansQuery.data && !isEmpty && pageHeight > 0 ? (
          <>
            <FlatList
              data={stack}
              keyExtractor={(item) => (item.kind === 'plan' ? item.plan.id : 'create')}
              renderItem={renderItem}
              pagingEnabled
              showsVerticalScrollIndicator={false}
              getItemLayout={getItemLayout}
              initialScrollIndex={0}
              onMomentumScrollEnd={onMomentumScrollEnd}
            />
            <PageDots count={stack.length} activeIndex={activeIndex} />
          </>
        ) : null}
      </View>
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
    justifyContent: 'space-between',
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
    gap: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    zIndex: 10,
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  planName: {
    flexShrink: 1,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  calendarArea: {
    flex: 1,
  },
  createPage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  createTouchable: {
    width: '100%',
  },
  createCard: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  createIcon: {
    fontSize: fontSize.xl,
    color: colors.accent,
  },
  createLabel: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
});
