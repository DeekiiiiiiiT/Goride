import React, { useState } from 'react';
import { Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react';
import { LegalPolicyAcceptanceLabel } from '@roam/ui';
import { supabase } from '../../utils/supabase/client';
import {
  getHaulAuthRedirectUrl,
  HAULER_OAUTH_INTENT_KEY,
  HAULER_OAUTH_INTENT_VALUE,
} from '../../utils/haulAuthRedirect';

interface HaulerEmailSignupFormProps {
  onBack: () => void;
  onConfirmationRequired: (email: string) => void;
}

const inputClass =
  'w-full rounded-lg bg-slate-900 border border-slate-700 pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 disabled:opacity-60';

export function HaulerEmailSignupForm({ onBack, onConfirmationRequired }: HaulerEmailSignupFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
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
      const redirect = getHaulAuthRedirectUrl();
      const { data, error: signErr } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { surface: 'hauler' },
          emailRedirectTo: redirect,
        },
      });
      if (signErr) throw signErr;
      const trimmedEmail = email.trim();
      if (data.session) return;
      if (data.user && (!data.user.identities || data.user.identities.length === 0)) {
        setError(
          'An account with this email already exists. Try signing in, or use “Resend” after signing up if you still need to confirm.',
        );
        return;
      }
      onConfirmationRequired(trimmedEmail);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not create account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <form onSubmit={e => void handleSubmit(e)} className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Email</span>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="hauler@email.com"
              required
              autoComplete="email"
              className={inputClass}
            />
          </div>
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Password</span>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              required
              minLength={6}
              autoComplete="new-password"
              className={`${inputClass} pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Confirm password</span>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Repeat password"
              required
              autoComplete="new-password"
              className={inputClass}
            />
          </div>
        </label>

        <div className="flex items-start gap-2 text-sm text-slate-400">
          <input
            id="hauler-email-signup-terms"
            type="checkbox"
            checked={termsAccepted}
            onChange={e => setTermsAccepted(e.target.checked)}
            className="mt-1 size-4 shrink-0 cursor-pointer rounded border-slate-600 bg-slate-900"
          />
          <label htmlFor="hauler-email-signup-terms" className="cursor-pointer leading-snug">
            <LegalPolicyAcceptanceLabel
              privacyClassName="font-semibold text-amber-400"
              termsClassName="font-semibold text-amber-400"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
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

      <button type="button" className="w-full text-sm text-slate-500 hover:text-slate-300" onClick={onBack}>
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

export function HaulerGoogleSignupButton({
  disabled,
  onError,
  variant = 'signup',
}: {
  disabled?: boolean;
  onError: (msg: string) => void;
  variant?: 'signup' | 'login';
}) {
  const [loading, setLoading] = useState(false);
  const label = variant === 'login' ? 'Sign in with Google' : 'Continue with Google';

  const onClick = async () => {
    onError('');
    setLoading(true);
    try {
      sessionStorage.setItem(HAULER_OAUTH_INTENT_KEY, HAULER_OAUTH_INTENT_VALUE);
      const redirectTo = getHaulAuthRedirectUrl();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          queryParams: { prompt: 'select_account' },
        },
      });
      if (error) throw error;
    } catch (err: unknown) {
      sessionStorage.removeItem(HAULER_OAUTH_INTENT_KEY);
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
      className="flex w-full items-center justify-center gap-3 rounded-lg border border-slate-600 bg-slate-900 py-2.5 text-sm font-semibold text-slate-100 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <GoogleMark className="h-5 w-5" />}
      {label}
    </button>
  );
}
