import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import type { PlanRead } from '@/features/home/planStack';
import { colors, fontSize, fontWeight, planSwitcher, radius, spacing } from '@/theme';

type PlanSwitcherDropdownProps = {
  plans: PlanRead[];
  currentPlanId: string;
  top: number;
  onSelect: (planId: string) => void;
  onClose: () => void;
};

/**
 * Absolutely-positioned overlay anchored just below the header, with a
 * transparent backdrop below that (starting at `top`, not 0) so the header's
 * own chevron/name stays tappable to close it while the dropdown is open.
 */
export function PlanSwitcherDropdown({ plans, currentPlanId, top, onSelect, onClose }: PlanSwitcherDropdownProps) {
  return (
    <>
      <Pressable
        style={[styles.backdrop, { top }]}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close plan switcher"
      />
      <View style={[styles.panelWrap, { top }]}>
        <Card style={styles.panel}>
          <ScrollView style={styles.rows} bounces={false} showsVerticalScrollIndicator={false}>
            {plans.map((plan) => {
              const isCurrent = plan.id === currentPlanId;
              return (
                <TouchableOpacity
                  key={plan.id}
                  style={styles.row}
                  onPress={() => (isCurrent ? onClose() : onSelect(plan.id))}
                  accessibilityRole="button"
                  accessibilityLabel={plan.name}
                  accessibilityState={{ selected: isCurrent }}
                >
                  <Text style={styles.rowName} numberOfLines={1}>
                    {plan.name}
                  </Text>
                  <View style={styles.rowRight}>
                    {plan.is_active ? <Badge label="Active" variant="success" /> : null}
                    {isCurrent ? <Text style={styles.checkmark}>✓</Text> : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.divider} />
          <TouchableOpacity
            onPress={() => {
              onClose();
              router.push('/(app)/plans');
            }}
            accessibilityRole="button"
            accessibilityLabel="Manage plans"
          >
            <Text style={styles.note}>Manage plans to add another.</Text>
          </TouchableOpacity>
        </Card>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    zIndex: 20,
  },
  panelWrap: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 21,
  },
  panel: {
    padding: spacing.sm,
  },
  rows: {
    maxHeight: planSwitcher.rowHeight * planSwitcher.maxVisibleRows,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    minHeight: planSwitcher.rowHeight,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
  },
  rowName: {
    flexShrink: 1,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  checkmark: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.accent,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  note: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.xs,
  },
});
