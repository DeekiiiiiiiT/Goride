import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../../services/api';
import type { FuelExceptionAssignment } from './FuelExceptionQueue';

const LEGACY_LOCAL_KEY = 'fuel_exception_assignments';

function readLegacyLocal(): Record<string, FuelExceptionAssignment> {
  try {
    const raw = localStorage.getItem(LEGACY_LOCAL_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, FuelExceptionAssignment>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function clearLegacyLocal() {
  try {
    localStorage.removeItem(LEGACY_LOCAL_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Org-visible exception assignments (GET/PUT /fuel/exception-assignments).
 * One-time migrates any leftover localStorage keys, then stops writing locally.
 */
export function useFuelExceptionAssignments() {
  const [assignments, setAssignments] = useState<Record<string, FuelExceptionAssignment>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const legacy = readLegacyLocal();
      try {
        const remote = await api.getFuelExceptionAssignments();
        if (cancelled) return;
        const merged = { ...legacy, ...remote };
        setAssignments(merged);
        // Push legacy-only keys to server once
        const remoteKeys = new Set(Object.keys(remote));
        for (const [cycleId, a] of Object.entries(legacy)) {
          if (remoteKeys.has(cycleId)) continue;
          try {
            await api.putFuelExceptionAssignment(cycleId, a.note);
          } catch {
            /* keep merged local until next load */
          }
        }
        if (Object.keys(legacy).length) clearLegacyLocal();
      } catch {
        if (!cancelled) setAssignments(legacy);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const assign = useCallback(async (cycleId: string, note: string) => {
    const optimistic: FuelExceptionAssignment = {
      note,
      at: new Date().toISOString(),
    };
    setAssignments((prev) => ({ ...prev, [cycleId]: optimistic }));
    try {
      const saved = await api.putFuelExceptionAssignment(cycleId, note);
      setAssignments((prev) => ({ ...prev, [cycleId]: saved }));
      toast.success('Exception assigned', { description: note });
    } catch (err) {
      toast.error('Could not save assignment', {
        description: String((err as Error)?.message || err),
      });
    }
  }, []);

  return { assignments, assign, loaded };
}
