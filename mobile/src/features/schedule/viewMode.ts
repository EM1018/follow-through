import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

export type ViewMode = 'month' | 'week' | 'day';

const STORAGE_KEY = 'schedule-view-mode';
const VALID_MODES: ViewMode[] = ['month', 'week', 'day'];

function isViewMode(value: unknown): value is ViewMode {
  return typeof value === 'string' && (VALID_MODES as string[]).includes(value);
}

/** Single shared view-mode preference, persisted across reloads. */
export function useViewMode() {
  const [viewMode, setViewModeState] = useState<ViewMode>('day');

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (!cancelled && isViewMode(stored)) {
        setViewModeState(stored);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    AsyncStorage.setItem(STORAGE_KEY, mode);
  }, []);

  return { viewMode, setViewMode };
}
