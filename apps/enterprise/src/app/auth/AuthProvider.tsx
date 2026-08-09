import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { jwtPrimaryRole, supabaseEnterpriseApp } from '@roam/auth-client';
import { AuthContext } from '@/app/auth/authContext';

function deriveOrgId(u: User): string | null {
  const appMeta = u.app_metadata || {};
  const userMeta = u.user_metadata || {};
  return (
    (appMeta.organizationId as string | undefined) ||
    (userMeta.organizationId as string | undefined) ||
    null
  );
}

function deriveProductLine(u: User): string | null {
  const appMeta = u.app_metadata || {};
  const userMeta = u.user_metadata || {};
  return (
    (appMeta.productLine as string | undefined) ||
    (userMeta.productLine as string | undefined) ||
    null
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [productLine, setProductLine] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const applySession = useCallback((next: Session | null) => {
    setSession(next);
    setUser(next?.user ?? null);
    if (next?.user) {
      setRole(jwtPrimaryRole(next.user) || null);
      setOrganizationId(deriveOrgId(next.user));
      setProductLine(deriveProductLine(next.user));
    } else {
      setRole(null);
      setOrganizationId(null);
      setProductLine(null);
    }
  }, []);

  const refreshSession = useCallback(async () => {
    const { data } = await supabaseEnterpriseApp.auth.getSession();
    applySession(data.session);
  }, [applySession]);

  useEffect(() => {
    let mounted = true;

    async function resolveOwnedEnterpriseOrg(userId: string) {
      const { data: owned } = await supabaseEnterpriseApp
        .from('organizations')
        .select('id')
        .eq('owner_id', userId)
        .eq('product_line', 'enterprise')
        .limit(1)
        .maybeSingle();
      if (mounted && owned?.id) setOrganizationId(owned.id);
    }

    (async () => {
      try {
        const { data } = await supabaseEnterpriseApp.auth.getSession();
        if (mounted) applySession(data.session);

        // Resolve enterprise org when JWT lacks organizationId
        const u = data.session?.user;
        if (u && !deriveOrgId(u)) {
          await resolveOwnedEnterpriseOrg(u.id);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    const { data: sub } = supabaseEnterpriseApp.auth.onAuthStateChange((_event, next) => {
      applySession(next);
      setLoading(false);
      // Keep owned-org resolution after TOKEN_REFRESHED / INITIAL_SESSION wipe JWT-only apply
      if (next?.user && !deriveOrgId(next.user)) {
        void resolveOwnedEnterpriseOrg(next.user.id);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [applySession]);

  const signIn = useCallback(async (email: string, password: string) => {
    const GENERIC = 'Invalid email or password';
    const { data, error } = await supabaseEnterpriseApp.auth.signInWithPassword({
      email,
      password,
    });
    if (error || !data.user) {
      return { error: GENERIC };
    }

    const line = deriveProductLine(data.user);

    // Prefer JWT product line; if missing, check owned enterprise org
    if (line && line !== 'enterprise') {
      await supabaseEnterpriseApp.auth.signOut();
      return { error: GENERIC };
    }

    if (!line) {
      const orgId =
        (data.user.app_metadata?.organizationId as string | undefined) ||
        (data.user.user_metadata?.organizationId as string | undefined);

      if (orgId) {
        const { data: memberOrg } = await supabaseEnterpriseApp
          .from('organizations')
          .select('id, product_line')
          .eq('id', orgId)
          .eq('product_line', 'enterprise')
          .maybeSingle();
        if (memberOrg) {
          return { error: null };
        }
      }

      const { data: owned } = await supabaseEnterpriseApp
        .from('organizations')
        .select('id, product_line')
        .eq('owner_id', data.user.id)
        .eq('product_line', 'enterprise')
        .limit(1)
        .maybeSingle();

      if (!owned) {
        await supabaseEnterpriseApp.auth.signOut();
        return { error: GENERIC };
      }
    }

    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    await supabaseEnterpriseApp.auth.signOut();
  }, []);

  const value = useMemo(
    () => ({
      session,
      user,
      role,
      organizationId,
      productLine,
      loading,
      signIn,
      signOut,
      refreshSession,
    }),
    [
      session,
      user,
      role,
      organizationId,
      productLine,
      loading,
      signIn,
      signOut,
      refreshSession,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
