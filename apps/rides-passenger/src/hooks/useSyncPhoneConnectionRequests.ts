import { useEffect, useRef } from 'react';
import { supabase } from '@roam/auth-client';
import { ROAM_CONNECTIONS } from '@/lib/roamConnectionFlags';
import { syncPhoneConnectionRequests } from '@/services/roamConnectionsEdge';

/** Match pending phone invites to the signed-in user after login (idempotent). */
export function useSyncPhoneConnectionRequests() {
  const syncedRef = useRef(false);

  useEffect(() => {
    if (!ROAM_CONNECTIONS) return;

    const run = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user || syncedRef.current) return;
      syncedRef.current = true;
      try {
        await syncPhoneConnectionRequests();
      } catch {
        syncedRef.current = false;
      }
    };

    void run();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        syncedRef.current = false;
        void run();
      }
    });
    return () => subscription.unsubscribe();
  }, []);
}
