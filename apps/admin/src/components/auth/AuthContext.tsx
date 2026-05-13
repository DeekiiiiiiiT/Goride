import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../../utils/supabase/client';
import { resolveRole, Role, isPlatformRole } from '../../utils/permissions';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  role: Role | null;
  isPlatformUser: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  role: null,
  isPlatformUser: false,
  loading: true,
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
          console.warn('Session init error (clearing stale tokens):', error.message);
          await supabase.auth.signOut({ scope: 'local' });
          setSession(null);
          setUser(null);
          setRole(null);
          setLoading(false);
          return;
        }

        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          const rawRole = session.user.user_metadata?.role as string;
          setRole(resolveRole(rawRole));
        }
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
      if (session?.user) {
        const rawRole = session.user.user_metadata?.role as string;
        setRole(resolveRole(rawRole));
      } else {
        setRole(null);
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    setSession(null);
    setUser(null);
    setRole(null);
    setLoading(false);

    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Error in supabase signOut:", error);
    }
  };

  const isPlatformUser = isPlatformRole(user?.user_metadata?.role);

  return (
    <AuthContext.Provider value={{ session, user, role, isPlatformUser, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
