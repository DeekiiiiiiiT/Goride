import { useEffect, useState } from 'react';
import { API_ENDPOINTS } from '../services/apiConfig';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../utils/supabase/client';

export type FuelSplitPaymentGate = {
  /** Module enabled for this org. */
  enabled: boolean;
  /** True while the modules fetch is in flight. */
  loading: boolean;
};

/**
 * Org module — Gas Card + Cash split fills (on by default for fleet).
 * Reads the same /enterprise/me/modules shell as fleet.
 */
export function useFuelSplitPaymentEnabled(): FuelSplitPaymentGate {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user) {
        if (!cancelled) {
          setEnabled(false);
          setLoading(false);
        }
        return;
      }
      if (!cancelled) setLoading(true);
      try {
        let { data: { session } } = await supabase.auth.getSession();
        const expiresAt = session?.expires_at ?? 0;
        const now = Math.floor(Date.now() / 1000);
        if (session && expiresAt - now < 90) {
          const refreshed = await supabase.auth.refreshSession();
          if (!refreshed.error && refreshed.data.session) session = refreshed.data.session;
        }
        const token = session?.access_token;
        if (!token) {
          if (!cancelled) {
            setEnabled(false);
            setLoading(false);
          }
          return;
        }
        const res = await fetch(`${API_ENDPOINTS.fleetCore}/enterprise/me/modules`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          if (!cancelled) {
            setEnabled(false);
            setLoading(false);
          }
          return;
        }
        const data = await res.json();
        const on = data?.effectiveModules?.fuelSplitPayment === true;
        if (!cancelled) {
          setEnabled(on);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setEnabled(false);
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return { enabled, loading };
}
