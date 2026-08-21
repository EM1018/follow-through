import type { QueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

/**
 * Clears every cached query -- schedule, log, goals, /me, all of it -- not
 * just the ones this screen happens to know about. Without this, the next
 * account to sign in on the same device would see the previous user's data
 * for a moment before the first refetch lands. Always runs, even if the
 * network sign-out call itself fails, since a stale cache left behind is the
 * one failure mode that actually matters here.
 */
export async function signOut(queryClient: QueryClient): Promise<void> {
  try {
    await supabase.auth.signOut();
  } finally {
    queryClient.clear();
  }
}
