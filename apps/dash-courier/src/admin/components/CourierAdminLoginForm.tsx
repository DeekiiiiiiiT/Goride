import React, { useState } from 'react';
import { GOOGLE_OAUTH_EMAIL_ONLY_SCOPES, supabaseCourierAdmin as supabase } from '@roam/auth-client';
import { Loader2, AlertCircle, KeyRound, Bike } from 'lucide-react';
import { GoogleIcon } from '@/components/icons/GoogleIcon';
import '../../../../../packages/admin-core/src/styles/rides-admin-login.css';

function getAdminRedirectUrl(): string {
  return `${window.location.origin}/admin`;
}

export function CourierAdminLoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError(null);
    setNotice(null);
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: getAdminRedirectUrl(),
          scopes: GOOGLE_OAUTH_EMAIL_ONLY_SCOPES,
          queryParams: { prompt: 'select_account' },
        },
      });
      if (oauthError) throw oauthError;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed');
      setGoogleLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError('Enter your admin email above, then click Forgot password.');
      return;
    }
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: getAdminRedirectUrl(),
      });
      if (resetError) throw resetError;
      setNotice('Password reset email sent. Check your inbox, then sign in with the new password.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send reset email');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rides-admin-login courier-admin-login">
      <aside className="rides-admin-login__brand" aria-hidden="true">
        <div className="rides-admin-login__brand-inner">
          <div className="rides-admin-login__logo courier-admin-login__logo">
            <Bike size={32} strokeWidth={1.75} />
          </div>
          <h1 className="rides-admin-login__title">Roam Dash Courier</h1>
          <p className="rides-admin-login__subtitle">Admin Portal</p>
          <p className="rides-admin-login__tagline">
            Manage courier workforce, compliance, live presence, and delivery operations for Roam Dash.
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
                Roam Dash Courier
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

            <button
              type="button"
              disabled={loading || googleLoading}
              onClick={() => void handleGoogleSignIn()}
              className="rides-admin-login__google courier-admin-login__google"
            >
              {googleLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Redirecting to Google...
                </>
              ) : (
                <>
                  <GoogleIcon />
                  Sign in with Google
                </>
              )}
            </button>

            <div className="rides-admin-login__divider">
              <span>or use email</span>
            </div>

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
                <div className="rides-admin-login__label-row">
                  <label htmlFor="courier-admin-password" className="rides-admin-login__label">
                    Password
                  </label>
                  <button
                    type="button"
                    className="rides-admin-login__forgot"
                    disabled={loading || googleLoading}
                    onClick={() => void handleForgotPassword()}
                  >
                    Forgot password?
                  </button>
                </div>
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
              </div>
              <button type="submit" disabled={loading} className="rides-admin-login__submit courier-admin-login__submit">
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Signing in...
                  </>
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
              <a href="/" className="rides-admin-login__back">
                Back to Courier App
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
