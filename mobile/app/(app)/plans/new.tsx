import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { api } from '@/api/client';
import { describeApiError, unwrap, type ApiError } from '@/api/errors';
import type { components } from '@/api/schema';

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function NewPlanScreen() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [startsOn, setStartsOn] = useState(todayUtc());
  const [endsOn, setEndsOn] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [visibleToFriends, setVisibleToFriends] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation<components['schemas']['PlanRead'], ApiError, void>({
    mutationFn: () =>
      unwrap(
        api.POST('/plans', {
          body: {
            name,
            starts_on: startsOn,
            ends_on: endsOn.trim() === '' ? null : endsOn,
            is_active: isActive,
            visible_to_friends: visibleToFriends,
          },
        }),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      router.back();
    },
    onError: (err: ApiError) => setError(describeApiError(err)),
  });

  function handleSubmit() {
    setError(null);
    if (name.trim() === '') {
      setError('Name is required.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn)) {
      setError('Starts on must be YYYY-MM-DD.');
      return;
    }
    createMutation.mutate();
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. PPL" />

      <Text style={styles.label}>Starts on (YYYY-MM-DD)</Text>
      <TextInput style={styles.input} value={startsOn} onChangeText={setStartsOn} placeholder={todayUtc()} />

      <Text style={styles.label}>Ends on (YYYY-MM-DD, optional)</Text>
      <TextInput style={styles.input} value={endsOn} onChangeText={setEndsOn} placeholder="leave blank" />

      <View style={styles.switchRow}>
        <Text style={styles.label}>Active</Text>
        <Switch value={isActive} onValueChange={setIsActive} />
      </View>

      <View style={styles.switchRow}>
        <Text style={styles.label}>Visible to friends</Text>
        <Switch value={visibleToFriends} onValueChange={setVisibleToFriends} />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={createMutation.isPending}>
        {createMutation.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Create plan</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  error: {
    color: 'red',
    marginTop: 8,
  },
  button: {
    backgroundColor: '#208AEF',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
