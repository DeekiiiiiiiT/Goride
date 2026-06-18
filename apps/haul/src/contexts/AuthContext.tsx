import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { shouldSkipOauthSurfaceWrite } from '@roam/auth-client';
import { supabase } from '../utils/supabase/client';
import { ensureHaulerSurface } from '../utils/ensureHaulerSurface';
import { HAULER_OAUTH_INTENT_KEY } from '../utils/haulAuthRedirect';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const applySession = async (next: Session | null) => {
      if (!next?.user) {
        setSession(null);
        setUser(null);
        return;
      }
      const patched = await ensureHaulerSurface(next.user);
      setSession(patched === next.user ? next : { ...next, user: patched });
      setUser(patched);
      sessionStorage.removeItem(HAULER_OAUTH_INTENT_KEY);
    };

    void supabase.auth.getSession().then(({ data: { session: s } }) => {
      void applySession(s).finally(() => setLoading(false));
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      const needsPatch = Boolean(s?.user) && !shouldSkipOauthSurfaceWrite(s!.user, 'hauler');
      if (needsPatch) setLoading(true);
      void applySession(s).finally(() => setLoading(false));
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    setSession(null);
    setUser(null);
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
