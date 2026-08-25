import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';

// Pinned explicitly so the first-launch reset below has one known key to clear,
// instead of relying on supabase-js's derivation from the project URL. This
// value matches what supabase-js currently derives for this project
// (sb-<project-ref>-auth-token), so existing sessions are not invalidated.
export const AUTH_STORAGE_KEY = 'sb-lycldvdeeftxklvnzkhm-auth-token';

const HAS_LAUNCHED_FLAG = 'app.has_launched';

// The iOS keychain survives app deletion, but AsyncStorage does not -- it's
// wiped on uninstall. So a missing AsyncStorage flag combined with a present
// keychain entry means we're on a fresh install reading a previous install's
// leftovers, and should clear them. This must run inside the storage adapter
// itself (not a React effect or app bootstrap) because the Supabase client is
// created at module load and reads storage immediately; anything later races
// against that read.
let resetPromise: Promise<void> | null = null;

async function ensureFreshInstallReset() {
  try {
    const seen = await AsyncStorage.getItem(HAS_LAUNCHED_FLAG);
    if (seen) return;
    // Delete keychain entry first, flag second: if this crashes in between,
    // the flag is still missing and the reset retries next launch. The
    // reverse order would mark the install clean while leaving stale data.
    await SecureStore.deleteItemAsync(AUTH_STORAGE_KEY);
    await AsyncStorage.setItem(HAS_LAUNCHED_FLAG, '1');
    console.log('[auth] fresh install detected, cleared stale keychain session');
  } catch (error) {
    console.error('[auth] fresh-install reset check failed, proceeding without it:', error);
  }
}

function gate() {
  if (!resetPromise) resetPromise = ensureFreshInstallReset();
  return resetPromise;
}

// expo-secure-store has no web implementation, and this app's app.json configures
// a web target, so web keeps using AsyncStorage; native platforms get the Keychain.
const SecureStoreAdapter = {
  getItem: async (key: string) => {
    await gate();
    try {
      return await SecureStore.getItemAsync(key);
    } catch (error) {
      console.error('[auth] SecureStore getItem failed:', key, error);
      return null;
    }
  },
  setItem: async (key: string, value: string) => {
    await gate();
    const byteSize = new Blob([value]).size;
    // Android's SharedPreferences-backed store enforces a hard 2048-byte
    // ceiling; iOS does not. This is a tripwire for approaching that limit,
    // relevant if/when Android is added -- revisit chunking then.
    if (byteSize > 3000) {
      console.warn(
        '[auth] session value approaching Android SecureStore limits:',
        byteSize,
        'bytes (Android SharedPreferences caps at 2048 bytes; revisit chunking if Android is added)',
      );
    }
    try {
      await SecureStore.setItemAsync(key, value);
    } catch (error) {
      console.error('[auth] SecureStore setItem failed:', key, byteSize, 'bytes', error);
    }
  },
  removeItem: async (key: string) => {
    await gate();
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      console.error('[auth] SecureStore removeItem failed:', key, error);
    }
  },
};

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: Platform.OS === 'web' ? AsyncStorage : SecureStoreAdapter,
      storageKey: AUTH_STORAGE_KEY,
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
