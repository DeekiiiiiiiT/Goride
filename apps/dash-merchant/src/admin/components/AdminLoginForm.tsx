import React, { useState } from 'react';
import { supabase } from '@roam/auth-client';
import { Loader2, Shield } from 'lucide-react';
import { toast } from 'sonner';

interface AdminLoginFormProps {
  productName?: string;
}

export function AdminLoginForm({ productName = 'Roam Dash' }: AdminLoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success('Signed in');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center mx-auto mb-4">
          <Shield className="w-7 h-7 text-slate-900" />
        </div>
        <h1 className="text-xl font-semibold text-white">{productName} Admin</h1>
        <p className="text-sm text-slate-400 mt-2">
          Sign in with your platform or Dash admin account.
        </p>
      </div>

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
            className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            placeholder="you@company.com"
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
            className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            placeholder="••••••••"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 text-sm font-medium rounded-lg bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          Sign in to Admin
        </button>
      </form>

      <p className="text-xs text-slate-500 text-center mt-6">
        Need platform access? Use the same account as{' '}
        <a href="https://roamdominion.co" className="text-amber-400 hover:underline">
          Roam Dominion
        </a>
        .
      </p>
    </div>
  );
}
