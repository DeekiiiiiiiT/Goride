import React, { useState, useEffect } from 'react';
import { Shield, Loader2, AlertCircle, KeyRound, UserPlus } from 'lucide-react';
import { supabase } from '../../utils/supabase/client';
import { API_ENDPOINTS } from '../../services/apiConfig';
import { publicAnonKey } from '../../utils/supabase/info';
import { LockoutCountdown } from '../auth/LockoutCountdown';

/**
 * AdminLoginPage — shown at /admin when no user is logged in.
 * Two modes:
 *   1. Setup mode (first-time): email + password + name to seed the superadmin account
 *   2. Login mode (subsequent): email + password to sign in
 * The mode is determined by calling GET /admin-check on mount.
 */
export function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [adminExists, setAdminExists] = useState(false);
  const [lockoutSeconds, setLockoutSeconds] = useState<number | null>(null);

  // Check if superadmin already exists
  useEffect(() => {
    (async () => {
      try {
        let res: Response | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            res = await fetch(`${API_ENDPOINTS.admin}/admin-check`, {
              headers: { Authorization: `Bearer ${publicAnonKey}` },
            });
            break; // success
          } catch (fetchErr) {
            if (attempt < 2) {
              await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
              continue;
            }
            throw fetchErr; // exhausted retries
          }
        }
        const data = await res!.json();
        setAdminExists(data.exists === true);
      } catch (e) {
        console.error('Admin check failed:', e);
        // Default to login mode on error
        setAdminExists(true);
      } finally {
        setChecking(false);
      }
    })();
  }, []);

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`${API_ENDPOINTS.admin}/admin-seed`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ email, password, name }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create super admin');

      setSuccess('Super admin account created! Signing you in...');

      // Auto sign-in via server-side endpoint (handles password recovery)
      const loginRes = await fetch(`${API_ENDPOINTS.admin}/admin-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ email, password }),
      });
      const loginData = await loginRes.json();
      if (!loginRes.ok) throw new Error(loginData.error || 'Auto sign-in failed');

      // Set session client-side so AuthContext picks it up
      await supabase.auth.setSession({
        access_token: loginData.access_token,
        refresh_token: loginData.refresh_token,
      });

      // Auth state change will trigger re-render via AuthContext
    } catch (err: any) {
      console.error('Admin setup error:', err);
      setError(err.message || 'Setup failed');
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
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${publicAnonKey}`,
        },
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

      if (!res.ok) throw new Error(data.error || 'Login failed');

      // Set session client-side so AuthContext picks it up
      await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });

      // Auth state change will trigger re-render via AuthContext
    } catch (err: any) {
      console.error('Admin login error:', err);
      setError(err.message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-950">
        <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
      </div>
    );
  }

  const isSetup = !adminExists;

  return (
    <div className="min-h-screen bg-slate-950 flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 flex-col items-center justify-center p-12 bg-gradient-to-br from-slate-900 to-slate-950 border-r border-slate-800">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-amber-500/20 p-3 rounded-xl">
            <Shield className="w-8 h-8 text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Roam Fleet</h1>
            <p className="text-slate-400 text-sm">Super Admin Portal</p>
          </div>
        </div>
        <p className="text-slate-500 text-center max-w-sm leading-relaxed">
          Manage customer accounts, fuel stations, toll databases, and platform settings from a single control plane.
        </p>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Mobile branding */}
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <div className="bg-amber-500/20 p-2.5 rounded-xl">
              <Shield className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Roam Fleet</h1>
              <p className="text-slate-400 text-xs">Super Admin Portal</p>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
              <div className={`p-2 rounded-lg ${isSetup ? 'bg-emerald-500/20' : 'bg-blue-500/20'}`}>
                {isSetup
                  ? <UserPlus className="w-5 h-5 text-emerald-400" />
                  : <KeyRound className="w-5 h-5 text-blue-400" />
                }
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">
                  {isSetup ? 'Initial Setup' : 'Admin Login'}
                </h2>
                <p className="text-slate-400 text-sm">
                  {isSetup
                    ? 'Create the platform super admin account'
                    : 'Sign in to the admin portal'
                  }
                </p>
              </div>
            </div>

            {/* Error */}
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

            {/* Success */}
            {success && (
              <div className="mb-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-lg px-3 py-2.5 text-sm">
                {success}
              </div>
            )}

            {/* Form */}
            <form onSubmit={isSetup ? handleSetup : handleLogin} className="space-y-4">
              {isSetup && (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Full Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Platform Administrator"
                    className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 text-sm"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="admin@roamfleet.co"
                  required
                  className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={isSetup ? 'Create a strong password' : 'Enter password'}
                  required
                  className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {isSetup ? 'Creating Account...' : 'Signing In...'}
                  </>
                ) : (
                  isSetup ? 'Create Super Admin Account' : 'Sign In'
                )}
              </button>
            </form>
            </>
            )}

            {/* Footer link back to regular app */}
            <div className="mt-6 pt-4 border-t border-slate-800 text-center">
              <a
                href="/"
                className="text-slate-500 hover:text-slate-300 text-sm transition-colors"
              >
                Back to Fleet Dashboard
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}