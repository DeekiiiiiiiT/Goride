import { useCallback, useEffect, useState } from 'react';
import type { IncomingPickupLocationRequestDto } from '@roam/types/pickupLocationRequest';
import { supabase } from '@roam/auth-client';
import { PICKUP_LOCATION_REQUEST } from '@/lib/pickupLocationRequestFlags';
import { listIncomingPickupLocationRequests } from '@/services/pickupLocationRequestEdge';

/** Rider incoming poll — 5s when tab visible (booker outgoing poll is 3s). */
const POLL_MS = 5000;

type State = {
  requests: IncomingPickupLocationRequestDto[];
  loading: boolean;
};

export function useIncomingPickupLocationRequests(enabled = PICKUP_LOCATION_REQUEST) {
  const [state, setState] = useState<State>({ requests: [], loading: enabled });
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setSessionReady(false);
      return;
    }
    let cancelled = false;
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled) setSessionReady(Boolean(session?.user));
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionReady(Boolean(session?.user));
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [enabled]);

  const refresh = useCallback(async () => {
    if (!enabled || !sessionReady) {
      setState({ requests: [], loading: false });
      return;
    }
    try {
      const { requests } = await listIncomingPickupLocationRequests();
      setState({ requests, loading: false });
    } catch {
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, [enabled, sessionReady]);

  useEffect(() => {
    if (!enabled || !sessionReady) {
      setState({ requests: [], loading: false });
      return;
    }

    let cancelled = false;

    const poll = async () => {
      if (document.visibilityState !== 'visible') return;
      if (cancelled) return;
      await refresh();
    };

    setState((prev) => ({ ...prev, loading: prev.requests.length === 0 }));
    void poll();
    const interval = window.setInterval(() => {
      void poll();
    }, POLL_MS);

    const onVisible = () => {
      if (document.visibilityState === 'visible') void poll();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, sessionReady, refresh]);

  const primaryRequest = state.requests[0] ?? null;

  return {
    requests: state.requests,
    primaryRequest,
    loading: state.loading,
    refresh,
  };
}
