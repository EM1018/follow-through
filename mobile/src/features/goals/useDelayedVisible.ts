import { useEffect, useRef, useState } from 'react';

const SHOW_DELAY_MS = 200;
const MIN_VISIBLE_MS = 300;

/**
 * Debounces a loading flag into a skeleton-visible flag: turning `active`
 * off inside SHOW_DELAY_MS never shows anything at all (a fast response
 * produces no flash), and once shown, stays visible for at least
 * MIN_VISIBLE_MS even if `active` clears sooner (no flicker).
 */
export function useDelayedVisible(active: boolean): boolean {
  const [visible, setVisible] = useState(false);
  const shownAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      if (shownAtRef.current === null) {
        setVisible(false);
        return;
      }
      const elapsed = Date.now() - shownAtRef.current;
      const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);
      const hideTimer = setTimeout(() => {
        shownAtRef.current = null;
        setVisible(false);
      }, remaining);
      return () => clearTimeout(hideTimer);
    }

    const showTimer = setTimeout(() => {
      shownAtRef.current = Date.now();
      setVisible(true);
    }, SHOW_DELAY_MS);
    return () => clearTimeout(showTimer);
  }, [active]);

  return visible;
}
