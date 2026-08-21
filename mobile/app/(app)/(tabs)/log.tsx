import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { startOfToday } from 'date-fns';
import { useMemo, useRef, useState } from 'react';
import { SectionList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { ApiError } from '@/api/errors';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { invalidateCommitmentsQueries } from '@/features/goals/commitments';
import { ActivityFilterChips } from '@/features/logs/ActivityFilterChips';
import { presentActivities, useActivities, type Activity } from '@/features/logs/activities';
import {
  COMPLETIONS_QUERY_KEY,
  completionIsEntryLinked,
  deleteCompletion,
  listCompletions,
  type CompletionRead,
} from '@/features/logs/completions';
import { ContributionGraph } from '@/features/logs/ContributionGraph';
import { buildGrid } from '@/features/logs/graph';
import { LogErrorState } from '@/features/logs/LogErrorState';
import { EMPTY_LOG_SUBTITLE, EMPTY_LOG_TITLE } from '@/features/logs/logCopy';
import { LogRow } from '@/features/logs/LogRow';
import { LogSheet } from '@/features/logs/LogSheet';
import { LogSkeleton } from '@/features/logs/LogSkeleton';
import { groupByDate, sectionLabel } from '@/features/logs/sections';
import { earlierWindow, graphWindow, type DateRange } from '@/features/logs/window';
import { invalidateAllScheduleQueries } from '@/features/schedule/api';
import { ScheduleErrorState } from '@/features/schedule/ScheduleErrorState';
import { colors, fontSize, fontWeight, spacing } from '@/theme';

type CompletionsData = InfiniteData<CompletionRead[], DateRange>;
type SheetState = { mode: 'create' } | { mode: 'edit'; completion: CompletionRead };

export default function LogScreen() {
  const queryClient = useQueryClient();
  const today = useMemo(() => startOfToday(), []);
  const sectionListRef = useRef<SectionList<CompletionRead>>(null);

  const query = useInfiniteQuery<CompletionRead[], ApiError, CompletionsData, typeof COMPLETIONS_QUERY_KEY, DateRange>({
    queryKey: COMPLETIONS_QUERY_KEY,
    queryFn: ({ pageParam }) => listCompletions(pageParam),
    initialPageParam: graphWindow(today),
    getNextPageParam: (lastPage, _pages, lastPageParam) =>
      lastPage.length === 0 ? undefined : earlierWindow(lastPageParam.from),
  });

  const activitiesQuery = useActivities();

  const rows = useMemo(() => query.data?.pages.flat() ?? [], [query.data]);

  const chips = useMemo(
    () => presentActivities(rows, activitiesQuery.data?.activities ?? []),
    [rows, activitiesQuery.data],
  );

  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);

  // Filtering happens once, here, above both children -- the graph and the
  // list must never disagree about which rows are in play.
  const filteredRows = useMemo(
    () => (selectedActivity ? rows.filter((row) => row.activity === selectedActivity) : rows),
    [rows, selectedActivity],
  );

  const sections = useMemo(
    () =>
      groupByDate(filteredRows).map((section) => ({
        title: sectionLabel(section.date, today),
        data: section.rows,
      })),
    [filteredRows, today],
  );

  const grid = useMemo(() => buildGrid(filteredRows, today), [filteredRows, today]);
  const graphTotal = useMemo(() => grid.flat().reduce((sum, cell) => sum + cell.count, 0), [grid]);

  const [deleteError, setDeleteError] = useState<{ completion: CompletionRead; error: ApiError } | null>(null);

  const deleteMutation = useMutation<
    void,
    ApiError,
    CompletionRead,
    { previous: CompletionsData | undefined }
  >({
    mutationFn: (completion) => deleteCompletion(completion.id),
    onMutate: async (completion) => {
      await queryClient.cancelQueries({ queryKey: COMPLETIONS_QUERY_KEY });
      setDeleteError(null);
      const previous = queryClient.getQueryData<CompletionsData>(COMPLETIONS_QUERY_KEY);
      queryClient.setQueryData<CompletionsData>(COMPLETIONS_QUERY_KEY, (old) =>
        old
          ? { ...old, pages: old.pages.map((page) => page.filter((row) => row.id !== completion.id)) }
          : old,
      );
      return { previous };
    },
    onSuccess: (_data, completion) => {
      // Both doors write the same data -- an entry-linked log deleted here
      // must clear the filled circle it left on the schedule, or it stays
      // filled for a completion that no longer exists.
      if (completionIsEntryLinked(completion)) {
        invalidateAllScheduleQueries(queryClient);
      }
      // Whatever this deleted log satisfied (entry-linked or not) may no
      // longer be satisfied once it's gone.
      invalidateCommitmentsQueries(queryClient);
    },
    onError: (error, completion, context) => {
      if (context?.previous) {
        queryClient.setQueryData(COMPLETIONS_QUERY_KEY, context.previous);
      }
      setDeleteError({ completion, error });
    },
  });

  const [sheet, setSheet] = useState<SheetState | null>(null);

  // Resets to the base 8-week window and scrolls to top -- extended only far
  // enough to include a back-logged save that lands outside it, so the user
  // doesn't save a thing and watch nothing appear.
  async function handleSaved(completion: CompletionRead) {
    setSheet(null);
    // A new standalone log, or a changed value/unit on an edit, can change
    // what a goal's blocks show -- the Goals tab has no other way to learn that.
    invalidateCommitmentsQueries(queryClient);
    const base = graphWindow(today);
    const from = completion.on_date < base.from ? completion.on_date : base.from;
    const range = { from, to: base.to };
    try {
      const freshRows = await listCompletions(range);
      queryClient.setQueryData<CompletionsData>(COMPLETIONS_QUERY_KEY, {
        pages: [freshRows],
        pageParams: [range],
      });
    } catch {
      // The save already succeeded; a failed refetch just leaves the list stale until the next retry.
    }
    requestAnimationFrame(() => {
      try {
        sectionListRef.current?.scrollToLocation({ sectionIndex: 0, itemIndex: 0, animated: false, viewOffset: 0 });
      } catch {
        // No rows to scroll to.
      }
    });
  }

  const hasCache = rows.length > 0;
  const isEmpty = query.data !== undefined && rows.length === 0;

  return (
    <Screen style={styles.screen}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Log</Text>
        <TouchableOpacity
          onPress={() => setSheet({ mode: 'create' })}
          accessibilityRole="button"
          accessibilityLabel="Log activity"
        >
          <Text style={styles.addIcon}>⊕</Text>
        </TouchableOpacity>
      </View>

      {query.isLoading && !query.data ? (
        <View style={styles.padded}>
          <LogSkeleton />
        </View>
      ) : null}

      {query.isError && !hasCache ? (
        <View style={styles.centered}>
          <LogErrorState onRetry={() => query.refetch()} />
        </View>
      ) : null}

      {isEmpty ? (
        <View style={styles.centered}>
          <EmptyState
            title={EMPTY_LOG_TITLE}
            subtitle={EMPTY_LOG_SUBTITLE}
            action={<Button label="Log activity" onPress={() => setSheet({ mode: 'create' })} />}
          />
        </View>
      ) : null}

      {hasCache ? (
        <>
          {query.isError ? (
            <View style={styles.padded}>
              <LogErrorState onRetry={() => query.refetch()} />
            </View>
          ) : null}

          {deleteError ? (
            <View style={styles.padded}>
              <ScheduleErrorState
                error={deleteError.error}
                onRetry={() => deleteMutation.mutate(deleteError.completion)}
              />
            </View>
          ) : null}

          <SectionList
            ref={sectionListRef}
            sections={sections}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <LogRow
                completion={item}
                onPress={(completion) => setSheet({ mode: 'edit', completion })}
                onDelete={(completion) => deleteMutation.mutate(completion)}
              />
            )}
            renderSectionHeader={({ section }) => (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionHeaderText}>{section.title}</Text>
              </View>
            )}
            stickySectionHeadersEnabled
            ListHeaderComponent={
              <View style={styles.graphHeader}>
                <View style={styles.padded}>
                  <ContributionGraph grid={grid} totalCount={graphTotal} />
                </View>
                <ActivityFilterChips
                  activities={chips}
                  selected={selectedActivity}
                  onSelect={setSelectedActivity}
                />
              </View>
            }
            ListFooterComponent={
              query.hasNextPage ? (
                <View style={styles.footer}>
                  <Button
                    label="Load more"
                    variant="secondary"
                    loading={query.isFetchingNextPage}
                    onPress={() => query.fetchNextPage()}
                  />
                </View>
              ) : null
            }
          />
        </>
      ) : null}

      {sheet ? (
        <LogSheet {...sheet} onClose={() => setSheet(null)} onSaved={handleSaved} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  addIcon: {
    fontSize: fontSize.xl,
    color: colors.accent,
  },
  padded: {
    paddingHorizontal: spacing.lg,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  graphHeader: {
    gap: spacing.md,
    paddingBottom: spacing.md,
  },
  sectionHeader: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    backgroundColor: colors.background,
  },
  sectionHeaderText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textMuted,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
});
