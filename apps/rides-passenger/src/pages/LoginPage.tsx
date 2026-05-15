import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@roam/auth-client';
import { toast } from 'sonner';
import { Car, Lock, Mail, Sparkles, User } from 'lucide-react';

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
    <div className="min-h-[100dvh] flex flex-col bg-zinc-100 relative overflow-hidden">
      {/* Soft brand wash */}
      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{
          background:
            'radial-gradient(120% 80% at 50% -20%, rgba(5, 150, 105, 0.14), transparent 52%), radial-gradient(80% 60% at 100% 100%, rgba(24, 24, 27, 0.06), transparent 45%)',
        }}
      />

      <div className="relative flex flex-col flex-1 safe-x safe-t safe-b justify-between py-6 sm:py-10 max-w-md mx-auto w-full">
        {/* Hero */}
        <header className="text-center px-1 pt-2 sm:pt-6 space-y-4">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/25 mx-auto">
            <Car className="w-7 h-7" strokeWidth={2} aria-hidden />
          </div>
          <div className="space-y-2">
            <h1 className="text-[1.65rem] sm:text-3xl font-semibold tracking-tight text-zinc-900 leading-tight">
              Roam Rides
            </h1>
            <p className="text-zinc-600 text-base max-w-[22rem] mx-auto leading-relaxed">
              Tap below to book a licensed driver. Built for your phone—quick sign-in, live matching.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-zinc-500">
            <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-3 py-1 ring-1 ring-zinc-200/80 shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" aria-hidden />
              Secure checkout-ready backend
            </span>
          </div>
        </header>

        {/* Form card */}
        <main className="flex-1 flex flex-col justify-center py-8">
          <form
            onSubmit={onSubmit}
            className="rounded-3xl bg-white p-5 sm:p-7 shadow-xl shadow-zinc-900/8 ring-1 ring-zinc-200/90 space-y-5"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-lg font-semibold text-zinc-900">
                {isSignUp ? 'Create account' : 'Welcome back'}
              </h2>
              <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                Passenger
              </span>
            </div>

            {isSignUp && (
              <label className="block space-y-2">
                <span className="text-sm font-medium text-zinc-700 flex items-center gap-2">
                  <User className="w-4 h-4 text-zinc-400 shrink-0" aria-hidden />
                  Name
                </span>
                <input
                  className="input-touch w-full rounded-2xl border border-zinc-200 bg-zinc-50/80 px-4 outline-none transition placeholder:text-zinc-400 focus:border-emerald-500/60 focus:bg-white focus:ring-4 focus:ring-emerald-500/15"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                  required={isSignUp}
                />
              </label>
            )}

            <label className="block space-y-2">
              <span className="text-sm font-medium text-zinc-700 flex items-center gap-2">
                <Mail className="w-4 h-4 text-zinc-400 shrink-0" aria-hidden />
                Email
              </span>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                className="input-touch w-full rounded-2xl border border-zinc-200 bg-zinc-50/80 px-4 outline-none transition placeholder:text-zinc-400 focus:border-emerald-500/60 focus:bg-white focus:ring-4 focus:ring-emerald-500/15"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-zinc-700 flex items-center gap-2">
                <Lock className="w-4 h-4 text-zinc-400 shrink-0" aria-hidden />
                Password
              </span>
              <input
                type="password"
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                className="input-touch w-full rounded-2xl border border-zinc-200 bg-zinc-50/80 px-4 outline-none transition placeholder:text-zinc-400 focus:border-emerald-500/60 focus:bg-white focus:ring-4 focus:ring-emerald-500/15"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
              />
              <span className="text-xs text-zinc-500">At least 6 characters.</span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="btn-touch w-full rounded-2xl bg-emerald-600 text-white text-base font-semibold shadow-md shadow-emerald-600/25 hover:bg-emerald-700 active:scale-[0.99] transition disabled:opacity-55 disabled:active:scale-100"
            >
              {loading ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in'}
            </button>

            <button
              type="button"
              className="btn-touch w-full rounded-2xl border border-zinc-200 bg-white text-zinc-800 text-base font-medium hover:bg-zinc-50 active:scale-[0.99] transition touch-manipulation"
              onClick={() => setIsSignUp(!isSignUp)}
            >
              {isSignUp ? 'Have an account? Sign in' : 'New here? Create account'}
            </button>
          </form>
        </main>

        <footer className="text-center text-xs text-zinc-500 pb-1 px-4">
          Secure session • Same trusted backend as Roam Driver
        </footer>
      </div>
    </div>
  );
}
