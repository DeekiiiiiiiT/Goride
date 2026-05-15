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
    <div className="min-h-[100dvh] relative overflow-hidden flex flex-col">
      {/* Vibrant emerald field */}
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-emerald-500 via-emerald-600 to-[#009e60]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{
          background:
            'radial-gradient(ellipse 120% 80% at 50% -20%, rgba(255,255,255,0.16), transparent 52%), radial-gradient(ellipse 70% 55% at 100% 100%, rgba(255,255,255,0.08), transparent 45%), radial-gradient(ellipse 60% 50% at 0% 90%, rgba(6,95,70,0.35), transparent 55%)',
        }}
        aria-hidden
      />

      <div className="relative flex flex-col flex-1 w-full max-w-md mx-auto safe-x safe-t safe-b px-5 sm:px-8 items-center">
        {/* Brand — centered */}
        <header className="w-full flex flex-col items-center text-center pt-8 pb-6 sm:pt-12 sm:pb-8">
          <div className="mb-6 flex h-[76px] w-[76px] items-center justify-center rounded-[22px] bg-white/20 backdrop-blur-md shadow-[0_12px_40px_-12px_rgba(0,0,0,0.25)] ring-2 ring-white/35">
            <Car className="w-[34px] h-[34px] text-white" strokeWidth={1.75} aria-hidden />
          </div>
          <h1 className="text-[2rem] sm:text-[2.25rem] font-semibold tracking-[-0.035em] text-white drop-shadow-sm leading-tight">
            Roam Rides
          </h1>
          <p className="mt-3 max-w-[18rem] mx-auto text-[15px] leading-relaxed text-white/85">
            Request a ride when you need one—quick sign-in and live trip updates.
          </p>
        </header>

        {/* Frosted glass sheet */}
        <main className="flex-1 flex flex-col justify-center w-full pb-6">
          <form
            onSubmit={onSubmit}
            className="w-full rounded-[1.75rem] px-8 pt-10 pb-9 sm:px-10 sm:pt-11 sm:pb-10 bg-white/[0.22] backdrop-blur-[28px] shadow-[0_24px_48px_-12px_rgba(6,78,59,0.45)] ring-[1.5px] ring-white/35"
          >
            <div className="mb-8 text-center px-1">
              <h2 className="text-[1.35rem] sm:text-xl font-semibold tracking-[-0.02em] text-white">
                {isSignUp ? 'Create your account' : 'Welcome back'}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-white/80 max-w-[17rem] mx-auto">
                {isSignUp
                  ? 'We’ll send receipts and trip updates to this email.'
                  : 'Use the email you ride with.'}
              </p>
            </div>

            <div className="space-y-5">
              {isSignUp && (
                <label className="flex flex-col items-center gap-2 w-full">
                  <span className="text-[13px] font-medium text-white/90 flex items-center justify-center gap-2 w-full">
                    <User className="w-[15px] h-[15px] text-white/70 shrink-0" aria-hidden />
                    Full name
                  </span>
                  <input
                    className="input-touch w-full rounded-[14px] border border-white/35 bg-white/85 px-4 text-zinc-900 placeholder:text-zinc-400 outline-none shadow-inner shadow-white/20 focus:bg-white focus:ring-[3px] focus:ring-white/50 focus:border-transparent transition"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jordan Lee"
                    autoComplete="name"
                    required={isSignUp}
                  />
                </label>
              )}

              <label className="flex flex-col items-center gap-2 w-full">
                <span className="text-[13px] font-medium text-white/90 flex items-center justify-center gap-2 w-full">
                  <Mail className="w-[15px] h-[15px] text-white/70 shrink-0" aria-hidden />
                  Email
                </span>
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  className="input-touch w-full rounded-[14px] border border-white/35 bg-white/85 px-4 text-zinc-900 placeholder:text-zinc-400 outline-none shadow-inner shadow-white/20 focus:bg-white focus:ring-[3px] focus:ring-white/50 focus:border-transparent transition"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </label>

              <label className="flex flex-col items-center gap-2 w-full">
                <span className="text-[13px] font-medium text-white/90 flex items-center justify-center gap-2 w-full">
                  <Lock className="w-[15px] h-[15px] text-white/70 shrink-0" aria-hidden />
                  Password
                </span>
                <input
                  type="password"
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  className="input-touch w-full rounded-[14px] border border-white/35 bg-white/85 px-4 text-zinc-900 placeholder:text-zinc-400 outline-none shadow-inner shadow-white/20 focus:bg-white focus:ring-[3px] focus:ring-white/50 focus:border-transparent transition"
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
              className="btn-touch mt-8 w-full rounded-[14px] bg-gradient-to-b from-emerald-400 to-emerald-600 text-[15px] font-semibold text-white shadow-[0_12px_28px_-8px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.25)] hover:from-emerald-300 hover:to-emerald-600 active:translate-y-[0.5px] transition disabled:opacity-50 disabled:active:translate-y-0"
            >
              {loading ? 'Please wait…' : isSignUp ? 'Continue' : 'Sign in'}
            </button>

            <button
              type="button"
              className="btn-touch mt-3 w-full rounded-[14px] border-[1.5px] border-white/45 bg-white/12 text-[15px] font-semibold text-white backdrop-blur-sm hover:bg-white/22 active:translate-y-[0.5px] transition touch-manipulation"
              onClick={() => setIsSignUp(!isSignUp)}
            >
              {isSignUp ? 'Already have an account? Sign in' : 'New here? Create account'}
            </button>
          </form>
        </main>

        <footer className="mt-auto text-center pb-4 w-full">
          <p className="text-[11px] font-medium tracking-wide text-white/55">
            © {year} Roam
          </p>
        </footer>
      </div>
    </div>
  );
}
