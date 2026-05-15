import React, { useState } from 'react';
import { User } from '@supabase/supabase-js';
import { Car, Loader2, AlertCircle, Mail, Lock, Eye, EyeOff, HelpCircle } from 'lucide-react';
import { isPassengerOnlyMetadataRole } from '@roam/auth-client';
import { supabase } from '../../utils/supabase/client';
import { ThemeToggleButton } from '../layout/ThemeToggleButton';
import { DriverPhoneAuthWizard } from './DriverPhoneAuthWizard';
import { DriverEmailSignupForm, GoogleSignupButton } from './DriverEmailSignupForm';

export function DriverLoginPage({ signedInNonDriver }: { signedInNonDriver?: User | null }) {
  const [mainView, setMainView] = useState<'login' | 'signup'>('login');
  const [signupSubView, setSignupSubView] = useState<'main' | 'email'>('main');
  const [loginMethod, setLoginMethod] = useState<'email' | 'phone'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const { error: signErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signErr) throw signErr;
    } catch (err: unknown) {
      console.error('Auth error:', err);
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  const rawRole = (signedInNonDriver?.user_metadata?.role as string | undefined)?.trim();

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-100 via-white to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      {signedInNonDriver && (
        <div className="mx-auto w-full max-w-lg px-4 pt-4">
          {isPassengerOnlyMetadataRole(rawRole) ? (
            <div className="rounded-xl border border-amber-200/90 bg-amber-50/95 px-4 py-3 text-sm text-amber-950 shadow-sm dark:border-amber-500/35 dark:bg-amber-950/35 dark:text-amber-50">
              <p>
                You are signed in as a <span className="font-semibold">rider</span>. Book trips on{' '}
                <a
                  href="https://roam-s.co/login"
                  className="font-semibold text-emerald-800 underline underline-offset-2 dark:text-emerald-300"
                >
                  Roam Rides
                </a>
                . Sign out if you need a driver account on this device.
              </p>
              <button
                type="button"
                className="mt-3 text-xs font-semibold text-amber-900/80 hover:text-amber-950 dark:text-amber-200/90"
                onClick={() => void supabase.auth.signOut()}
              >
                Sign out
              </button>
            </div>
          ) : rawRole ? (
            <div className="rounded-xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-800 shadow-sm dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100">
              <p>
                This account is not set up as a driver here (role: <span className="font-mono">{rawRole}</span>).
                Use the correct Roam product for your role, or sign out.
              </p>
              <button
                type="button"
                className="mt-3 text-xs font-semibold text-emerald-700 dark:text-emerald-400"
                onClick={() => void supabase.auth.signOut()}
              >
                Sign out
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-800 shadow-sm dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100">
              <p>You are signed in without a driver role yet. Finish onboarding or sign out to switch accounts.</p>
              <button
                type="button"
                className="mt-3 text-xs font-semibold text-emerald-700 dark:text-emerald-400"
                onClick={() => void supabase.auth.signOut()}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      )}
      <div className="flex items-start justify-between px-4 pt-4">
        <a
          href="mailto:support@roam.app"
          className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50/90 px-3 py-1.5 text-xs font-semibold text-emerald-800 shadow-sm dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-200"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          Contact support
        </a>
        <ThemeToggleButton />
      </div>

      <div className="-mt-4 flex flex-1 flex-col items-center justify-center px-4 pb-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/25">
              <Car className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Roam Driver</h1>
            <p className="mt-2 text-sm font-medium text-slate-600 dark:text-slate-300">
              {mainView === 'login'
                ? loginMethod === 'email'
                  ? 'Sign in to your account'
                  : 'Sign in with your phone'
                : 'Create your driver account'}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-xl backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-800/60">
            {error && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {mainView === 'signup' && signupSubView === 'email' && (
              <DriverEmailSignupForm
                onBack={() => {
                  setSignupSubView('main');
                  setError(null);
                }}
              />
            )}

            {mainView === 'signup' && signupSubView === 'main' && (
              <div className="space-y-4">
                <GoogleSignupButton onError={msg => setError(msg || null)} />
                <p className="text-center text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  By continuing with Google, you agree to our Terms of Service and Privacy Policy.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setSignupSubView('email');
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-slate-50 py-3 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900/50 dark:text-slate-100 dark:hover:bg-slate-800/80"
                >
                  <Mail className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  Continue with email
                </button>
                <div className="relative py-1">
                  <div className="absolute inset-0 flex items-center" aria-hidden>
                    <span className="w-full border-t border-slate-200 dark:border-slate-600" />
                  </div>
                  <div className="relative flex justify-center text-xs font-medium uppercase tracking-wide text-slate-400">
                    <span className="bg-white/90 px-2 dark:bg-slate-800/60">or phone</span>
                  </div>
                </div>
                <DriverPhoneAuthWizard
                  shouldCreateUser
                  requireTerms
                  onVerified={() => {
                    setError(null);
                  }}
                  onCancel={() => {
                    setMainView('login');
                    setSignupSubView('main');
                    setError(null);
                  }}
                />
              </div>
            )}

            {mainView === 'login' && loginMethod === 'email' && (
              <>
                <form onSubmit={e => void handleEmailLogin(e)} className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-200">Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
                      <input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="driver@email.com"
                        required
                        className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm font-medium text-slate-900 placeholder-slate-500 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 dark:border-slate-600 dark:bg-slate-900/70 dark:text-white dark:placeholder-slate-400"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-200">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        required
                        className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-10 text-sm font-medium text-slate-900 placeholder-slate-500 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 dark:border-slate-600 dark:bg-slate-900/70 dark:text-white dark:placeholder-slate-400"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition-all hover:from-emerald-500 hover:to-teal-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Signing in…
                      </>
                    ) : (
                      'Sign In'
                    )}
                  </button>
                </form>

                <div className="mt-4 text-center">
                  <button
                    type="button"
                    className="text-sm font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
                    onClick={() => {
                      setLoginMethod('phone');
                      setError(null);
                    }}
                  >
                    Sign in with phone instead
                  </button>
                </div>
              </>
            )}

            {mainView === 'login' && loginMethod === 'phone' && (
              <DriverPhoneAuthWizard
                shouldCreateUser={false}
                requireTerms={false}
                onVerified={() => setError(null)}
                onCancel={() => {
                  setLoginMethod('email');
                  setError(null);
                }}
              />
            )}
          </div>

          <div className="mt-6 border-t border-slate-200 pt-4 text-center dark:border-slate-700/60">
            {mainView === 'login' ? (
              <button
                type="button"
                onClick={() => {
                  setMainView('signup');
                  setSignupSubView('main');
                  setError(null);
                }}
                className="text-sm font-semibold text-slate-700 transition-colors hover:text-emerald-700 dark:text-slate-300 dark:hover:text-emerald-400"
              >
                Don&apos;t have an account? Sign up
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMainView('login');
                  setSignupSubView('main');
                  setError(null);
                }}
                className="text-sm font-semibold text-slate-700 transition-colors hover:text-emerald-700 dark:text-slate-300 dark:hover:text-emerald-400"
              >
                Already have an account? Sign in
              </button>
            )}
          </div>

          <p className="mt-6 text-center text-xs font-medium leading-relaxed text-slate-600 dark:text-slate-400">
            By continuing, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    </div>
  );
}
