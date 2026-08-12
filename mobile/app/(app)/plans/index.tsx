import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { api } from '@/api/client';
import { describeApiError, unwrap, type ApiError } from '@/api/errors';
import type { components } from '@/api/schema';
import { supabase } from '@/lib/supabase';

type PlanRead = components['schemas']['PlanRead'];

export default function PlansScreen() {
  const queryClient = useQueryClient();

  const plansQuery = useQuery<PlanRead[], ApiError>({
    queryKey: ['plans'],
    queryFn: () => unwrap(api.GET('/plans')),
  });

  const activateMutation = useMutation<PlanRead, ApiError, string, { previous?: PlanRead[] }>({
    mutationFn: (planId: string) =>
      unwrap(
        api.PATCH('/plans/{plan_id}', {
          params: { path: { plan_id: planId } },
          body: { is_active: true },
        }),
      ),
    onMutate: async (planId: string) => {
      await queryClient.cancelQueries({ queryKey: ['plans'] });
      const previous = queryClient.getQueryData<PlanRead[]>(['plans']);
      queryClient.setQueryData<PlanRead[]>(['plans'], (plans) =>
        plans?.map((plan) => ({ ...plan, is_active: plan.id === planId })),
      );
      return { previous };
    },
    onError: (error, _planId, context) => {
      queryClient.setQueryData(['plans'], context?.previous);
      Alert.alert('Could not activate plan', describeApiError(error));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
    },
  });

  const deleteMutation = useMutation<void, ApiError, string>({
    mutationFn: (planId: string) =>
      unwrap(api.DELETE('/plans/{plan_id}', { params: { path: { plan_id: planId } } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['plans'] }),
    onError: (error) => {
      if (error.kind === 'not_found') {
        // already gone -- just refresh the list, nothing to navigate back from here
        queryClient.invalidateQueries({ queryKey: ['plans'] });
        return;
      }
      Alert.alert('Could not delete plan', describeApiError(error));
    },
  });

  function confirmDelete(plan: PlanRead) {
    Alert.alert('Delete plan?', plan.name, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate(plan.id) },
    ]);
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <TouchableOpacity onPress={() => router.push('/(app)/plans/new')}>
              <Text style={styles.headerButton}>Add</Text>
            </TouchableOpacity>
          ),
          headerLeft: () => (
            <TouchableOpacity onPress={() => supabase.auth.signOut()}>
              <Text style={styles.headerButton}>Sign out</Text>
            </TouchableOpacity>
          ),
        }}
      />

      {plansQuery.isLoading ? <ActivityIndicator style={styles.centered} /> : null}

      {plansQuery.isError ? (
        <View style={styles.centered}>
          <Text style={styles.error}>{plansQuery.error ? describeApiError(plansQuery.error) : null}</Text>
        </View>
      ) : null}

      {plansQuery.data && plansQuery.data.length === 0 ? (
        <View style={styles.centered}>
          <Text>No plans yet.</Text>
        </View>
      ) : null}

      {plansQuery.data && plansQuery.data.length > 0 ? (
        <FlatList
          data={plansQuery.data}
          keyExtractor={(plan) => plan.id}
          renderItem={({ item: plan }) => (
            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.name}>{plan.name}</Text>
                <Text style={styles.dates}>
                  {plan.starts_on} {plan.ends_on ? `→ ${plan.ends_on}` : ''}
                </Text>
              </View>
              {plan.is_active ? (
                <Text style={styles.activeBadge}>Active</Text>
              ) : (
                <TouchableOpacity onPress={() => activateMutation.mutate(plan.id)}>
                  <Text style={styles.actionText}>Activate</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => confirmDelete(plan)}>
                <Text style={styles.deleteText}>Delete</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    color: 'red',
  },
  headerButton: {
    color: '#208AEF',
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  rowText: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
  },
  dates: {
    color: '#666',
    fontSize: 13,
  },
  activeBadge: {
    color: '#1a9c4a',
    fontWeight: '600',
  },
  actionText: {
    color: '#208AEF',
    fontWeight: '600',
  },
  deleteText: {
    color: 'red',
    fontWeight: '600',
  },
});
