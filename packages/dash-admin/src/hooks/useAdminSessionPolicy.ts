import { useEffect, useRef } from 'react';
import { supabaseDashAdmin as supabase } from '@roam/auth-client';

const ABSOLUTE_MS = 8 * 60 * 60 * 1000;
const DEFAULT_IDLE_MS = 30 * 60 * 1000;

/**
 * Idle timeout from platform.staff_security.sessionTimeoutMinutes (0 = no idle logout).
 * Absolute 8h max always applies.
 */
export function useAdminSessionPolicy(sessionTimeoutMinutes?: number | null) {
  const loginAt = useRef(Date.now());
  const lastActive = useRef(Date.now());
  // platform.staff_security — minutes; null uses legacy 30m until settings load
  const idleMinutes =
    sessionTimeoutMinutes === undefined || sessionTimeoutMinutes === null
      ? DEFAULT_IDLE_MS / 60_000
      : sessionTimeoutMinutes;

  useEffect(() => {
    const onActivity = () => {
      lastActive.current = Date.now();
    };
    window.addEventListener('mousemove', onActivity);
    window.addEventListener('keydown', onActivity);
    window.addEventListener('click', onActivity);

    const idleMs = idleMinutes > 0 ? idleMinutes * 60_000 : null;

    const interval = setInterval(() => {
      const now = Date.now();
      const idleExpired = idleMs != null && now - lastActive.current > idleMs;
      if (now - loginAt.current > ABSOLUTE_MS || idleExpired) {
        void supabase.auth.signOut();
        window.location.href = '/admin';
      }
    }, 60_000);

    return () => {
      window.removeEventListener('mousemove', onActivity);
      window.removeEventListener('keydown', onActivity);
      window.removeEventListener('click', onActivity);
      clearInterval(interval);
    };
  }, [idleMinutes]);
}
