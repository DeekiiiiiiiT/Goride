import React, { useState } from 'react';
import { Loader2, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../../utils/supabase/client';
import { DRIVER_OAUTH_INTENT_KEY, DRIVER_OAUTH_INTENT_VALUE } from '../../utils/driverAuthSignup';

interface DriverEmailSignupFormProps {
  onBack: () => void;
  /** Called when Supabase requires email confirmation (no session yet). */
  onConfirmationRequired: (email: string) => void;
}

export function DriverEmailSignupForm({ onBack, onConfirmationRequired }: DriverEmailSignupFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!termsAccepted) {
      setError('Please accept the Terms and Privacy Policy to continue.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Use at least 6 characters for your password.');
      return;
    }
    setLoading(true);
    try {
      const redirect = `${window.location.origin}/`;
      const { data, error: signErr } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { role: 'driver' },
          emailRedirectTo: redirect,
        },
      });
      if (signErr) throw signErr;
      if (data.session) {
        setInfo('Account created. You are signed in.');
      } else {
        onConfirmationRequired(email.trim());
        return;
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not create account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
          {error}
        </div>
      )}
      {info && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-100">
          {info}
        </div>
      )}

      <form onSubmit={e => void handleSubmit(e)} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-200">Email</label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="driver@email.com"
              required
              autoComplete="email"
              disabled={Boolean(info)}
              className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm font-medium text-slate-900 placeholder-slate-500 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900/70 dark:text-white dark:placeholder-slate-400"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-200">Password</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              required
              minLength={6}
              autoComplete="new-password"
              disabled={Boolean(info)}
              className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-10 text-sm font-medium text-slate-900 placeholder-slate-500 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900/70 dark:text-white dark:placeholder-slate-400"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-200">Confirm password</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Repeat password"
              required
              autoComplete="new-password"
              disabled={Boolean(info)}
              className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm font-medium text-slate-900 placeholder-slate-500 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900/70 dark:text-white dark:placeholder-slate-400"
            />
          </div>
        </div>

        <div className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input
            id="driver-email-signup-terms"
            type="checkbox"
            checked={termsAccepted}
            onChange={e => setTermsAccepted(e.target.checked)}
            disabled={Boolean(info)}
            className="mt-1 size-4 shrink-0 cursor-pointer rounded border-slate-300 disabled:opacity-50"
          />
          <label htmlFor="driver-email-signup-terms" className="cursor-pointer leading-snug">
            I have read and accept the{' '}
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">Privacy Policy</span> and{' '}
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">Terms &amp; Conditions</span>.
          </label>
        </div>

        <button
          type="submit"
          disabled={loading || Boolean(info)}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition-all hover:from-emerald-500 hover:to-teal-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Creating account…
            </>
          ) : (
            'Create account'
          )}
        </button>
      </form>

      <button
        type="button"
        className="w-full text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
        onClick={onBack}
      >
        Back
      </button>
    </div>
  );
}

function GoogleMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

export function GoogleSignupButton({
  disabled,
  onError,
  variant = 'signup',
}: {
  disabled?: boolean;
  onError: (msg: string) => void;
  /** Same OAuth flow for new and returning users; label only. */
  variant?: 'signup' | 'login';
}) {
  const [loading, setLoading] = useState(false);
  const label = variant === 'login' ? 'Sign in with Google' : 'Continue with Google';

  const onClick = async () => {
    onError('');
    setLoading(true);
    try {
      sessionStorage.setItem(DRIVER_OAUTH_INTENT_KEY, DRIVER_OAUTH_INTENT_VALUE);
      const redirectTo = `${window.location.origin}/`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          queryParams: { prompt: 'select_account' },
        },
      });
      if (error) throw error;
    } catch (err: unknown) {
      sessionStorage.removeItem(DRIVER_OAUTH_INTENT_KEY);
      onError(
        err instanceof Error
          ? err.message
          : variant === 'login'
            ? 'Google sign-in failed.'
            : 'Google sign-up failed.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={() => void onClick()}
      className="flex w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white py-3 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100 dark:hover:bg-slate-800/80"
    >
      {loading ? <Loader2 className="h-5 w-5 animate-spin text-slate-600 dark:text-slate-300" /> : <GoogleMark className="h-5 w-5" />}
      {label}
    </button>
  );
}
