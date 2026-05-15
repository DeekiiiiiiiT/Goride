import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@roam/auth-client';
import { toast } from 'sonner';

export default function LoginPage({ session }: { session: Session | null }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  if (session) return <Navigate to="/" replace />;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { name, role: 'passenger' },
            emailRedirectTo: `${window.location.origin}/`,
          },
        });
        if (error) throw error;
        toast.success('Check your email to confirm, then sign in.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success('Welcome back');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Auth failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col justify-center px-4">
      <div className="max-w-md mx-auto w-full space-y-8">
        <div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-900">Roam Rides</h1>
          <p className="mt-1 text-zinc-500 text-sm">Sign in to book a driver.</p>
        </div>

        <form onSubmit={onSubmit} className="bg-white border border-zinc-200 rounded-2xl p-6 space-y-4 shadow-sm">
          {isSignUp && (
            <div>
              <label className="text-xs font-medium text-zinc-600">Name</label>
              <input
                className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required={isSignUp}
              />
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-zinc-600">Email</label>
            <input
              type="email"
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-600">Password</label>
            <input
              type="password"
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-zinc-900 text-white py-2.5 text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
          >
            {loading ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in'}
          </button>
          <button
            type="button"
            className="w-full text-sm text-zinc-600 hover:text-zinc-900"
            onClick={() => setIsSignUp(!isSignUp)}
          >
            {isSignUp ? 'Have an account? Sign in' : 'New here? Create account'}
          </button>
        </form>
      </div>
    </div>
  );
}
