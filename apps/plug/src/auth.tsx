import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { plugRedirectTo, supabasePlugApp } from './authClient';
import { PLUG_FLAGS, type PlugFlag, sectionEnabled } from '@roam/plug-core';
import { PLUG_FLAGS_OPEN } from './config';
import { holdPlugCalls, plugSend, releasePlugCalls } from './api';

type AuthValue = {
  session: Session | null;
  ready: boolean;
  signedIn: boolean;
  joined: boolean;
  displayName: string | null;
  joinError: string | null;
  flags: Record<PlugFlag, boolean>;
  flagsLoaded: boolean;
  flagOn: (flag: PlugFlag) => boolean;
  signOut: () => Promise<void>;
  continueWithGoogle: () => Promise<void>;
  continueWithApple: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<'session' | 'confirm'>;
  sendPasswordReset: (email: string) => Promise<void>;
  setPassword: (password: string) => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

const FLAGS_ON = Object.fromEntries(PLUG_FLAGS.map((flag) => [flag, true])) as Record<PlugFlag, boolean>;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [joined, setJoined] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [flags, setFlags] = useState<Record<PlugFlag, boolean>>(FLAGS_ON);
  const [flagsLoaded, setFlagsLoaded] = useState(PLUG_FLAGS_OPEN);

  useEffect(() => {
    void supabasePlugApp.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    }).catch(() => setReady(true));
    const { data } = supabasePlugApp.auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') sessionStorage.setItem('plug-set-password', '1');
      setSession(next);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id || '';
  if (!ready || (userId && !joined && !joinError)) holdPlugCalls();
  useEffect(() => {
    if (!ready) return;
    if (!userId) {
      setJoined(false);
      setDisplayName(null);
      setJoinError(null);
      releasePlugCalls();
      return;
    }
    let cancelled = false;
    setJoined(false);
    setDisplayName(null);
    setJoinError(null);
    holdPlugCalls();
    void plugSend<{ displayName?: string | null }>('/join', 'POST', {}, false)
      .then((body) => {
        if (cancelled) return;
        const name = typeof body.displayName === 'string' ? body.displayName.trim() : '';
        setDisplayName(name || null);
        setJoined(true);
      })
      .catch((err) => {
        if (!cancelled) setJoinError(err instanceof Error && err.message ? err.message : "This account can't use Plug yet");
      })
      .finally(() => {
        if (!cancelled) releasePlugCalls();
      });
    return () => {
      cancelled = true;
    };
  }, [userId, ready]);

  useEffect(() => {
    if (PLUG_FLAGS_OPEN) return;
    if (session && !joined) return;
    void plugSend<{ flags: Record<PlugFlag, boolean> }>('/flags', 'GET', undefined, false)
      .then((body) => { if (body.flags) setFlags(body.flags); })
      .catch(() => undefined)
      .finally(() => setFlagsLoaded(true));
  }, [session, joined]);

  const value = useMemo<AuthValue>(() => ({
    session,
    ready,
    signedIn: Boolean(session),
    joined,
    displayName,
    joinError,
    flags,
    flagsLoaded,
    flagOn: (flag) => !flagsLoaded || sectionEnabled(flag, flags[flag], false) || PLUG_FLAGS_OPEN,
    signOut: async () => {
      await supabasePlugApp.auth.signOut();
    },
    continueWithGoogle: async () => {
      const { error } = await supabasePlugApp.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: plugRedirectTo(),
          queryParams: { prompt: 'select_account' },
        },
      });
      if (error) throw error;
    },
    continueWithApple: async () => {
      const { error } = await supabasePlugApp.auth.signInWithOAuth({
        provider: 'apple',
        options: { redirectTo: plugRedirectTo() },
      });
      if (error) throw error;
    },
    signInWithEmail: async (email, password) => {
      const { error } = await supabasePlugApp.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    signUpWithEmail: async (email, password) => {
      const { data, error } = await supabasePlugApp.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: plugRedirectTo(), data: { app: 'plug' } },
      });
      if (error) throw error;
      return data.session ? 'session' : 'confirm';
    },
    sendPasswordReset: async (email) => {
      const { error } = await supabasePlugApp.auth.resetPasswordForEmail(email, { redirectTo: plugRedirectTo() });
      if (error) throw error;
    },
    setPassword: async (password) => {
      const { error } = await supabasePlugApp.auth.updateUser({ password });
      if (error) throw error;
    },
  }), [flags, flagsLoaded, session, ready, joined, displayName, joinError]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('Auth is missing');
  return value;
}
