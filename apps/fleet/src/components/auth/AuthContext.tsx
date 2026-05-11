import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../../utils/supabase/client';
import { resolveRole, Role } from '../../utils/permissions';

type UserRole = 'admin' | 'manager' | 'viewer' | 'driver' | 'superadmin';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  role: UserRole | null;
  resolvedRole: Role | null;
  organizationId: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  role: null,
  resolvedRole: null,
  organizationId: null,
  loading: true,
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  // Derive organizationId from user metadata.
  // Fleet owners (admin): orgId = metadata.organizationId || user.id (self-referencing)
  // Team members: orgId = metadata.organizationId
  // Platform roles: null (they see all orgs via Super Admin portal)
  const deriveOrgId = (u: User): string | null => {
    const meta = u.user_metadata || {};
    const explicit = meta.organizationId as string | undefined;
    if (explicit) return explicit;
    // Fleet owners own their org — their ID IS the orgId
    const r = meta.role as string;
    if (r === 'admin' || r === 'fleet_owner') return u.id;
    return null;
  };

  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [resolvedRole, setResolvedRole] = useState<Role | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          const userRole = session.user.user_metadata?.role as UserRole;
          setRole(userRole || null);
          setResolvedRole(resolveRole(userRole || null));
          setOrganizationId(deriveOrgId(session.user));
        }
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
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
         const userRole = session.user.user_metadata?.role as UserRole;
         setRole(userRole || null);
         setResolvedRole(resolveRole(userRole || null));
         setOrganizationId(deriveOrgId(session.user));
      } else {
        setRole(null);
        setResolvedRole(null);
        setOrganizationId(null);
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

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
    <AuthContext.Provider value={{ session, user, role, resolvedRole, organizationId, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);