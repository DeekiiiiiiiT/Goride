import { useEffect, useRef } from 'react';
import { supabaseDashAdmin as supabase } from '@roam/auth-client';

const IDLE_MS = 30 * 60 * 1000;
const ABSOLUTE_MS = 8 * 60 * 60 * 1000;

export function useAdminSessionPolicy() {
  const loginAt = useRef(Date.now());
  const lastActive = useRef(Date.now());

  useEffect(() => {
    const onActivity = () => {
      lastActive.current = Date.now();
    };
    window.addEventListener('mousemove', onActivity);
    window.addEventListener('keydown', onActivity);
    window.addEventListener('click', onActivity);

    const interval = setInterval(() => {
      const now = Date.now();
      if (now - loginAt.current > ABSOLUTE_MS || now - lastActive.current > IDLE_MS) {
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
  }, []);
}
