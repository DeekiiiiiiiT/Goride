import { useEffect, useState } from 'react';
import { API_ENDPOINTS } from '../services/apiConfig';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../utils/supabase/client';

/**
 * Opt-in org module — Gas Card + Cash split fills.
 * Reads the same /enterprise/me/modules shell as fleet.
 */
export function useFuelSplitPaymentEnabled(): boolean {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user) {
        if (!cancelled) setEnabled(false);
        return;
      }
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
          if (!cancelled) setEnabled(false);
          return;
        }
        const res = await fetch(`${API_ENDPOINTS.fleetCore}/enterprise/me/modules`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          if (!cancelled) setEnabled(false);
          return;
        }
        const data = await res.json();
        const on = data?.effectiveModules?.fuelSplitPayment === true;
        if (!cancelled) setEnabled(on);
      } catch {
        if (!cancelled) setEnabled(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return enabled;
}
