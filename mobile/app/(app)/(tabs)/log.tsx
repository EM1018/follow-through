import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { startOfToday } from 'date-fns';
import { useMemo, useState } from 'react';
import { SectionList, StyleSheet, Text, View } from 'react-native';

import type { ApiError } from '@/api/errors';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { ActivityFilterChips } from '@/features/logs/ActivityFilterChips';
import { presentActivities, useActivities, type Activity } from '@/features/logs/activities';
import { deleteCompletion, listCompletions, type CompletionRead } from '@/features/logs/completions';
import { ContributionGraph } from '@/features/logs/ContributionGraph';
import { buildGrid } from '@/features/logs/graph';
import { LogErrorState } from '@/features/logs/LogErrorState';
import { EMPTY_LOG_SUBTITLE, EMPTY_LOG_TITLE } from '@/features/logs/logCopy';
import { LogRow } from '@/features/logs/LogRow';
import { LogSkeleton } from '@/features/logs/LogSkeleton';
import { groupByDate, sectionLabel } from '@/features/logs/sections';
import { earlierWindow, graphWindow, type DateRange } from '@/features/logs/window';
import { ScheduleErrorState } from '@/features/schedule/ScheduleErrorState';
import { colors, fontSize, fontWeight, spacing } from '@/theme';

const COMPLETIONS_QUERY_KEY = ['completions'] as const;

type CompletionsData = InfiniteData<CompletionRead[], DateRange>;

export default function LogScreen() {
  const queryClient = useQueryClient();
  const today = useMemo(() => startOfToday(), []);

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

  const [deleteError, setDeleteError] = useState<{ id: string; error: ApiError } | null>(null);

  const deleteMutation = useMutation<void, ApiError, string, { previous: CompletionsData | undefined }>({
    mutationFn: (id) => deleteCompletion(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: COMPLETIONS_QUERY_KEY });
      setDeleteError(null);
      const previous = queryClient.getQueryData<CompletionsData>(COMPLETIONS_QUERY_KEY);
      queryClient.setQueryData<CompletionsData>(COMPLETIONS_QUERY_KEY, (old) =>
        old ? { ...old, pages: old.pages.map((page) => page.filter((row) => row.id !== id)) } : old,
      );
      return { previous };
    },
    onError: (error, id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(COMPLETIONS_QUERY_KEY, context.previous);
      }
      setDeleteError({ id, error });
    },
  });

  const hasCache = rows.length > 0;
  const isEmpty = query.data !== undefined && rows.length === 0;

  return (
    <Screen style={styles.screen}>
      <Text style={styles.title}>Log</Text>

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
          <EmptyState title={EMPTY_LOG_TITLE} subtitle={EMPTY_LOG_SUBTITLE} />
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
                onRetry={() => deleteMutation.mutate(deleteError.id)}
              />
            </View>
          ) : null}

          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <LogRow completion={item} onDelete={(id) => deleteMutation.mutate(id)} />
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 0,
  },
  title: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.text,
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
