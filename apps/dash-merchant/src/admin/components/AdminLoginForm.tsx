import React, { useState } from 'react';
import { supabase } from '@roam/auth-client';
import { Loader2, AlertCircle, KeyRound, Utensils } from 'lucide-react';

interface AdminLoginFormProps {
  productName?: string;
  productSubtitle?: string;
  backHref?: string;
  backLabel?: string;
}

export function AdminLoginForm({
  productName = 'Roam Dash',
  productSubtitle = 'Admin Portal',
  backHref = '/',
  backLabel = 'Back to Roam Dash',
}: AdminLoginFormProps) {
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
    <div className="min-h-screen bg-slate-950 flex">
      <div className="hidden lg:flex lg:w-1/2 flex-col items-center justify-center p-12 bg-gradient-to-br from-slate-900 to-slate-950 border-r border-slate-800">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-amber-500/20 p-3 rounded-xl">
            <Utensils className="w-8 h-8 text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">{productName}</h1>
            <p className="text-slate-400 text-sm">{productSubtitle}</p>
          </div>
        </div>
        <p className="text-slate-500 text-center max-w-sm leading-relaxed">
          Manage merchant verification, orders, and delivery operations for the Roam Dash platform.
        </p>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <div className="bg-amber-500/20 p-2.5 rounded-xl">
              <Utensils className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">{productName}</h1>
              <p className="text-slate-400 text-xs">{productSubtitle}</p>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg bg-blue-500/20">
                <KeyRound className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Admin Login</h2>
                <p className="text-slate-400 text-sm">Sign in to manage Roam Dash</p>
              </div>
            </div>

            {error && (
              <div className="mb-4 flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg px-3 py-2.5 text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              <div>
                <label htmlFor="admin-email" className="block text-sm font-medium text-slate-300 mb-1.5">
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
                  className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 text-sm"
                />
              </div>
              <div>
                <label htmlFor="admin-password" className="block text-sm font-medium text-slate-300 mb-1.5">
                  Password
                </label>
                <input
                  id="admin-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign In'
                )}
              </button>
            </form>

            <div className="mt-6 pt-4 border-t border-slate-800 text-center space-y-2">
              <p className="text-slate-500 text-xs">
                Platform admins can use the same credentials as{' '}
                <a
                  href="https://roamdominion.co"
                  className="text-amber-400 hover:text-amber-300 transition-colors"
                >
                  Roam Dominion
                </a>
                .
              </p>
              <a
                href={backHref}
                className="inline-block text-slate-500 hover:text-slate-300 text-sm transition-colors"
              >
                {backLabel}
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
