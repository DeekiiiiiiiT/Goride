import React, { useState } from 'react';
import {
  supabaseCourierAdmin as supabase,
  useForgotPassword,
  ADMIN_INCORRECT_CREDENTIALS,
  consumeAdminLoginErrorFlash,
} from '@roam/auth-client';
import { Loader2, AlertCircle, KeyRound, Bike } from 'lucide-react';
import '../../../../../packages/admin-core/src/styles/rides-admin-login.css';

export function CourierAdminLoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(() => consumeAdminLoginErrorFlash());
  const {
    forgotMode,
    setForgotMode,
    notice,
    setNotice,
    forgotLoading,
    sendResetEmail,
  } = useForgotPassword('courier', { signInHref: '/admin' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (forgotMode) {
      setLoading(true);
      setError(null);
      setNotice(null);
      const err = await sendResetEmail(email);
      if (err) setError(err);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError || !data.session) {
        setError(ADMIN_INCORRECT_CREDENTIALS);
        return;
      }
      // Non-admins are cleared by CourierAdminPortal (supports DB-permission team access)
    } catch {
      setError(ADMIN_INCORRECT_CREDENTIALS);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    setForgotMode(true);
    setError(null);
    setNotice(null);
  };

  return (
    <div className="rides-admin-login courier-admin-login">
      <aside className="rides-admin-login__brand" aria-hidden="true">
        <div className="rides-admin-login__brand-inner">
          <div className="rides-admin-login__logo courier-admin-login__logo">
            <Bike size={32} strokeWidth={1.75} />
          </div>
          <h1 className="rides-admin-login__title">Roam Rush Courier</h1>
          <p className="rides-admin-login__subtitle">Admin Portal</p>
          <p className="rides-admin-login__tagline">
            Manage courier workforce, compliance, live presence, and delivery operations for Roam Rush.
          </p>
        </div>
      </aside>

      <div className="rides-admin-login__main">
        <div style={{ width: '100%', maxWidth: '26rem' }}>
          <div className="rides-admin-login__mobile-brand">
            <div className="rides-admin-login__mobile-logo courier-admin-login__logo">
              <Bike size={24} strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="rides-admin-login__title" style={{ fontSize: '1.25rem' }}>
                Roam Rush Courier
              </h1>
              <p className="rides-admin-login__subtitle" style={{ margin: 0 }}>
                Admin Portal
              </p>
            </div>
          </div>

          <div className="rides-admin-login__card">
            <div className="rides-admin-login__card-header">
              <div className="rides-admin-login__card-icon courier-admin-login__card-icon">
                <KeyRound size={20} />
              </div>
              <div>
                <h2 className="rides-admin-login__card-title">Admin Login</h2>
                <p className="rides-admin-login__card-desc">Sign in to manage Dash Courier</p>
              </div>
            </div>

            {error && (
              <div className="rides-admin-login__error" role="alert">
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>{error}</span>
              </div>
            )}

            {notice && (
              <div className="rides-admin-login__notice" role="status">
                <span>{notice}</span>
              </div>
            )}

            <form onSubmit={(e) => void handleSubmit(e)}>
              <div className="rides-admin-login__field">
                <label htmlFor="courier-admin-email" className="rides-admin-login__label">
                  Email
                </label>
                <input
                  id="courier-admin-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  className="rides-admin-login__input"
                />
              </div>
              <div className="rides-admin-login__field">
                {!forgotMode ? (
                <div className="rides-admin-login__label-row">
                  <label htmlFor="courier-admin-password" className="rides-admin-login__label">
                    Password
                  </label>
                  <button
                    type="button"
                    className="rides-admin-login__forgot"
                    disabled={loading}
                    onClick={handleForgotPassword}
                  >
                    Forgot password?
                  </button>
                </div>
                ) : (
                  <button
                    type="button"
                    className="rides-admin-login__forgot"
                    onClick={() => { setForgotMode(false); setError(null); }}
                  >
                    Back to sign in
                  </button>
                )}
                {!forgotMode && (
                <input
                  id="courier-admin-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="rides-admin-login__input"
                />
                )}
              </div>
              <button type="submit" disabled={loading || forgotLoading} className="rides-admin-login__submit courier-admin-login__submit">
                {loading || forgotLoading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    {forgotMode ? 'Sending...' : 'Signing in...'}
                  </>
                ) : forgotMode ? (
                  'Send reset email'
                ) : (
                  'Sign In'
                )}
              </button>
            </form>

            <div className="rides-admin-login__footer">
              <p>
                Platform admins can use the same credentials as{' '}
                <a href="https://roamdominion.co" target="_blank" rel="noopener noreferrer">
                  Roam Dominion
                </a>
                .
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
