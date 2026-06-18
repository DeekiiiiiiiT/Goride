import React, { useState } from 'react';
import { supabaseHaulAdmin as supabase } from '@roam/auth-client';
import { Loader2, AlertCircle, KeyRound, Truck } from 'lucide-react';
import '../../../../../packages/admin-core/src/styles/rides-admin-login.css';

export function HaulAdminLoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
              <div className="rides-admin-login__field">
                <label htmlFor="haul-admin-password" className="rides-admin-login__label">Password</label>
                <input
                  id="haul-admin-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="rides-admin-login__input"
                />
              </div>
              <button type="submit" disabled={loading} className="rides-admin-login__submit">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign in'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
