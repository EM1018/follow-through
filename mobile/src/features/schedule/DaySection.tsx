import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format, isFuture, isToday } from 'date-fns';
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { ApiError } from '@/api/errors';
import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { DayItem, type AmountControl, type CompletionControl } from '@/components/DayItem';
import { Skeleton } from '@/components/Skeleton';
import { invalidateCommitmentsQueries } from '@/features/goals/commitments';
import {
  createCompletion,
  deleteCompletion,
  invalidateCompletionsQueries,
  useCompletionsForDate,
  type CompletionRead,
} from '@/features/logs/completions';
import { formatAmount } from '@/features/logs/units';
import { colors, fontSize, fontWeight, radius, spacing } from '@/theme';

import type { DaySchedule, ScheduleResponse } from './api';
import { CompletionEditSheet } from './CompletionEditSheet';
import { PENDING_COMPLETION_ID, resolveLoggedCompletion } from './dayCompletions';
import type { EntryTarget } from './EntryActionsSheet';
import { planWindowState, type PlanWindowState } from './planWindow';
import { ScheduleErrorState } from './ScheduleErrorState';
import { applyOptimisticCompletion } from './scheduleCache';

function DaySkeleton() {
  return (
    <View style={styles.entryList}>
      <Skeleton style={styles.skeletonLineWide} />
      <Skeleton style={styles.skeletonLineNarrow} />
    </View>
  );
}

function EmptyDay() {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyText}>Nothing scheduled</Text>
      <Text style={styles.emptyHint}>Tap ⊕ to add a workout</Text>
    </View>
  );
}

function DayContent({
  day,
  windowState,
  canLog,
  completionFor,
  amountFor,
  onEntryPress,
}: {
  day: DaySchedule | undefined;
  windowState: PlanWindowState;
  canLog: boolean;
  completionFor: (entryId: string, completionId: string | null) => CompletionControl;
  amountFor: (name: string, control: CompletionControl) => AmountControl | undefined;
  onEntryPress: (target: EntryTarget) => void;
}) {
  if (windowState === 'before') {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.outOfWindowText}>Before this plan starts</Text>
      </View>
    );
  }
  if (windowState === 'after') {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.outOfWindowText}>After this plan ended</Text>
      </View>
    );
  }

  if (!day || (day.entries.length === 0 && day.cancelled.length === 0)) {
    return <EmptyDay />;
  }

  return (
    <View style={styles.entryList}>
      {day.entries.map((entry) => {
        const name = entry.name ?? 'Untitled';
        // Cancelled entries never reach here (they're rendered below, from
        // day.cancelled, which carries no completion_id at all) -- future
        // days are the only other place the circle must not appear.
        const control = canLog ? completionFor(entry.entry_id, entry.completion_id) : undefined;
        return (
          <DayItem
            key={entry.entry_id}
            state={entry.status}
            name={name}
            notes={entry.notes}
            replacedName={entry.replaced?.name}
            onPress={() => onEntryPress({ kind: 'resolved', entry })}
            completion={control}
            amount={control ? amountFor(name, control) : undefined}
          />
        );
      })}
      {day.cancelled.map((target) => (
        <DayItem
          key={target.entry_id}
          state="cancelled"
          name={target.name ?? 'Untitled'}
          onPress={() => onEntryPress({ kind: 'cancelled', target })}
        />
      ))}
    </View>
  );
}

/**
 * Everything "a day looks like": header, entries, empty/out-of-window states,
 * the add button, tap-through to the entry actions sheet, and tap-to-log on
 * each entry's leading circle. Shared 1:1 by Day mode (one date, its own
 * fetch) and Week mode (the selected date, sliced out of the week's
 * already-fetched schedule) -- neither fetches here, both just hand in
 * whatever `day`/`isLoading`/`error` their own query has.
 */
export function DaySection({
  planId,
  date,
  day,
  isLoading,
  error,
  onRetry,
  planStartsOn,
  planEndsOn,
  onRequestAdd,
  onRequestEntryAction,
}: {
  planId: string;
  date: Date;
  day: DaySchedule | undefined;
  isLoading: boolean;
  error: ApiError | null;
  onRetry: () => void;
  planStartsOn: Date;
  planEndsOn: Date | null;
  onRequestAdd: (date: Date) => void;
  onRequestEntryAction: (target: EntryTarget, date: Date) => void;
}) {
  const windowState = planWindowState(date, planStartsOn, planEndsOn);
  const dateParam = format(date, 'yyyy-MM-dd');
  const queryClient = useQueryClient();
  const scheduleKey = ['plans', planId, 'schedule'] as const;

  // The schedule response only ever carries completion_id, never the amount
  // (see useCompletionsForDate) -- this is how a logged row learns what it
  // actually holds, so the amount affordance can render "Add amount" vs "45 min".
  const dayCompletionsQuery = useCompletionsForDate(dateParam);
  const completionsById = useMemo(
    () => new Map((dayCompletionsQuery.data ?? []).map((completion) => [completion.id, completion])),
    [dayCompletionsQuery.data],
  );
  const [editingCompletion, setEditingCompletion] = useState<{ completion: CompletionRead; name: string } | null>(null);

  const toggleMutation = useMutation<
    { entryId: string; completionId: string | null },
    ApiError,
    { entryId: string; completionId: string | null },
    { snapshots: [readonly unknown[], ScheduleResponse | undefined][] }
  >({
    mutationFn: async ({ entryId, completionId }) => {
      if (completionId !== null) {
        await deleteCompletion(completionId);
        return { entryId, completionId: null };
      }
      const created = await createCompletion({ schedule_entry_id: entryId, on_date: dateParam });
      return { entryId, completionId: created.id };
    },
    onMutate: async ({ entryId, completionId }) => {
      await queryClient.cancelQueries({ queryKey: scheduleKey });
      const snapshots = queryClient.getQueriesData<ScheduleResponse>({ queryKey: scheduleKey });
      const optimisticId = completionId !== null ? null : PENDING_COMPLETION_ID;
      queryClient.setQueriesData<ScheduleResponse>({ queryKey: scheduleKey }, (old) =>
        old ? applyOptimisticCompletion(old, dateParam, entryId, optimisticId) : old,
      );
      return { snapshots };
    },
    onSuccess: ({ entryId, completionId }) => {
      queryClient.setQueriesData<ScheduleResponse>({ queryKey: scheduleKey }, (old) =>
        old ? applyOptimisticCompletion(old, dateParam, entryId, completionId) : old,
      );
      // Both doors write the same data -- the Log tab's list and graph must
      // pick up a log made from here, and lose one unlogged from here.
      invalidateCompletionsQueries(queryClient);
      // A tick here can satisfy (or an unlog can un-satisfy) a goal -- the
      // Goals tab has no way to know that happened unless told.
      invalidateCommitmentsQueries(queryClient);
    },
    onError: (error, _vars, context) => {
      context?.snapshots.forEach(([key, data]) => queryClient.setQueryData(key, data));
      // The server's picture disagrees with ours (already logged, or the day
      // was cancelled elsewhere) -- converge silently rather than alarm over
      // what's really just a stale client.
      if (error.kind === 'conflict') {
        queryClient.invalidateQueries({ queryKey: scheduleKey });
        return;
      }
      Alert.alert("Couldn't update this log.", 'Try again.');
    },
  });

  function completionFor(entryId: string, propCompletionId: string | null): CompletionControl {
    const isThisEntry = toggleMutation.variables?.entryId === entryId;
    const pending = toggleMutation.isPending && isThisEntry;

    // The displayed value overrides the prop while a request for this entry
    // is in flight (the optimistic fill) and right after it settles
    // successfully (the prop won't catch up until the parent's query
    // refetches) -- onToggle below closes over this resolved value, not the
    // raw prop, so a log-then-unlog in quick succession targets the right
    // request each time instead of re-reading a stale null from props.
    let completionId = propCompletionId;
    if (pending) {
      completionId = toggleMutation.variables!.completionId !== null ? null : PENDING_COMPLETION_ID;
    } else if (isThisEntry && toggleMutation.isSuccess && toggleMutation.data?.entryId === entryId) {
      completionId = toggleMutation.data.completionId;
    }

    return {
      completionId,
      pending,
      onToggle: () => toggleMutation.mutate({ entryId, completionId }),
    };
  }

  function amountFor(name: string, control: CompletionControl): AmountControl | undefined {
    const completion = resolveLoggedCompletion(control.completionId, completionsById);
    if (!completion) {
      return undefined;
    }
    return {
      label: formatAmount(completion.value, completion.unit) ?? 'Add amount',
      onPress: () => setEditingCompletion({ completion, name }),
    };
  }

  return (
    <View style={styles.dayPage}>
      <View style={styles.dayHeader}>
        <Text style={styles.dayHeaderText} numberOfLines={1}>
          {format(date, 'EEEE, MMMM d')}
        </Text>
        {isToday(date) ? <Badge label="Today" variant="accent" /> : null}
      </View>

      <Card style={styles.dayCard}>
        {isLoading ? (
          <DaySkeleton />
        ) : error ? (
          <ScheduleErrorState error={error} onRetry={onRetry} />
        ) : (
          <DayContent
            day={day}
            windowState={windowState}
            // Can't have already done a workout that hasn't happened yet --
            // the backend rejects a future on_date anyway, so this is purely
            // about not offering a control that would only ever 422.
            canLog={!isFuture(date)}
            completionFor={completionFor}
            amountFor={amountFor}
            onEntryPress={(target) => onRequestEntryAction(target, date)}
          />
        )}
      </Card>

      {windowState === 'within' ? (
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => onRequestAdd(date)}
          accessibilityRole="button"
          accessibilityLabel="Add workout"
        >
          <Text style={styles.addButtonIcon}>⊕</Text>
        </TouchableOpacity>
      ) : null}

      {editingCompletion ? (
        <CompletionEditSheet
          planId={planId}
          completion={editingCompletion.completion}
          entryName={editingCompletion.name}
          onClose={() => setEditingCompletion(null)}
        />
      ) : null}
    </View>
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
    // Rows anchor from the top (see entryList); this bottom padding is what
    // keeps the last one from sitting under the FAB, which floats past the
    // card's own edge.
    paddingBottom: spacing.xl * 2,
  },
  addButton: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: spacing.xl,
    height: spacing.xl,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  addButtonIcon: {
    fontSize: fontSize.lg,
    color: colors.background,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  emptyText: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
  outOfWindowText: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  entryList: {
    gap: spacing.sm,
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
});
