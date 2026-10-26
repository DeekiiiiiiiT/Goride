import React, { useState } from 'react';
import { Shield, Loader2, AlertCircle, KeyRound } from 'lucide-react';
import { supabase } from '../../utils/supabase/client';
import { API_ENDPOINTS } from '../../services/apiConfig';
import { supabaseAnonFunctionHeaders } from '@roam/api-client';
import {
  requestPasswordReset,
  rememberRecoverySignInHref,
  consumeAdminLoginErrorFlash,
  ADMIN_INCORRECT_CREDENTIALS,
  GOOGLE_OAUTH_EMAIL_ONLY_SCOPES,
  adminPasswordFailureMessage,
  clearDominionAccessDenied,
  dominionAccessDeniedMessage,
  recordDominionAccessDenied,
} from '@roam/auth-client';
import { LockoutCountdown } from '../auth/LockoutCountdown';

function GoogleMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

/**
 * Dominion sign-in. There is no first-time setup screen.
 * Google is the path for the owner account. Email and password stay for a password that was set here.
 */
export function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(() => consumeAdminLoginErrorFlash());
  const [success, setSuccess] = useState<string | null>(null);
  const [lockoutSeconds, setLockoutSeconds] = useState<number | null>(null);
  const [forgotMode, setForgotMode] = useState(false);

  const handleGoogle = async () => {
    setGoogleLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/`,
          scopes: GOOGLE_OAUTH_EMAIL_ONLY_SCOPES,
          queryParams: { prompt: 'select_account' },
        },
      });
      if (oauthError) throw oauthError;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed.');
      setGoogleLoading(false);
    }
  };

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
        if (data?.reason === 'no_platform_role') {
          const count = recordDominionAccessDenied();
          throw new Error(dominionAccessDeniedMessage(count));
        }
        clearDominionAccessDenied();
        throw new Error(
          res.status === 401 || res.status === 403
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
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex">
      <div className="hidden lg:flex lg:w-1/2 flex-col items-center justify-center p-12 bg-gradient-to-br from-slate-100 to-slate-200 border-r border-slate-200 dark:from-slate-900 dark:to-slate-950 dark:border-slate-800">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-amber-500/20 p-3 rounded-xl">
            <Shield className="w-8 h-8 text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Roam Dominion</h1>
            <p className="text-slate-600 dark:text-slate-400 text-sm">Super Admin Portal</p>
          </div>
        </div>
        <p className="text-slate-500 text-center max-w-sm leading-relaxed">
          Manage customer accounts, fuel stations, toll databases, and platform settings from a single control plane.
        </p>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <div className="bg-amber-500/20 p-2.5 rounded-xl">
              <Shield className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Roam Dominion</h1>
              <p className="text-slate-400 text-xs">Super Admin Portal</p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 rounded-2xl p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg bg-blue-500/20">
                <KeyRound className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  {forgotMode ? 'Reset Password' : 'Admin Login'}
                </h2>
                <p className="text-slate-400 text-sm">
                  {forgotMode
                    ? 'We will email a link that opens on roamdominion.co'
                    : 'Sign in to the admin portal'}
                </p>
              </div>
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
              <div className="mb-4 flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg px-3 py-2.5 text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="mb-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-lg px-3 py-2.5 text-sm">
                {success}
              </div>
            )}

            {!forgotMode && (
              <>
                <button
                  type="button"
                  onClick={() => void handleGoogle()}
                  disabled={googleLoading || isLoading}
                  className="flex w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100"
                >
                  {googleLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <GoogleMark className="h-5 w-5" />}
                  Sign in with Google
                </button>
                <div className="my-4 flex items-center gap-3">
                  <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                  <span className="text-xs text-slate-500">or</span>
                  <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                </div>
              </>
            )}

            <form onSubmit={forgotMode ? handleForgotPassword : handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="admin@roamdominion.co"
                  required
                  className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:placeholder:text-slate-500"
                />
              </div>

              {!forgotMode && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter password"
                  required
                  className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:placeholder:text-slate-500"
                />
              </div>
              )}

              {!forgotMode && (
                <button
                  type="button"
                  onClick={() => { setForgotMode(true); setError(null); setSuccess(null); }}
                  className="text-sm text-amber-600 hover:text-amber-500 dark:text-amber-400"
                >
                  Forgot password?
                </button>
              )}

              {forgotMode && (
                <button
                  type="button"
                  onClick={() => { setForgotMode(false); setError(null); }}
                  className="text-sm text-slate-500 hover:text-slate-300"
                >
                  Back to sign in
                </button>
              )}

              <button
                type="submit"
                disabled={isLoading || googleLoading}
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Signing In...
                  </>
                ) : forgotMode ? (
                  'Send reset email'
                ) : (
                  'Sign In'
                )}
              </button>
            </form>
            </>
            )}

            <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800 text-center">
              <a
                href="/"
                className="text-slate-500 hover:text-slate-300 text-sm transition-colors"
              >
                Back to home
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
