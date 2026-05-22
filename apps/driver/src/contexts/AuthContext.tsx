import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { shouldSkipOauthSurfaceWrite } from '@roam/auth-client';
import { supabase } from '../utils/supabase/client';
import { DRIVER_OAUTH_INTENT_KEY, DRIVER_OAUTH_INTENT_VALUE } from '../utils/driverAuthSignup';

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
    const initSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
          console.warn('Session init error:', error.message);
          await supabase.auth.signOut({ scope: 'local' });
          setSession(null);
          setUser(null);
          setLoading(false);
          return;
        }

        setSession(session);
        setUser(session?.user ?? null);
      } catch (error: unknown) {
        console.error('Error fetching session:', error);
        try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* ignore */ }
      } finally {
        setLoading(false);
      }
    };

    initSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  /** Google OAuth: record surface only (never overwrite app_metadata / admin roles). */
  useEffect(() => {
    if (!user) return;
    void (async () => {
      try {
        if (sessionStorage.getItem(DRIVER_OAUTH_INTENT_KEY) !== DRIVER_OAUTH_INTENT_VALUE) return;
        if (shouldSkipOauthSurfaceWrite(user, 'driver')) return;
        await supabase.auth.updateUser({ data: { surface: 'driver' } });
      } catch (e) {
        console.warn('driver oauth surface patch:', e);
      } finally {
        sessionStorage.removeItem(DRIVER_OAUTH_INTENT_KEY);
      }
    })();
  }, [user]);

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
