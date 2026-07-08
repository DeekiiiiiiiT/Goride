import { useCallback, useEffect, useState } from 'react';
import type { TollCrossingDto, TollUiState } from '@roam/types/tollCrossings';
import { ridesFetchTollCrossings } from '@/services/ridesEdge';

const POLL_MS = 10_000;

export function useRideTollCrossings(rideId: string | undefined, enabled: boolean) {
  const [crossings, setCrossings] = useState<TollCrossingDto[]>([]);
  const [actualTollsMinor, setActualTollsMinor] = useState(0);
  const [state, setState] = useState<TollUiState>('empty');

  const refresh = useCallback(async () => {
    if (!rideId || !enabled) return;
    setState((prev) => (prev === 'data' ? 'data' : 'loading'));
    try {
      const res = await ridesFetchTollCrossings(rideId);
      setCrossings(res.crossings ?? []);
      setActualTollsMinor(res.actual_tolls_minor ?? 0);
      setState(res.crossings?.length || res.actual_tolls_minor > 0 ? 'data' : 'empty');
    } catch {
      setState('error');
    }
  }, [rideId, enabled]);

  useEffect(() => {
    if (!rideId || !enabled) {
      setCrossings([]);
      setActualTollsMinor(0);
      setState('empty');
      return;
    }
    void refresh();
    const t = window.setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(t);
  }, [rideId, enabled, refresh]);

  return { crossings, actualTollsMinor, state, refresh };
}
