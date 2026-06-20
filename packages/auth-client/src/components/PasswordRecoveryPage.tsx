import React, { useEffect, useState } from 'react';
import { consumeRecoverySignInHref } from '../recoverySignInStorage';
import { isPasswordRecoveryUrl, supabaseRecovery } from '../supabaseRecovery';

type Phase = 'loading' | 'form' | 'done' | 'invalid';

export type PasswordRecoveryPageProps = {
  title?: string;
  subtitle?: string;
  /** Where to send the user after a successful reset. */
  signInHref?: string;
};

export function PasswordRecoveryPage({
  title = 'Reset password',
  subtitle = 'Choose a new password for your account',
  signInHref = 'https://roamdominion.co',
}: PasswordRecoveryPageProps) {
  const [resolvedSignInHref] = useState(() => consumeRecoverySignInHref(signInHref));
  const [phase, setPhase] = useState<Phase>('loading');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isPasswordRecoveryUrl()) {
      setError('This reset link is invalid or has expired.');
      setPhase('invalid');
      return;
    }

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    const init = async () => {
      const { data: listener } = supabaseRecovery.auth.onAuthStateChange((event, session) => {
        if (cancelled) return;
        if (session && (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN')) {
          setPhase('form');
        }
      });
      unsubscribe = () => listener.subscription.unsubscribe();

      const { data: { session }, error: sessionError } = await supabaseRecovery.auth.getSession();
      if (cancelled) return;

      if (sessionError) {
        setError(sessionError.message);
        setPhase('invalid');
        return;
      }

      if (session) {
        setPhase('form');
        return;
      }

      await new Promise((r) => setTimeout(r, 800));
      const { data: { session: retry } } = await supabaseRecovery.auth.getSession();
      if (cancelled) return;

      if (retry) {
        setPhase('form');
      } else {
        setError('This reset link is invalid or has expired. Request a new recovery email.');
        setPhase('invalid');
      }
    };

    void init();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const { error: updateError } = await supabaseRecovery.auth.updateUser({ password });
      if (updateError) throw updateError;
      window.history.replaceState({}, '', '/reset-password');
      setPhase('done');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update password');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-xl">
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-white">{title}</h1>
          <p className="text-sm text-slate-400 mt-1">{subtitle}</p>
        </div>

        {phase === 'loading' && (
          <p className="text-sm text-slate-400 text-center py-8">Verifying reset link…</p>
        )}

        {phase === 'invalid' && (
          <div className="space-y-4">
            <p className="text-sm text-red-400">{error}</p>
            <a href={resolvedSignInHref} className="block text-center text-sm text-amber-400 hover:text-amber-300">
              Back to sign in
            </a>
          </div>
        )}

        {phase === 'form' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">New password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                minLength={8}
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Confirm password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                minLength={8}
                required
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-medium py-2.5 text-sm disabled:opacity-50"
            >
              {submitting ? 'Updating…' : 'Update password'}
            </button>
          </form>
        )}

        {phase === 'done' && (
          <div className="space-y-4 text-center">
            <p className="text-sm text-emerald-400">Password updated successfully.</p>
            <a
              href={resolvedSignInHref}
              className="inline-block rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-medium px-6 py-2.5 text-sm"
            >
              Sign in
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
