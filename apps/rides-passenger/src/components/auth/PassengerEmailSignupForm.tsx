import React, { useState } from 'react';
import { Loader2, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { GOOGLE_OAUTH_EMAIL_ONLY_SCOPES, supabase } from '@roam/auth-client';
import { LegalPolicyAcceptanceLabel } from '@roam/ui';
import { getPassengerAuthRedirectUrl } from '../../utils/passengerAuthRedirect';
import { isNativeCapacitorPlatform } from '@roam/types';
import { PASSENGER_OAUTH_INTENT_KEY, PASSENGER_OAUTH_INTENT_VALUE } from '../../utils/passengerAuthSignup';
import { formatEmailAuthError } from '../../utils/supabaseAuthErrors';

interface PassengerEmailSignupFormProps {
  onBack: () => void;
  /** Called when Supabase requires email confirmation (no session yet). */
  onConfirmationRequired: (email: string) => void;
}

export function PassengerEmailSignupForm({ onBack, onConfirmationRequired }: PassengerEmailSignupFormProps) {
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
      const redirect = getPassengerAuthRedirectUrl();
      const { data, error: signErr } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { role: 'passenger' },
          emailRedirectTo: redirect,
        },
      });
      if (signErr) throw signErr;
      const trimmedEmail = email.trim();
      if (data.session) {
        return;
      }
      if (data.user && (!data.user.identities || data.user.identities.length === 0)) {
        setError('An account with this email already exists. Try signing in, or use “Resend” after signing up if you still need to confirm.');
        return;
      }
      onConfirmationRequired(trimmedEmail);
      return;
    } catch (err: unknown) {
      setError(formatEmailAuthError(err, 'Could not create account.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <div className="rounded-xl border border-red-300/50 bg-red-500/15 px-3 py-2 text-sm font-medium text-white">
          {error}
        </div>
      )}

      <form onSubmit={e => void handleSubmit(e)} className="flex flex-col gap-5">
        <div>
          <label className="mb-1.5 flex items-center gap-2 text-[13px] font-medium text-white/90">
            <Mail className="h-4 w-4 text-white/70" aria-hidden />
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
            className="input-touch w-full rounded-xl border border-white/35 bg-white/90 px-4 text-zinc-900 placeholder:text-zinc-400 outline-none focus:bg-white focus:ring-[3px] focus:ring-white/40"
          />
        </div>

        <div>
          <label className="mb-1.5 flex items-center gap-2 text-[13px] font-medium text-white/90">
            <Lock className="h-4 w-4 text-white/70" aria-hidden />
            Password
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              required
              minLength={6}
              autoComplete="new-password"
              className="input-touch w-full rounded-xl border border-white/35 bg-white/90 px-4 pr-11 text-zinc-900 placeholder:text-zinc-400 outline-none focus:bg-white focus:ring-[3px] focus:ring-white/40"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-800"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="mb-1.5 flex items-center gap-2 text-[13px] font-medium text-white/90">
            <Lock className="h-4 w-4 text-white/70" aria-hidden />
            Confirm password
          </label>
          <input
            type={showPassword ? 'text' : 'password'}
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder="Repeat password"
            required
            autoComplete="new-password"
            className="input-touch w-full rounded-xl border border-white/35 bg-white/90 px-4 text-zinc-900 placeholder:text-zinc-400 outline-none focus:bg-white focus:ring-[3px] focus:ring-white/40"
          />
        </div>

        <div className="flex items-start gap-2 text-sm text-white/90">
          <input
            id="passenger-email-signup-terms"
            type="checkbox"
            checked={termsAccepted}
            onChange={e => setTermsAccepted(e.target.checked)}
            className="mt-1 size-4 shrink-0 cursor-pointer rounded border-white/40 bg-white/10"
          />
          <label htmlFor="passenger-email-signup-terms" className="cursor-pointer leading-snug">
            <LegalPolicyAcceptanceLabel privacyClassName="font-semibold text-emerald-200" termsClassName="font-semibold text-emerald-200" />
          </label>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="btn-touch w-full rounded-xl bg-gradient-to-b from-emerald-400 to-emerald-600 text-[15px] font-semibold text-white shadow-[0_12px_28px_-8px_rgba(0,0,0,0.35)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
              Creating account…
            </>
          ) : (
            'Create account'
          )}
        </button>
      </form>

      <button
        type="button"
        className="w-full text-sm text-white/55 hover:text-white/90"
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

export function PassengerGoogleSignupButton({
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
      sessionStorage.setItem(PASSENGER_OAUTH_INTENT_KEY, PASSENGER_OAUTH_INTENT_VALUE);
      const redirectTo = getPassengerAuthRedirectUrl();
      const native = isNativeCapacitorPlatform();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: native,
          scopes: GOOGLE_OAUTH_EMAIL_ONLY_SCOPES,
          queryParams: { prompt: 'select_account' },
        },
      });
      if (error) throw error;
      if (native && data?.url) {
        const { Browser } = await import('@capacitor/browser');
        await Browser.open({ url: data.url });
      }
    } catch (err: unknown) {
      sessionStorage.removeItem(PASSENGER_OAUTH_INTENT_KEY);
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
      className="btn-touch flex w-full items-center justify-center gap-3 rounded-xl border border-white/40 bg-white/95 py-3 text-[15px] font-semibold text-zinc-900 shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin text-zinc-600" />
      ) : (
        <GoogleMark className="h-5 w-5" />
      )}
      {label}
    </button>
  );
}
