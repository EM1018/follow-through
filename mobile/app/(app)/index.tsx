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
import { describeApiError, unwrap, type ApiError } from '@/api/errors';
import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { PageDots } from '@/components/PageDots';
import { Screen } from '@/components/Screen';
import { buildPlanStack, type PlanRead, type PlanStackItem } from '@/features/home/planStack';
import { colors, fontSize, fontWeight, radius, spacing } from '@/theme';

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

function PlanPage({ plan }: { plan: PlanRead }) {
  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.planName} numberOfLines={1}>
            {plan.name}
          </Text>
          {plan.is_active ? <Badge label="Active" variant="success" /> : null}
        </View>
        {/* Inert this stage -- becomes the Month/Week/Day switcher in Stage 5. */}
        <View style={styles.viewModeStub}>
          <Text style={styles.viewModeStubText}>Month</Text>
        </View>
      </View>

      <Card style={styles.calendarStub}>
        <Text style={styles.calendarStubText}>
          {plan.starts_on} – {plan.ends_on ?? 'Ongoing'}
        </Text>
      </Card>
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
        {item.kind === 'plan' ? <PlanPage plan={item.plan} /> : <CreatePage />}
      </View>
    ),
    [pageHeight],
  );

  return (
    <Screen style={styles.screen}>
      <View style={styles.container} onLayout={onContainerLayout}>
        {plansQuery.isLoading ? <ActivityIndicator style={styles.centered} color={colors.accent} /> : null}

        {plansQuery.isError ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>{describeApiError(plansQuery.error)}</Text>
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
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  errorText: {
    fontSize: fontSize.md,
    color: colors.danger,
    textAlign: 'center',
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
  viewModeStub: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  viewModeStubText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textMuted,
  },
  calendarStub: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  calendarStubText: {
    fontSize: fontSize.md,
    color: colors.textMuted,
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
