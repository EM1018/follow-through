import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export default function AppHome() {
  const { session } = useSession();

  return (
    <View style={styles.container}>
      <Text style={styles.text}>Signed in as {session?.user.email}</Text>
      <TouchableOpacity style={styles.button} onPress={() => supabase.auth.signOut()}>
        <Text style={styles.buttonText}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
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
});
