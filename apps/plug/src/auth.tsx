import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabasePlugApp } from '../../../packages/auth-client/src/supabase';
import { PLUG_FLAGS, type PlugFlag, sectionEnabled } from '@roam/plug-core';
import { PLUG_FLAGS_OPEN } from './config';
import { plugSend } from './api';

type AuthValue = {
  session: Session | null;
  ready: boolean;
  signedIn: boolean;
  flags: Record<PlugFlag, boolean>;
  flagOn: (flag: PlugFlag) => boolean;
  sendCode: (phone: string) => Promise<void>;
  verifyCode: (phone: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  continueWithGoogle: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

const FLAGS_OFF = Object.fromEntries(PLUG_FLAGS.map((flag) => [flag, false])) as Record<PlugFlag, boolean>;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [flags, setFlags] = useState<Record<PlugFlag, boolean>>(() => (
    Object.fromEntries(PLUG_FLAGS.map((flag) => [flag, PLUG_FLAGS_OPEN])) as Record<PlugFlag, boolean>
  ));

  useEffect(() => {
    void supabasePlugApp.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    }).catch(() => setReady(true));
    const { data } = supabasePlugApp.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session || PLUG_FLAGS_OPEN) return;
    void plugSend<{ flags: Record<PlugFlag, boolean> }>('/flags', 'GET')
      .then((body) => setFlags(body.flags))
      .catch(() => setFlags(FLAGS_OFF));
  }, [session]);

  const value = useMemo<AuthValue>(() => ({
    session,
    ready,
    signedIn: Boolean(session),
    flags,
    flagOn: (flag) => sectionEnabled(flag, flags[flag], false) || PLUG_FLAGS_OPEN,
    sendCode: async (phone) => {
      const { error } = await supabasePlugApp.auth.signInWithOtp({
        phone,
        options: { channel: 'sms', data: { app: 'plug' } },
      });
      if (error) throw error;
    },
    verifyCode: async (phone, token) => {
      const { error } = await supabasePlugApp.auth.verifyOtp({ phone, token, type: 'sms' });
      if (error) throw error;
    },
    signOut: async () => {
      await supabasePlugApp.auth.signOut();
    },
    continueWithGoogle: async () => {
      const { ticket } = await plugSend<{ ticket: string }>('/join/ticket', 'POST', {});
      sessionStorage.setItem('plug-join-ticket', ticket);
      const { error } = await supabasePlugApp.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
          queryParams: { prompt: 'select_account' },
        },
      });
      if (error) throw error;
    },
  }), [flags, session, ready]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('Auth is missing');
  return value;
}
