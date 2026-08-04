import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import {
  hasProductAdminRole,
  jwtPrimaryRole,
  supabaseEnterpriseAdmin,
  ADMIN_INCORRECT_CREDENTIALS,
  flashAdminLoginError,
} from '@roam/auth-client';

type AdminAuthContextValue = {
  session: Session | null;
  user: User | null;
  role: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const applySession = useCallback((next: Session | null) => {
    if (next?.user && !hasProductAdminRole(next.user, 'enterprise')) {
      setSession(null);
      setUser(null);
      setRole(null);
      return;
    }
    setSession(next);
    setUser(next?.user ?? null);
    setRole(next?.user ? jwtPrimaryRole(next.user) || null : null);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await supabaseEnterpriseAdmin.auth.getSession();
        if (!mounted) return;
        if (data.session?.user && !hasProductAdminRole(data.session.user, 'enterprise')) {
          flashAdminLoginError();
          await supabaseEnterpriseAdmin.auth.signOut();
          applySession(null);
        } else {
          applySession(data.session);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    const { data: sub } = supabaseEnterpriseAdmin.auth.onAuthStateChange((_event, next) => {
      if (next?.user && !hasProductAdminRole(next.user, 'enterprise')) {
        flashAdminLoginError();
        void supabaseEnterpriseAdmin.auth.signOut();
        applySession(null);
      } else {
        applySession(next);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [applySession]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabaseEnterpriseAdmin.auth.signInWithPassword({
      email,
      password,
    });
    if (error || !data.session?.user) {
      return { error: ADMIN_INCORRECT_CREDENTIALS };
    }
    if (!hasProductAdminRole(data.session.user, 'enterprise')) {
      await supabaseEnterpriseAdmin.auth.signOut();
      return { error: ADMIN_INCORRECT_CREDENTIALS };
    }
    applySession(data.session);
    return { error: null };
  }, [applySession]);

  const signOut = useCallback(async () => {
    await supabaseEnterpriseAdmin.auth.signOut();
    applySession(null);
  }, [applySession]);

  const value = useMemo(
    () => ({ session, user, role, loading, signIn, signOut }),
    [session, user, role, loading, signIn, signOut],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider');
  return ctx;
}
