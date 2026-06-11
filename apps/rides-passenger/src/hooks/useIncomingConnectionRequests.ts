import { useCallback, useEffect, useState } from 'react';
import type { RoamConnectionRequestDto } from '@roam/types/roamConnections';
import { supabase } from '@roam/auth-client';
import { ROAM_CONNECTIONS } from '@/lib/roamConnectionFlags';
import { listIncomingConnectionRequests } from '@/services/roamConnectionsEdge';

const POLL_MS = 30_000;

type State = {
  requests: RoamConnectionRequestDto[];
  loading: boolean;
};

export function useIncomingConnectionRequests(enabled = ROAM_CONNECTIONS) {
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
      const { requests } = await listIncomingConnectionRequests();
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
    const interval = window.setInterval(() => void poll(), POLL_MS);
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

  return {
    requests: state.requests,
    primaryRequest: state.requests[0] ?? null,
    loading: state.loading,
    refresh,
  };
}
