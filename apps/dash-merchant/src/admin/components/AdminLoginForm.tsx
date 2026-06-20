import React, { useState } from 'react';
import { supabaseDashAdmin as supabase } from '@roam/auth-client';
import type { AuthRecoverySurface } from '@roam/auth-client';
import { useForgotPassword } from '@roam/auth-client';
import { Loader2, AlertCircle, KeyRound, Utensils } from 'lucide-react';
import '../../../../../packages/admin-core/src/styles/admin-login.css';

interface AdminLoginFormProps {
  productName?: string;
  productSubtitle?: string;
  backHref?: string;
  backLabel?: string;
  recoverySurface?: AuthRecoverySurface;
}

export function AdminLoginForm({
  productName = 'Roam Dash',
  productSubtitle = 'Admin Portal',
  backHref = '/',
  backLabel = 'Back to Roam Dash',
  recoverySurface = 'dash',
}: AdminLoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    forgotMode,
    setForgotMode,
    notice,
    setNotice,
    forgotLoading,
    sendResetEmail,
  } = useForgotPassword(supabase, recoverySurface, { signInHref: '/admin' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (forgotMode) {
      setError(null);
      setNotice(null);
      const err = await sendResetEmail(email);
      if (err) setError(err);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dash-admin-login">
      <aside className="dash-admin-login__brand" aria-hidden="true">
        <div className="dash-admin-login__brand-inner">
          <div className="dash-admin-login__logo">
            <Utensils size={32} strokeWidth={1.75} />
          </div>
          <h1 className="dash-admin-login__title">{productName}</h1>
          <p className="dash-admin-login__subtitle">{productSubtitle}</p>
          <p className="dash-admin-login__tagline">
            Manage merchant verification, orders, and delivery operations for the Roam Dash platform.
          </p>
        </div>
      </aside>

      <div className="dash-admin-login__main">
        <div style={{ width: '100%', maxWidth: '26rem' }}>
          <div className="dash-admin-login__mobile-brand">
            <div className="dash-admin-login__mobile-logo">
              <Utensils size={24} strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="dash-admin-login__title" style={{ fontSize: '1.25rem' }}>
                {productName}
              </h1>
              <p className="dash-admin-login__subtitle" style={{ margin: 0 }}>
                {productSubtitle}
              </p>
            </div>
          </div>

          <div className="dash-admin-login__card">
            <div className="dash-admin-login__card-header">
              <div className="dash-admin-login__card-icon">
                <KeyRound size={20} />
              </div>
              <div>
                <h2 className="dash-admin-login__card-title">
                  {forgotMode ? 'Reset Password' : 'Admin Login'}
                </h2>
                <p className="dash-admin-login__card-desc">
                  {forgotMode ? 'We will email a link on this domain' : 'Sign in to manage Roam Dash'}
                </p>
              </div>
            </div>

            {error && (
              <div className="dash-admin-login__error" role="alert">
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>{error}</span>
              </div>
            )}

            {notice && (
              <div className="dash-admin-login__error" role="status" style={{ borderColor: 'rgba(16,185,129,0.3)', color: '#059669' }}>
                <span>{notice}</span>
              </div>
            )}

            <form onSubmit={(e) => void handleSubmit(e)}>
              <div className="dash-admin-login__field">
                <label htmlFor="admin-email" className="dash-admin-login__label">
                  Email
                </label>
                <input
                  id="admin-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  className="dash-admin-login__input"
                />
              </div>
              {!forgotMode && (
              <div className="dash-admin-login__field">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label htmlFor="admin-password" className="dash-admin-login__label">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => { setForgotMode(true); setError(null); setNotice(null); }}
                    className="text-sm text-amber-600 hover:text-amber-500"
                  >
                    Forgot password?
                  </button>
                </div>
                <input
                  id="admin-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="dash-admin-login__input"
                />
              </div>
              )}
              {forgotMode && (
                <button
                  type="button"
                  onClick={() => { setForgotMode(false); setError(null); }}
                  className="text-sm text-slate-500 hover:text-slate-700 mb-2"
                >
                  Back to sign in
                </button>
              )}
              <button type="submit" disabled={loading || forgotLoading} className="dash-admin-login__submit">
                {loading || forgotLoading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Please wait...
                  </>
                ) : forgotMode ? (
                  'Send reset email'
                ) : (
                  'Sign In'
                )}
              </button>
            </form>

            <div className="dash-admin-login__footer">
              <p>
                Platform admins can use the same credentials as{' '}
                <a href="https://roamdominion.co" target="_blank" rel="noopener noreferrer">
                  Roam Dominion
                </a>
                .
              </p>
              <a href={backHref} className="dash-admin-login__back">
                {backLabel}
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
