import React, { useState } from 'react';
import { AlertCircle, Eye, EyeOff, Loader2, Lock, Mail, Truck } from 'lucide-react';
import { LegalPolicyLinks } from '@roam/ui';
import { supabase } from '../../utils/supabase/client';
import { HaulerEmailConfirmScreen } from './HaulerEmailConfirmScreen';
import { HaulerEmailSignupForm, HaulerGoogleSignupButton } from './HaulerEmailSignupForm';

type AuthView = 'login' | 'signup';
type SignupSubView = 'main' | 'email' | 'confirm-email';

const inputClass =
  'w-full rounded-lg bg-slate-900 border border-slate-700 pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40';

export function HaulerLoginPage() {
  const [view, setView] = useState<AuthView>('login');
  const [signupSubView, setSignupSubView] = useState<SignupSubView>('main');
  const [pendingConfirmEmail, setPendingConfirmEmail] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subtitle =
    view === 'login'
      ? 'Sign in to accept freight jobs'
      : signupSubView === 'confirm-email'
        ? 'Check your inbox for a confirmation link'
        : signupSubView === 'email'
          ? 'Create your hauler account'
          : 'Join Roam Haul to accept freight jobs';

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { error: signErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signErr) throw signErr;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  const switchToLogin = () => {
    setView('login');
    setSignupSubView('main');
    setPendingConfirmEmail('');
    setError(null);
  };

  const switchToSignup = () => {
    setView('signup');
    setSignupSubView('main');
    setError(null);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 p-6 text-slate-100">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800">
            <Truck className="h-7 w-7 text-amber-400" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Roam Haul</h1>
          <p className="text-sm text-slate-400">{subtitle}</p>
        </div>

        {error && (
          <div className="flex gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {view === 'signup' && signupSubView === 'confirm-email' && (
          <HaulerEmailConfirmScreen
            email={pendingConfirmEmail}
            onBack={() => {
              setSignupSubView('email');
              setError(null);
            }}
            onSignIn={switchToLogin}
          />
        )}

        {view === 'signup' && signupSubView === 'email' && (
          <HaulerEmailSignupForm
            onBack={() => {
              setSignupSubView('main');
              setError(null);
            }}
            onConfirmationRequired={confirmedEmail => {
              setPendingConfirmEmail(confirmedEmail);
              setSignupSubView('confirm-email');
              setError(null);
            }}
          />
        )}

        {view === 'signup' && signupSubView === 'main' && (
          <div className="space-y-4">
            <HaulerGoogleSignupButton onError={msg => setError(msg || null)} />
            <LegalPolicyLinks
              variant="sentence"
              order="terms-first"
              className="text-center text-xs text-slate-500"
              beforePrivacy="By continuing with Google, you agree to our "
              privacyClassName="text-amber-400 underline underline-offset-2"
              termsClassName="text-amber-400 underline underline-offset-2"
            />
            .
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-800" aria-hidden />
              <span className="text-xs text-slate-500">or email</span>
              <div className="h-px flex-1 bg-slate-800" aria-hidden />
            </div>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setSignupSubView('email');
              }}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2.5 text-sm font-semibold text-slate-100 hover:bg-slate-800"
            >
              Continue with email
            </button>
            <button type="button" onClick={switchToLogin} className="w-full text-sm text-slate-400 hover:text-slate-200">
              Already have an account? Sign in
            </button>
          </div>
        )}

        {view === 'login' && (
          <div className="space-y-4">
            <HaulerGoogleSignupButton variant="login" onError={msg => setError(msg || null)} />
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-800" aria-hidden />
              <span className="text-xs text-slate-500">or email</span>
              <div className="h-px flex-1 bg-slate-800" aria-hidden />
            </div>
            <form onSubmit={e => void handleEmailLogin(e)} className="space-y-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Email</span>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Password</span>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className={`${inputClass} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </label>
              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Sign in
              </button>
            </form>
            <button type="button" onClick={switchToSignup} className="w-full text-sm text-slate-400 hover:text-slate-200">
              Don&apos;t have an account? Sign up
            </button>
          </div>
        )}

        <LegalPolicyLinks
          variant="sentence"
          order="terms-first"
          className="text-center text-xs text-slate-500"
          beforePrivacy="By continuing, you agree to our "
          privacyClassName="text-amber-400 underline underline-offset-2"
          termsClassName="text-amber-400 underline underline-offset-2"
        />
      </div>
    </div>
  );
}
