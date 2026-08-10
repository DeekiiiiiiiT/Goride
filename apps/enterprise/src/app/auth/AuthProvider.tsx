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

/** Interim door hint from JWT until organizations row loads (avoids courier default race). */
function deriveJwtBusinessType(u: User): string | null {
  const appMeta = u.app_metadata || {};
  const userMeta = u.user_metadata || {};
  return (
    (appMeta.businessType as string | undefined) ||
    (userMeta.businessType as string | undefined) ||
    null
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [productLine, setProductLine] = useState<string | null>(null);
  const [businessType, setBusinessType] = useState<string | null>(null);
  const [subscribedProducts, setSubscribedProducts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const applySession = useCallback((next: Session | null) => {
    setSession(next);
    setUser(next?.user ?? null);
    if (next?.user) {
      setRole(jwtPrimaryRole(next.user) || null);
      setOrganizationId(deriveOrgId(next.user));
      setProductLine(deriveProductLine(next.user));
      // Prefer JWT until org fetch finishes — never leave door routing with empty profile after SIGNED_IN
      setBusinessType(deriveJwtBusinessType(next.user));
      setSubscribedProducts([]);
    } else {
      setRole(null);
      setOrganizationId(null);
      setProductLine(null);
      setBusinessType(null);
      setSubscribedProducts([]);
    }
  }, []);

  const loadOrgProfile = useCallback(async (orgId: string) => {
    const { data } = await supabaseEnterpriseApp
      .from('organizations')
      .select('id, business_type, subscribed_products')
      .eq('id', orgId)
      .maybeSingle();
    if (!data) return;
    setBusinessType((data.business_type as string) || null);
    const products = Array.isArray(data.subscribed_products)
      ? (data.subscribed_products as string[])
      : [];
    setSubscribedProducts(products);
  }, []);

  const refreshSession = useCallback(async () => {
    const { data } = await supabaseEnterpriseApp.auth.getSession();
    applySession(data.session);
    const orgId = data.session?.user ? deriveOrgId(data.session.user) : null;
    if (orgId) await loadOrgProfile(orgId);
  }, [applySession, loadOrgProfile]);

  useEffect(() => {
    let mounted = true;

    async function resolveOwnedEnterpriseOrg(userId: string) {
      const { data: owned } = await supabaseEnterpriseApp
        .from('organizations')
        .select('id, business_type, subscribed_products')
        .eq('owner_id', userId)
        .eq('product_line', 'enterprise')
        .limit(1)
        .maybeSingle();
      if (mounted && owned?.id) {
        setOrganizationId(owned.id);
        setBusinessType((owned.business_type as string) || null);
        const products = Array.isArray(owned.subscribed_products)
          ? (owned.subscribed_products as string[])
          : [];
        setSubscribedProducts(products);
      }
    }

    async function hydrateOrgProfile(u: User) {
      const orgId = deriveOrgId(u);
      if (orgId) {
        await loadOrgProfile(orgId);
      } else {
        await resolveOwnedEnterpriseOrg(u.id);
      }
    }

    (async () => {
      try {
        const { data } = await supabaseEnterpriseApp.auth.getSession();
        if (mounted) applySession(data.session);

        const u = data.session?.user;
        if (u) {
          await hydrateOrgProfile(u);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    const { data: sub } = supabaseEnterpriseApp.auth.onAuthStateChange((event, next) => {
      void (async () => {
        // Token refresh: keep current org profile; don't flip loading (avoids door bounce flashes).
        if (event === 'TOKEN_REFRESHED') {
          applySession(next);
          if (next?.user) {
            const orgId = deriveOrgId(next.user);
            if (orgId) void loadOrgProfile(orgId);
          }
          return;
        }

        applySession(next);
        if (!next?.user) {
          if (mounted) setLoading(false);
          return;
        }

        // SIGNED_IN / INITIAL_SESSION / etc.: block UI until org door fields are known.
        if (mounted) setLoading(true);
        try {
          await hydrateOrgProfile(next.user);
        } finally {
          if (mounted) setLoading(false);
        }
      })();
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [applySession, loadOrgProfile]);

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
      businessType,
      subscribedProducts,
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
      businessType,
      subscribedProducts,
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
