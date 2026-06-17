import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  checkGeolocationGranted,
  isNativeCapacitorPlatform,
  type PermissionGrantState,
} from '@roam/types';
import { grantStateToStatusLabelKey } from '@/utils/passengerLocationAccess';

export function useGeolocationPermissionState(enabled = true) {
  const [grantState, setGrantState] = useState<PermissionGrantState>('prompt');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const state = await checkGeolocationGranted();
      setGrantState(state);
    } catch {
      setGrantState('prompt');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled) return;

    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);

    let removeAppListener: (() => void) | undefined;

    if (isNativeCapacitorPlatform()) {
      void (async () => {
        try {
          const { App } = await import('@capacitor/app');
          const handle = await App.addListener('appStateChange', ({ isActive }) => {
            if (isActive) void refresh();
          });
          removeAppListener = () => void handle.remove();
        } catch {
          /* ignore */
        }
      })();
    }

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      removeAppListener?.();
    };
  }, [enabled, refresh]);

  const statusLabelKey = useMemo(() => grantStateToStatusLabelKey(grantState), [grantState]);

  const rowStatusLabelKey = useMemo(() => {
    if (grantState === 'granted') return 'locationRowStatusGranted' as const;
    if (grantState === 'denied') return 'locationRowStatusDenied' as const;
    return 'locationRowStatusPrompt' as const;
  }, [grantState]);

  return { grantState, loading, refresh, statusLabelKey, rowStatusLabelKey };
}
