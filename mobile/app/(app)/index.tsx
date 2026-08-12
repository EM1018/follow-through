import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { api } from '@/api/client';
import { unwrap } from '@/api/errors';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export default function AppHome() {
  const { session } = useSession();
  const plansQuery = useQuery({
    queryKey: ['plans'],
    queryFn: () => unwrap(api.GET('/plans')),
  });

  return (
    <View style={styles.container}>
      <Text style={styles.text}>Signed in as {session?.user.email}</Text>
      <TouchableOpacity style={styles.button} onPress={() => supabase.auth.signOut()}>
        <Text style={styles.buttonText}>Sign out</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>GET /plans</Text>
      {plansQuery.isLoading ? <ActivityIndicator /> : null}
      {plansQuery.isError ? <Text style={styles.error}>{JSON.stringify(plansQuery.error)}</Text> : null}
      {plansQuery.data ? (
        <ScrollView style={styles.jsonBox}>
          <Text style={styles.json}>{JSON.stringify(plansQuery.data, null, 2)}</Text>
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 24,
  },
  text: {
    fontSize: 16,
  },
  button: {
    backgroundColor: '#208AEF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 16,
  },
  error: {
    color: 'red',
  },
  jsonBox: {
    alignSelf: 'stretch',
    maxHeight: 300,
    backgroundColor: '#f2f2f2',
    borderRadius: 8,
    padding: 12,
  },
  json: {
    fontFamily: 'Menlo',
    fontSize: 12,
  },
});
