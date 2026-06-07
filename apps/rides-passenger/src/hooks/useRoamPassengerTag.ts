import { useCallback, useEffect, useState } from 'react';
import type { RoamPassengerTagDto } from '@roam/types/roamPassengerTag';
import { ensureRoamPassengerTag, getMyRoamPassengerTag, updateMyRoamPassengerTag } from '@/services/roamTagEdge';

export function useRoamPassengerTag(opts?: { ensureOnMount?: boolean }) {
  const [tag, setTag] = useState<RoamPassengerTagDto | null>(null);
  const [loading, setLoading] = useState(Boolean(opts?.ensureOnMount));
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (ensure = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = ensure ? await ensureRoamPassengerTag() : await getMyRoamPassengerTag();
      setTag(res.tag);
      return res.tag;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load Roam Tag');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const saveCustomName = useCallback(async (customTagName: string) => {
    const res = await updateMyRoamPassengerTag({ custom_tag_name: customTagName });
    setTag(res.tag);
    return res.tag;
  }, []);

  useEffect(() => {
    if (opts?.ensureOnMount) void refresh(true);
  }, [opts?.ensureOnMount, refresh]);

  return { tag, loading, error, refresh, saveCustomName };
}
