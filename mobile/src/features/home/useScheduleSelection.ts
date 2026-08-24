import { useMemo, useState } from 'react';

import type { PlanRead } from './planStack';

/**
 * Cold launch (or the previously-viewed plan disappearing, e.g. deleted from
 * Manage plans) resolves to the active plan, or the first plan in `orderedPlans`
 * (which is already active-first) when none is active.
 */
export function resolveCurrentPlanId(orderedPlans: PlanRead[], selectedPlanId: string | null): string | null {
  if (selectedPlanId && orderedPlans.some((plan) => plan.id === selectedPlanId)) {
    return selectedPlanId;
  }
  return orderedPlans[0]?.id ?? null;
}

/**
 * The Schedule tab's plan + date selection. Plan selection and date are
 * deliberately independent pieces of state -- switching plans never touches
 * `focusedDate`, which is what lets switching plans keep the date you were on.
 */
export function useScheduleSelection(orderedPlans: PlanRead[], today: Date) {
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const currentPlanId = useMemo(
    () => resolveCurrentPlanId(orderedPlans, selectedPlanId),
    [orderedPlans, selectedPlanId],
  );
  const currentPlan = useMemo(
    () => orderedPlans.find((plan) => plan.id === currentPlanId) ?? null,
    [orderedPlans, currentPlanId],
  );

  const [focusedDate, setFocusedDate] = useState(today);

  return { currentPlan, selectPlan: setSelectedPlanId, focusedDate, setFocusedDate };
}
