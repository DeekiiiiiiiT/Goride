import { createContext } from 'react';
import type { Session, User } from '@supabase/supabase-js';

export type AuthContextValue = {
  session: Session | null;
  user: User | null;
  role: string | null;
  organizationId: string | null;
  productLine: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

/** Separate module so Vite HMR of AuthProvider does not recreate the context identity. */
export const AuthContext = createContext<AuthContextValue | null>(null);
