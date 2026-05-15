import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@roam/auth-client';
import { toast } from 'sonner';
import { Car, Lock, Mail, User } from 'lucide-react';

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

  const year = new Date().getFullYear();

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#f2f3f5] relative overflow-hidden">
      {/* Ambient layers */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 140% 90% at 50% -30%, rgba(16, 185, 129, 0.18), transparent 55%), radial-gradient(ellipse 80% 70% at 100% 80%, rgba(24, 24, 27, 0.045), transparent 50%), linear-gradient(180deg, #fafafa 0%, #f2f3f5 40%, #eef0f2 100%)',
        }}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/35 to-transparent" />

      <div className="relative flex flex-col flex-1 safe-x safe-t safe-b max-w-[420px] mx-auto w-full px-4 sm:px-6">
        {/* Brand */}
        <header className="text-center pt-6 pb-8 sm:pt-10 sm:pb-10">
          <div className="relative mx-auto mb-7 h-[72px] w-[72px]">
            <div
              className="absolute inset-0 rounded-[22px] bg-emerald-500 opacity-35 blur-xl scale-110"
              aria-hidden
            />
            <div className="relative flex h-full w-full items-center justify-center rounded-[22px] bg-gradient-to-br from-emerald-400 via-emerald-600 to-emerald-700 text-white shadow-[0_18px_40px_-12px_rgba(5,150,105,0.55),inset_0_1px_0_rgba(255,255,255,0.22)] ring-1 ring-white/25">
              <Car className="w-[34px] h-[34px]" strokeWidth={1.75} aria-hidden />
            </div>
          </div>

          <h1 className="text-[2rem] sm:text-[2.125rem] font-semibold tracking-[-0.035em] text-zinc-950 leading-[1.1]">
            Roam Rides
          </h1>
          <p className="mt-4 max-w-[17.5rem] mx-auto text-[15px] leading-[1.55] text-zinc-500">
            Request a car when you need one—simple sign-in, live updates on your trip.
          </p>
        </header>

        {/* Form */}
        <main className="flex-1 flex flex-col justify-center pb-8">
          <form
            onSubmit={onSubmit}
            className="rounded-[1.75rem] bg-white/92 backdrop-blur-sm px-5 pt-7 pb-6 sm:px-7 sm:pt-8 sm:pb-7 shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_24px_48px_-24px_rgba(24,24,27,0.25),0_12px_24px_-16px_rgba(24,24,27,0.08)] ring-1 ring-zinc-900/[0.06]"
          >
            <div className="mb-6">
              <h2 className="text-xl font-semibold tracking-[-0.02em] text-zinc-950">
                {isSignUp ? 'Create your account' : 'Welcome back'}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">
                {isSignUp
                  ? 'We’ll use this email for receipts and ride updates.'
                  : 'Sign in with the email you use for rides.'}
              </p>
            </div>

            <div className="space-y-4">
              {isSignUp && (
                <label className="block space-y-2">
                  <span className="text-[13px] font-medium text-zinc-700 flex items-center gap-2">
                    <User className="w-[15px] h-[15px] text-zinc-400 shrink-0" aria-hidden />
                    Full name
                  </span>
                  <input
                    className="input-touch w-full rounded-[14px] border border-zinc-200/95 bg-zinc-50/40 px-4 text-zinc-900 placeholder:text-zinc-400 outline-none transition shadow-[0_1px_2px_rgba(24,24,27,0.04)] focus:border-emerald-500/70 focus:bg-white focus:shadow-[0_0_0_4px_rgba(16,185,129,0.12)]"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jordan Lee"
                    autoComplete="name"
                    required={isSignUp}
                  />
                </label>
              )}

              <label className="block space-y-2">
                <span className="text-[13px] font-medium text-zinc-700 flex items-center gap-2">
                  <Mail className="w-[15px] h-[15px] text-zinc-400 shrink-0" aria-hidden />
                  Email
                </span>
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  className="input-touch w-full rounded-[14px] border border-zinc-200/95 bg-zinc-50/40 px-4 text-zinc-900 placeholder:text-zinc-400 outline-none transition shadow-[0_1px_2px_rgba(24,24,27,0.04)] focus:border-emerald-500/70 focus:bg-white focus:shadow-[0_0_0_4px_rgba(16,185,129,0.12)]"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </label>

              <label className="block space-y-2">
                <span className="text-[13px] font-medium text-zinc-700 flex items-center gap-2">
                  <Lock className="w-[15px] h-[15px] text-zinc-400 shrink-0" aria-hidden />
                  Password
                </span>
                <input
                  type="password"
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  className="input-touch w-full rounded-[14px] border border-zinc-200/95 bg-zinc-50/40 px-4 text-zinc-900 placeholder:text-zinc-400 outline-none transition shadow-[0_1px_2px_rgba(24,24,27,0.04)] focus:border-emerald-500/70 focus:bg-white focus:shadow-[0_0_0_4px_rgba(16,185,129,0.12)]"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  required
                  minLength={6}
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-touch mt-6 w-full rounded-[14px] bg-gradient-to-b from-emerald-500 to-emerald-600 text-[15px] font-semibold text-white shadow-[0_10px_24px_-8px_rgba(5,150,105,0.65),inset_0_1px_0_rgba(255,255,255,0.2)] hover:from-emerald-500 hover:to-emerald-700 active:translate-y-[0.5px] transition disabled:opacity-50 disabled:active:translate-y-0"
            >
              {loading ? 'Please wait…' : isSignUp ? 'Continue' : 'Sign in'}
            </button>

            <button
              type="button"
              className="btn-touch mt-3 w-full rounded-[14px] border border-zinc-200/90 bg-white text-[15px] font-semibold text-zinc-800 shadow-[0_1px_2px_rgba(24,24,27,0.05)] hover:bg-zinc-50 active:translate-y-[0.5px] transition touch-manipulation"
              onClick={() => setIsSignUp(!isSignUp)}
            >
              {isSignUp ? 'Already have an account? Sign in' : 'New here? Create account'}
            </button>
          </form>
        </main>

        <footer className="mt-auto text-center pb-4">
          <p className="text-[11px] font-medium tracking-wide text-zinc-400">
            © {year} Roam
          </p>
        </footer>
      </div>
    </div>
  );
}
