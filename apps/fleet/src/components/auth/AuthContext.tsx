import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { jwtPrimaryRole } from '@roam/auth-client';
import { supabase } from '../../utils/supabase/client';
import { resolveRole, Role } from '../../utils/permissions';
import { FLEET_OAUTH_INTENT_KEY, FLEET_OAUTH_INTENT_VALUE } from '../../utils/fleetAuthSignup';
import { provisionFleetOwnerAccount } from '../../services/fleetOwnerAuth';
import { needsFleetOwnerProvision } from '../../utils/fleetOwnerUser';

type UserRole = 'admin' | 'manager' | 'viewer' | 'driver' | 'superadmin';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  role: UserRole | null;
  resolvedRole: Role | null;
  organizationId: string | null;
  loading: boolean;
  needsProvision: boolean;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  role: null,
  resolvedRole: null,
  organizationId: null,
  loading: true,
  needsProvision: false,
  signOut: async () => {},
  refreshSession: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  // Derive organizationId from app_metadata (authz source). Fleet owners default to self-id.
  const deriveOrgId = (u: User): string | null => {
    const appMeta = u.app_metadata || {};
    const explicit = appMeta.organizationId as string | undefined;
    if (explicit) return explicit;
    const r = jwtPrimaryRole(u);
    if (r === 'admin' || r === 'fleet_owner') return u.id;
    return null;
  };

  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [resolvedRole, setResolvedRole] = useState<Role | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsProvision, setNeedsProvision] = useState(false);

  const applySession = useCallback((session: Session | null) => {
    setSession(session);
    setUser(session?.user ?? null);
    if (session?.user) {
      const userRole = (jwtPrimaryRole(session.user) || null) as UserRole | null;
      setRole(userRole);
      setResolvedRole(resolveRole(userRole));
      setOrganizationId(deriveOrgId(session.user));
      setNeedsProvision(needsFleetOwnerProvision(session.user));
    } else {
      setRole(null);
      setResolvedRole(null);
      setOrganizationId(null);
      setNeedsProvision(false);
    }
  }, []);

  const refreshSession = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    applySession(session);
  }, [applySession]);

  useEffect(() => {
    // 1. Get initial session
    const initSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();

        // If the refresh token is stale/revoked, clear it so the error stops recurring
        if (error) {
          console.warn('Session init error (clearing stale tokens):', error.message);
          await supabase.auth.signOut({ scope: 'local' });
          setSession(null);
          setUser(null);
          setRole(null);
          setResolvedRole(null);
          setLoading(false);
          return;
        }

        applySession(session);
      } catch (error: any) {
        console.error('Error fetching session:', error);
        // Belt-and-suspenders: also clear on unexpected throw
        try { await supabase.auth.signOut({ scope: 'local' }); } catch {}
      } finally {
        setLoading(false);
      }
    };

    initSession();

    // 2. Listen for changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      applySession(session);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [applySession]);

  /** Google OAuth on /signup: provision fleet owner when intent flag is set */
  useEffect(() => {
    if (!user || !session?.access_token) return;
    if (sessionStorage.getItem(FLEET_OAUTH_INTENT_KEY) !== FLEET_OAUTH_INTENT_VALUE) return;
    if (!needsFleetOwnerProvision(user)) {
      sessionStorage.removeItem(FLEET_OAUTH_INTENT_KEY);
      return;
    }
    void (async () => {
      try {
        const name =
          (typeof user.user_metadata?.name === 'string' && user.user_metadata.name) ||
          (typeof user.user_metadata?.full_name === 'string' && user.user_metadata.full_name) ||
          undefined;
        await provisionFleetOwnerAccount(session.access_token, { name, alsoDrive: true });
        await refreshSession();
      } catch (e) {
        console.warn('fleet oauth provision:', e);
      } finally {
        sessionStorage.removeItem(FLEET_OAUTH_INTENT_KEY);
      }
    })();
  }, [user?.id, session?.access_token, refreshSession]);

  const signOut = async () => {
    // 1. Clear local state immediately to update UI
    setSession(null);
    setUser(null);
    setRole(null);
    setResolvedRole(null);
    setOrganizationId(null);
    setLoading(false);

    // 2. Attempt Supabase sign out
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Error in supabase signOut:", error);
    }
  };

  return (
    <AuthContext.Provider value={{ session, user, role, resolvedRole, organizationId, loading, needsProvision, signOut, refreshSession }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);