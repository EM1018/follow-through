import { router } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View, type LayoutChangeEvent } from 'react-native';

import { Badge } from '@/components/Badge';
import type { PlanRead } from '@/features/home/planStack';
import { ViewModeControl } from '@/features/schedule/ViewModeControl';
import type { ViewMode } from '@/features/schedule/viewMode';
import { colors, fontSize, fontWeight, spacing } from '@/theme';

type PlanHeaderProps = {
  plan: PlanRead;
  open: boolean;
  onToggle: () => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onLayoutBottom: (bottom: number) => void;
};

/** The Schedule tab's fixed header: current plan name/switcher, workouts link, view mode. */
export function PlanHeader({ plan, open, onToggle, viewMode, onViewModeChange, onLayoutBottom }: PlanHeaderProps) {
  const onLayout = (event: LayoutChangeEvent) => {
    const { y, height } = event.nativeEvent.layout;
    onLayoutBottom(y + height);
  };

  return (
    <View style={styles.header} onLayout={onLayout}>
      <View style={styles.headerLeft}>
        <TouchableOpacity
          style={styles.nameTrigger}
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityLabel={open ? 'Close plan switcher' : 'Open plan switcher'}
          accessibilityState={{ expanded: open }}
        >
          <Text style={styles.planName} numberOfLines={1}>
            {plan.name}
          </Text>
          <Text style={styles.chevron}>{open ? '▴' : '▾'}</Text>
        </TouchableOpacity>
        {plan.is_active ? <Badge label="Active" variant="success" /> : null}
      </View>
      <TouchableOpacity
        onPress={() => router.push(`/(app)/plans/${plan.id}/workouts`)}
        accessibilityRole="button"
        accessibilityLabel="Manage workouts"
      >
        <Text style={styles.workoutsLink}>Workouts</Text>
      </TouchableOpacity>
      <ViewModeControl value={viewMode} onChange={onViewModeChange} />
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    zIndex: 10,
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  nameTrigger: {
    flexShrink: 1,
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
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  workoutsLink: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.accent,
  },
});
