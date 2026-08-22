import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';

// expo-secure-store has no web implementation, and this app's app.json configures
// a web target, so web keeps using AsyncStorage; native platforms get the Keychain.
const SecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: async (key: string, value: string) => {
    if (value.length > 1800) {
      console.warn('[auth] session near SecureStore limit:', value.length);
    }
    return SecureStore.setItemAsync(key, value);
  },
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: Platform.OS === 'web' ? AsyncStorage : SecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false, // required in RN -- this is a browser-only mechanism
    },
  },
);

// Tokens can go stale while the app is backgrounded without this, per Supabase's RN guidance.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
