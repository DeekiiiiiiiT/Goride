import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { needsRidesSurfaceRolePatch, shouldSkipOauthSurfaceRolePatch } from '@roam/auth-client';
import { supabase } from '../utils/supabase/client';
import { DRIVER_OAUTH_INTENT_KEY, DRIVER_OAUTH_INTENT_VALUE } from '../utils/driverAuthSignup';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  isDriver: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  isDriver: false,
  loading: true,
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const driverSurfacePatchRef = useRef<string | null>(null);

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
      } catch (error: any) {
        console.error('Error fetching session:', error);
        try { await supabase.auth.signOut({ scope: 'local' }); } catch {}
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

  /** Google OAuth does not send `options.data`; attach driver role when user started signup from this app. */
  useEffect(() => {
    if (!user) return;
    void (async () => {
      try {
        if (sessionStorage.getItem(DRIVER_OAUTH_INTENT_KEY) !== DRIVER_OAUTH_INTENT_VALUE) return;
        const current = user.user_metadata?.role as string | undefined;
        if (shouldSkipOauthSurfaceRolePatch(current, 'driver')) {
          sessionStorage.removeItem(DRIVER_OAUTH_INTENT_KEY);
          return;
        }
        await supabase.auth.updateUser({ data: { role: 'driver' } });
      } catch (e) {
        console.warn('driver oauth role patch:', e);
      } finally {
        sessionStorage.removeItem(DRIVER_OAUTH_INTENT_KEY);
      }
    })();
  }, [user]);

  /** Same Supabase session as Roam Rides — switch metadata to driver once per login (avoid re-render loops). */
  useEffect(() => {
    if (!user) {
      driverSurfacePatchRef.current = null;
      return;
    }
    if (driverSurfacePatchRef.current === user.id) return;

    const current = user.user_metadata?.role as string | undefined;
    if (!needsRidesSurfaceRolePatch(current, 'driver')) {
      driverSurfacePatchRef.current = user.id;
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        await supabase.auth.updateUser({ data: { role: 'driver' } });
      } catch (e) {
        console.warn('driver surface role patch:', e);
      } finally {
        if (!cancelled) driverSurfacePatchRef.current = user.id;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const signOut = async () => {
    setSession(null);
    setUser(null);
    setLoading(false);

    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Error in supabase signOut:", error);
    }
  };

  const role = user?.user_metadata?.role;
  const isDriver = role === 'driver';

  return (
    <AuthContext.Provider value={{ session, user, isDriver, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
