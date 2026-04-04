import { useState, useEffect, useCallback } from "react";
import { api } from "../services/api";
import type { TollFinancialEvent, TollUnifiedEventsMeta } from "../types/tollFinancialEvent";

export function useTollUnifiedEvents(
  driverId: string | undefined,
  options?: {
    from?: string;
    to?: string;
    kinds?: string;
    batchId?: string;
    limit?: number;
  },
) {
  const [data, setData] = useState<TollFinancialEvent[]>([]);
  const [meta, setMeta] = useState<TollUnifiedEventsMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getTollUnifiedEvents({
        driverId,
        from: options?.from,
        to: options?.to,
        kinds: options?.kinds,
        batchId: options?.batchId,
        limit: options?.limit ?? 100,
        offset: 0,
      });
      setData(res.data ?? []);
      setMeta(res.meta ?? null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load unified toll events";
      setError(msg);
      setData([]);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }, [driverId, options?.from, options?.to, options?.kinds, options?.batchId, options?.limit]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, meta, loading, error, refresh: load };
}
