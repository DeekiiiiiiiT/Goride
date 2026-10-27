// Stitch: dominion-redesign/d8107f1d4b7c4c8bbb570fed4a8216be
import React, { useState } from 'react';
import { Shield, Loader2, AlertCircle, Eye, EyeOff, ArrowRight, Lock, LockKeyhole } from 'lucide-react';
import { supabase } from '../../utils/supabase/client';
import { API_ENDPOINTS } from '../../services/apiConfig';
import { supabaseAnonFunctionHeaders } from '@roam/api-client';
import {
  requestPasswordReset,
  rememberRecoverySignInHref,
  consumeAdminLoginErrorFlash,
  ADMIN_INCORRECT_CREDENTIALS,
  adminPasswordFailureMessage,
  clearDominionAccessDenied,
  dominionAccessDeniedMessage,
  recordDominionAccessDenied,
} from '@roam/auth-client';
import { LockoutCountdown } from '../auth/LockoutCountdown';

/**
 * Dominion sign-in. Email, password, then the authenticator code.
 */
export function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(() => consumeAdminLoginErrorFlash());
  const [success, setSuccess] = useState<string | null>(null);
  const [lockoutSeconds, setLockoutSeconds] = useState<number | null>(null);
  const [forgotMode, setForgotMode] = useState(false);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Enter your email first.');
      return;
    }
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const { error: resetError } = await requestPasswordReset(email.trim(), 'dominion');
      if (resetError) throw resetError;
      rememberRecoverySignInHref('/');
      setSuccess('Password reset email sent. Check your inbox — the link returns you to roamdominion.co.');
      setForgotMode(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not send reset email');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_ENDPOINTS.admin}/admin-login`, {
        method: 'POST',
        headers: supabaseAnonFunctionHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (res.status === 429 || data?.retryAfterSec) {
        if (data?.retryAfterSec) {
          setLockoutSeconds(data.retryAfterSec);
          setError(null);
        } else {
          setError(data?.error || 'Too many login attempts. Please try again later.');
        }
        return;
      }

      if (!res.ok) {
        const count = recordDominionAccessDenied();
        throw new Error(
          count >= 2
            ? dominionAccessDeniedMessage(count)
            : res.status === 401 || res.status === 403
              ? adminPasswordFailureMessage(data?.attemptsRemaining)
              : data.error || ADMIN_INCORRECT_CREDENTIALS,
        );
      }

      clearDominionAccessDenied();
      await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });
    } catch (err: unknown) {
      console.error('Admin login error:', err);
      setError(err instanceof Error ? err.message : ADMIN_INCORRECT_CREDENTIALS);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center bg-slate-100 text-slate-900">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgb(203 213 225 / 0.45) 1px, transparent 1px), linear-gradient(to bottom, rgb(203 213 225 / 0.45) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      <header className="relative z-10 flex w-full flex-col items-center pb-4 pt-10">
        <div className="mb-2 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-dominion-navy shadow-sm">
            <Shield className="h-6 w-6 text-white" />
          </div>
          <span className="font-headline text-2xl font-bold tracking-tight text-dominion-navy">Dominion</span>
        </div>
        <p className="mb-3 font-headline text-sm font-medium tracking-normal text-slate-500">
          Roam Admin Console
        </p>
        <div className="inline-flex items-center gap-2 rounded border border-slate-300/80 bg-slate-200/70 px-2.5 py-1 font-mono text-[11px] text-slate-700">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-600" />
          <span>KGN-DC-01 • Secure Entry</span>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-[460px] flex-1 flex-col justify-center px-4 py-6">
        <div className="mb-5 rounded-lg border border-slate-200 bg-white p-3 shadow-xs">
          <div className="mb-2 flex items-center justify-between text-xs font-medium">
            <div className="flex items-center gap-2 font-semibold text-dominion-blue">
              <span className="flex h-5 w-5 items-center justify-center rounded-full border border-dominion-blue/30 bg-blue-50 font-mono text-[11px] text-dominion-blue">
                1
              </span>
              <span>1 Sign in</span>
            </div>
            <div className="flex items-center gap-2 text-slate-400">
              <span className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-slate-100 font-mono text-[11px] text-slate-500">
                2
              </span>
              <span>2 Authenticator</span>
            </div>
          </div>
          <div className="grid h-1.5 grid-cols-2 gap-2">
            <div className="h-full rounded-full bg-dominion-blue" />
            <div className="h-full rounded-full bg-slate-200" />
          </div>
        </div>

        <section className="mb-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
          <div className="mb-5">
            <h1 className="font-headline text-base font-semibold tracking-tight text-slate-900">
              {forgotMode ? 'Reset Password' : 'Console credentials'}
            </h1>
            <p className="mt-0.5 font-body text-xs text-slate-500">
              {forgotMode
                ? 'We will email a link that opens on roamdominion.co'
                : 'Enter your operator credentials to access Dominion workspace.'}
            </p>
          </div>

          {lockoutSeconds !== null && lockoutSeconds > 0 ? (
            <LockoutCountdown
              retryAfterSec={lockoutSeconds}
              onExpired={() => {
                setLockoutSeconds(null);
                setError(null);
              }}
              portalName="the Admin Portal"
              accentColor="bg-amber-500"
            />
          ) : (
            <>
              {error && (
                <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {success && (
                <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700">
                  {success}
                </div>
              )}

              <form
                onSubmit={forgotMode ? handleForgotPassword : handleLogin}
                className="space-y-4"
              >
                <div>
                  <label
                    className="mb-1.5 block font-label text-xs font-semibold text-slate-700"
                    htmlFor="email"
                  >
                    Work email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@roamfleet.co"
                    required
                    className="w-full rounded-lg border border-slate-300 bg-slate-50/50 px-3.5 py-2.5 font-body text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-dominion-blue focus:bg-white focus:outline-none focus:ring-2 focus:ring-dominion-blue/20"
                  />
                </div>

                {!forgotMode && (
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <label
                        className="font-label text-xs font-semibold text-slate-700"
                        htmlFor="password"
                      >
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setForgotMode(true);
                          setError(null);
                          setSuccess(null);
                        }}
                        className="text-xs font-medium text-dominion-blue hover:text-dominion-blue-hover"
                      >
                        Reset credentials
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••••••"
                        required
                        className="w-full rounded-lg border border-slate-300 bg-slate-50/50 px-3.5 py-2.5 pr-10 font-mono text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-dominion-blue focus:bg-white focus:outline-none focus:ring-2 focus:ring-dominion-blue/20"
                      />
                      <button
                        type="button"
                        aria-label="Toggle password visibility"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 focus:outline-none"
                      >
                        <span className="sr-only">visibility</span>
                        {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                      </button>
                    </div>
                  </div>
                )}

                {forgotMode && (
                  <button
                    type="button"
                    onClick={() => {
                      setForgotMode(false);
                      setError(null);
                    }}
                    className="text-xs font-medium text-slate-500 hover:text-slate-800"
                  >
                    Back to sign in
                  </button>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-dominion-blue px-4 py-2.5 font-headline text-sm font-medium text-white shadow-xs transition-colors duration-150 hover:bg-dominion-blue-hover focus:outline-none focus:ring-2 focus:ring-dominion-blue focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>{forgotMode ? 'Sending…' : 'Signing in…'}</span>
                    </>
                  ) : forgotMode ? (
                    <span>Send reset email</span>
                  ) : (
                    <>
                      {/* stitch: Continue arrow_forward */}
                      <span>Continue</span>
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </>
                  )}
                </button>
              </form>

              <div className="mt-5 flex items-center justify-center border-t border-slate-100 pt-4">
                <a
                  href="/"
                  className="text-xs text-slate-500 transition-colors hover:text-slate-800"
                >
                  Need access or SSO recovery?
                </a>
              </div>
            </>
          )}
        </section>

        <section className="rounded-xl border border-slate-200/80 bg-white/80 p-5 shadow-xs">
          <div className="mb-2 flex items-center gap-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-slate-100 text-slate-600">
              <LockKeyhole className="h-3.5 w-3.5" />
            </div>
            <h2 className="font-headline text-sm font-semibold text-slate-800">Authenticator</h2>
            <span className="ml-auto rounded border border-slate-200 bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-500">
              STAGE 2
            </span>
          </div>
          <p className="mb-3.5 font-body text-xs text-slate-500">
            Use the code from your authenticator app.
          </p>
          <div className="mb-3.5 grid grid-cols-6 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <input
                key={i}
                type="text"
                maxLength={1}
                disabled
                className="h-10 cursor-not-allowed rounded border border-slate-200 bg-slate-50/70 text-center font-mono text-base font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-dominion-blue"
              />
            ))}
          </div>
          <button
            type="button"
            disabled
            className="flex w-full cursor-not-allowed items-center justify-center gap-1.5 rounded-lg border border-slate-200/80 bg-slate-100 px-3 py-2 font-headline text-xs font-medium text-slate-400"
          >
            <Shield className="h-3.5 w-3.5" />
            <span>Verify</span>
          </button>
        </section>
      </main>

      <footer className="relative z-10 w-full py-5 text-center">
        <div className="inline-flex items-center gap-1.5 font-mono text-xs text-slate-400">
          <Lock className="h-3.5 w-3.5 text-slate-400" />
          <span>roamfleet.co/admin</span>
        </div>
      </footer>
    </div>
  );
}
