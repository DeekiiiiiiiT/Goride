// Stitch: dominion-redesign/d8107f1d4b7c4c8bbb570fed4a8216be
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
    <div className="flex min-h-screen items-center justify-center bg-[#f1f5f9] p-8 text-[#0f172a]">
      <div className="w-full max-w-md">
          <div className="mb-8 flex items-center justify-center gap-3">
            <div className="rounded-xl bg-dominion-navy p-2.5">
              <Shield className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-[#0f172a]">Dominion</h1>
              <p className="text-xs text-[#64748b]">Roam Admin Console</p>
            </div>
          </div>
          <p className="mb-4 text-center text-xs font-medium text-[#64748b]">1 Sign in · 2 Authenticator</p>

          <div className="rounded-2xl border border-[#e2e8f0] bg-[#ffffff] p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg bg-blue-500/20">
                <KeyRound className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-[#0f172a]">
                  {forgotMode ? 'Reset Password' : 'Sign in'}
                </h2>
                <p className="text-sm text-[#64748b]">
                  {forgotMode
                    ? 'We will email a link that opens on roamdominion.co'
                    : 'Then use the code from your authenticator app.'}
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

            <form onSubmit={forgotMode ? handleForgotPassword : handleLogin} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#334155]">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="admin@roamdominion.co"
                  required
                  className="w-full rounded-lg border border-[#cbd5e1] bg-[#ffffff] px-3 py-2.5 text-sm text-[#0f172a] placeholder:text-[#94a3b8] focus:border-dominion-blue focus:outline-none focus:ring-2 focus:ring-dominion-blue/40"
                />
              </div>

              {!forgotMode && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#334155]">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter password"
                  required
                  className="w-full rounded-lg border border-[#cbd5e1] bg-[#ffffff] px-3 py-2.5 text-sm text-[#0f172a] placeholder:text-[#94a3b8] focus:border-dominion-blue focus:outline-none focus:ring-2 focus:ring-dominion-blue/40"
                />
              </div>
              )}

              {!forgotMode && (
                <button
                  type="button"
                  onClick={() => { setForgotMode(true); setError(null); setSuccess(null); }}
                  className="text-sm text-dominion-blue"
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
                disabled={isLoading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-dominion-blue py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
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

            <div className="mt-6 border-t border-slate-200 pt-4 text-center">
              <a href="/" className="text-sm text-slate-500">Back to home</a>
              <p className="mt-2 font-mono text-xs text-slate-400">roamfleet.co/admin</p>
            </div>
          </div>
        </div>
    </div>
  );
}
