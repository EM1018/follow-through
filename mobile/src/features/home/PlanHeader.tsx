import { format } from 'date-fns';
import { router } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View, type LayoutChangeEvent } from 'react-native';

import { Badge } from '@/components/Badge';
import type { PlanRead } from '@/features/home/planStack';
import { ViewModeControl } from '@/features/schedule/ViewModeControl';
import type { ViewMode } from '@/features/schedule/viewMode';
import { colors, fontSize, fontWeight, minTouchTarget, spacing } from '@/theme';

type PlanHeaderProps = {
  plan: PlanRead;
  open: boolean;
  onToggle: () => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  focusedDate: Date;
  onLayoutBottom: (bottom: number) => void;
};

/** The Schedule tab's fixed header: plan name/switcher + workouts link, then month title (Month view only) + view mode control. */
export function PlanHeader({
  plan,
  open,
  onToggle,
  viewMode,
  onViewModeChange,
  focusedDate,
  onLayoutBottom,
}: PlanHeaderProps) {
  const onLayout = (event: LayoutChangeEvent) => {
    const { y, height } = event.nativeEvent.layout;
    onLayoutBottom(y + height);
  };

  return (
    <View style={styles.header} onLayout={onLayout}>
      <View style={styles.titleRow}>
        <TouchableOpacity
          style={styles.nameTrigger}
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityLabel={open ? 'Close plan switcher' : 'Open plan switcher'}
          accessibilityState={{ expanded: open }}
        >
          <Text style={styles.planName} numberOfLines={1} ellipsizeMode="tail">
            {plan.name}
          </Text>
          <Text style={styles.chevron}>{open ? '▴' : '▾'}</Text>
        </TouchableOpacity>
        {/* Badge pins itself to flex-start; the wrapper is what the row centres. */}
        {plan.is_active ? (
          <View style={styles.fixed}>
            <Badge label="Active" variant="success" />
          </View>
        ) : null}
        <TouchableOpacity
          style={styles.workoutsTrigger}
          onPress={() => router.push(`/(app)/plans/${plan.id}/workouts`)}
          accessibilityRole="button"
          accessibilityLabel="Manage workouts"
        >
          <Text style={styles.workoutsLink}>Workouts</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.controlRow}>
        {/* Derived from focusedDate, so it changes once a month swipe settles, not mid-swipe. */}
        {viewMode === 'month' ? (
          <Text style={styles.monthTitle} numberOfLines={1} ellipsizeMode="tail" accessibilityRole="header">
            {format(focusedDate, 'MMMM yyyy')}
          </Text>
        ) : null}
        {/* Right-anchored in every view, so switching views never moves the control -- only the title comes and goes. */}
        <View style={styles.controlSlot}>
          <ViewModeControl value={viewMode} onChange={onViewModeChange} />
        </View>
      </View>
    </View>
  );
}

/** Shown instead of PlanHeader when there's no plan to switch between (Step 4's empty state). */
export function ScheduleHeaderFallback() {
  return (
    <View style={styles.header}>
      <Text style={styles.planName}>Schedule</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    zIndex: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  // The name is the only thing allowed to shrink; minWidth: 0 lets it go below its text width so the ellipsis shows.
  nameTrigger: {
    flexShrink: 1,
    minWidth: 0,
    minHeight: minTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  planName: {
    flexShrink: 1,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  chevron: {
    flexShrink: 0,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  fixed: {
    flexShrink: 0,
  },
  workoutsTrigger: {
    flexShrink: 0,
    marginLeft: 'auto',
    minHeight: minTouchTarget,
    justifyContent: 'center',
  },
  workoutsLink: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.accent,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  monthTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  controlSlot: {
    flexShrink: 0,
    marginLeft: 'auto',
  },
});
