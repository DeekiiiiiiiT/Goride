import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { shouldSkipOauthSurfaceWrite } from '@roam/auth-client';
import { supabase } from '../utils/supabase/client';
import { ensureDriverSurface } from '../utils/ensureDriverSurface';
import { DRIVER_OAUTH_INTENT_KEY } from '../utils/driverAuthSignup';

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

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const applySession = async (session: Session | null) => {
      if (!session?.user) {
        setSession(null);
        setUser(null);
        return;
      }
      const patchedUser = await ensureDriverSurface(session.user);
      setSession(patchedUser === session.user ? session : { ...session, user: patchedUser });
      setUser(patchedUser);
      sessionStorage.removeItem(DRIVER_OAUTH_INTENT_KEY);
    };

    const initSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
          console.warn('Session init error:', error.message);
          await supabase.auth.signOut({ scope: 'local' });
          setSession(null);
          setUser(null);
          return;
        }

        await applySession(session);
      } catch (error: unknown) {
        console.error('Error fetching session:', error);
        try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* ignore */ }
      } finally {
        setLoading(false);
      }
    };

    initSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const needsSurfacePatch =
        Boolean(session?.user) && !shouldSkipOauthSurfaceWrite(session!.user, 'driver');
      if (needsSurfacePatch) setLoading(true);
      void applySession(session).finally(() => setLoading(false));
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    setSession(null);
    setUser(null);
    setLoading(false);

    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Error in supabase signOut:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ session, user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
