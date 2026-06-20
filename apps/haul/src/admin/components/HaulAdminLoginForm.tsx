import React, { useState } from 'react';
import { supabaseHaulAdmin as supabase, useForgotPassword } from '@roam/auth-client';
import { Loader2, AlertCircle, KeyRound, Truck } from 'lucide-react';
import '../../../../../packages/admin-core/src/styles/rides-admin-login.css';

export function HaulAdminLoginForm() {
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
  } = useForgotPassword('haul', { signInHref: '/admin' });

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
    <div className="rides-admin-login">
      <aside className="rides-admin-login__brand" aria-hidden="true">
        <div className="rides-admin-login__brand-inner">
          <div className="rides-admin-login__logo">
            <Truck size={32} strokeWidth={1.75} />
          </div>
          <h1 className="rides-admin-login__title">Roam Haul</h1>
          <p className="rides-admin-login__subtitle">Admin Portal</p>
          <p className="rides-admin-login__tagline">
            Manage freight catalog, transport solutions, and hauler operations.
          </p>
        </div>
      </aside>
      <div className="rides-admin-login__main">
        <div style={{ width: '100%', maxWidth: '26rem' }}>
          <div className="rides-admin-login__card">
            <div className="rides-admin-login__card-header">
              <div className="rides-admin-login__card-icon">
                <KeyRound size={20} />
              </div>
              <div>
                <h2 className="rides-admin-login__card-title">Admin Login</h2>
                <p className="rides-admin-login__card-desc">Sign in to manage Roam Haul</p>
              </div>
            </div>
            {error && (
              <div className="rides-admin-login__error" role="alert">
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>{error}</span>
              </div>
            )}
            {notice && (
              <div className="rides-admin-login__error" role="status" style={{ color: '#059669', borderColor: 'rgba(16,185,129,0.3)' }}>
                <span>{notice}</span>
              </div>
            )}
            <form onSubmit={(e) => void handleSubmit(e)}>
              <div className="rides-admin-login__field">
                <label htmlFor="haul-admin-email" className="rides-admin-login__label">Email</label>
                <input
                  id="haul-admin-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="rides-admin-login__input"
                />
              </div>
              {!forgotMode && (
              <div className="rides-admin-login__field">
                <div className="rides-admin-login__label-row">
                  <label htmlFor="haul-admin-password" className="rides-admin-login__label">Password</label>
                  <button type="button" className="rides-admin-login__forgot" onClick={() => { setForgotMode(true); setError(null); setNotice(null); }}>
                    Forgot password?
                  </button>
                </div>
                <input
                  id="haul-admin-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="rides-admin-login__input"
                />
              </div>
              )}
              {forgotMode && (
                <button type="button" className="rides-admin-login__forgot" onClick={() => { setForgotMode(false); setError(null); }}>
                  Back to sign in
                </button>
              )}
              <button type="submit" disabled={loading || forgotLoading} className="rides-admin-login__submit">
                {loading || forgotLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : forgotMode ? 'Send reset email' : 'Sign in'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
