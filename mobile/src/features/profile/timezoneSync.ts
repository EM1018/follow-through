import { useEffect, useRef } from 'react';

import { getMe, updateMe } from './me';

export function deviceTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Only worth a write when the two actually disagree -- never PATCH on every launch. */
export function timezoneNeedsSync(deviceZone: string, storedZone: string): boolean {
  return deviceZone !== storedZone;
}

/**
 * Fire-and-forget: reads /me, PATCHes only if the device's own zone differs
 * from what's stored. A failure here must never block the app or surface an
 * error -- the stored zone already works as a fallback, so a missed sync
 * just corrects itself the next time the app opens.
 *
 * `deviceZone` defaults to the real device zone; tests pass one explicitly.
 */
export async function syncTimezone(deviceZone: string = deviceTimezone()): Promise<void> {
  try {
    const me = await getMe();
    if (timezoneNeedsSync(deviceZone, me.timezone)) {
      await updateMe({ timezone: deviceZone });
    }
  } catch {
    // Silent by design -- see docstring above.
  }
}

/**
 * Runs syncTimezone once per signed-in user per app session -- keyed by
 * user id (not a plain "have we ever run" flag) so signing out and into a
 * different account still triggers a fresh sync for the new user.
 */
export function useTimezoneSync(userId: string | undefined): void {
  const syncedUserIds = useRef(new Set<string>());

  useEffect(() => {
    if (userId && !syncedUserIds.current.has(userId)) {
      syncedUserIds.current.add(userId);
      syncTimezone();
    }
  }, [userId]);
}
