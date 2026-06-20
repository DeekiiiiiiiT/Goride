import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { supabase, useForgotPassword } from '@roam/auth-client';
import { toast } from 'sonner';
import { AlertCircle, Car, Loader2, Mail, Eye, EyeOff } from 'lucide-react';
import { LegalPolicyLinks } from '@roam/ui';
import {
  PassengerEmailSignupForm,
  PassengerGoogleSignupButton,
} from '../components/auth/PassengerEmailSignupForm';
import { PassengerEmailConfirmScreen } from '../components/auth/PassengerEmailConfirmScreen';
import { PassengerPhoneAuthWizard } from '../components/auth/PassengerPhoneAuthWizard';

export default function LoginPage({ session }: { session: Session | null }) {
  const { t } = useTranslation('auth');
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('return');
  const safeReturn =
    returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/';

  const [mainView, setMainView] = useState<'login' | 'signup'>('login');
  const [signupSubView, setSignupSubView] = useState<'main' | 'email' | 'confirm-email'>('main');
  const [pendingConfirmEmail, setPendingConfirmEmail] = useState('');
  const [loginMethod, setLoginMethod] = useState<'email' | 'phone'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    forgotMode,
    setForgotMode,
    notice,
    setNotice,
    forgotLoading,
    sendResetEmail,
  } = useForgotPassword(supabase, 'rides', { signInHref: '/login' });

  if (session) return <Navigate to={safeReturn} replace />;

  const year = new Date().getFullYear();

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (forgotMode) {
      setError(null);
      setNotice(null);
      const err = await sendResetEmail(email);
      if (err) setError(err);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const { error: signErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signErr) throw signErr;
      toast.success(t('login.welcomeBack'));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('login.authFailed');
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] relative overflow-hidden flex flex-col">
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-emerald-500 via-emerald-600 to-[#009e60]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-55"
        style={{
          background:
            'radial-gradient(ellipse 120% 80% at 50% -20%, rgba(255,255,255,0.07), transparent 52%), radial-gradient(ellipse 70% 55% at 100% 100%, rgba(255,255,255,0.04), transparent 45%), radial-gradient(ellipse 60% 50% at 0% 90%, rgba(6,95,70,0.28), transparent 55%)',
        }}
        aria-hidden
      />

      <div className="relative flex flex-col flex-1 w-full max-w-md mx-auto safe-x safe-t safe-b px-5 sm:px-8 items-center">
        <header className="w-full flex flex-col items-center text-center pt-8 pb-6 sm:pt-10 sm:pb-7">
          <div className="mb-5 flex h-[76px] w-[76px] items-center justify-center rounded-[22px] bg-white/15 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.25)] ring-2 ring-white/30">
            <Car className="w-[34px] h-[34px] text-white" strokeWidth={1.75} aria-hidden />
          </div>
          <h1 className="text-[2rem] sm:text-[2.25rem] font-semibold tracking-[-0.035em] text-white drop-shadow-sm leading-tight">
            {t('login.brandTitle')}
          </h1>
          <p className="mt-3 max-w-[19rem] mx-auto text-[15px] leading-relaxed text-white/85">
            {mainView === 'login'
              ? loginMethod === 'email'
                ? t('login.subtitleEmailLogin')
                : t('login.subtitlePhoneLogin')
              : signupSubView === 'confirm-email'
                ? t('login.subtitleConfirmEmail')
                : t('login.subtitleSignup')}
          </p>
        </header>

        <main className="flex-1 flex flex-col justify-center w-full pb-5">
          <div className="w-full px-0 pt-1 pb-2">
            {error && (
              <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-300/50 bg-red-500/15 px-3 py-2.5 text-sm font-medium text-white">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {notice && (
              <div className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-300/50 bg-emerald-500/15 px-3 py-2.5 text-sm font-medium text-white">
                <span>{notice}</span>
              </div>
            )}

            {mainView === 'signup' && signupSubView === 'confirm-email' && (
              <PassengerEmailConfirmScreen
                email={pendingConfirmEmail}
                onBack={() => {
                  setSignupSubView('email');
                  setError(null);
                }}
                onSignIn={() => {
                  setMainView('login');
                  setSignupSubView('main');
                  setPendingConfirmEmail('');
                  setError(null);
                }}
              />
            )}

            {mainView === 'signup' && signupSubView === 'email' && (
              <PassengerEmailSignupForm
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

            {mainView === 'signup' && signupSubView === 'main' && (
              <div className="flex w-full flex-col gap-7">
                <PassengerGoogleSignupButton onError={msg => setError(msg || null)} />
                <p className="text-center text-xs leading-relaxed text-white/65">
                  <LegalPolicyLinks
                    variant="sentence"
                    order="terms-first"
                    beforePrivacy="By continuing with Google, you agree to our "
                    privacyClassName="underline underline-offset-2"
                    termsClassName="underline underline-offset-2"
                  />
                  .
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setSignupSubView('email');
                  }}
                  className="btn-touch flex w-full items-center justify-center gap-2 rounded-xl border-[1.5px] border-white/45 bg-transparent text-[15px] font-semibold text-white hover:bg-white/10 transition"
                >
                  <Mail className="h-5 w-5 text-emerald-200" />
                  {t('login.continueWithEmail')}
                </button>
                <div className="relative py-3">
                  <div className="absolute inset-0 flex items-center" aria-hidden>
                    <span className="w-full border-t border-white/25" />
                  </div>
                  <div className="relative flex justify-center text-[11px] font-semibold uppercase tracking-[0.12em] text-white/55">
                    <span className="rounded-full border border-white/20 bg-emerald-950/30 px-3 py-0.5">{t('login.orPhone')}</span>
                  </div>
                </div>
                <PassengerPhoneAuthWizard
                  shouldCreateUser
                  requireTerms
                  onVerified={() => {
                    setError(null);
                    toast.success(t('login.signedIn'));
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
                <PassengerGoogleSignupButton
                  variant="login"
                  onError={msg => setError(msg || null)}
                />
                <div className="relative py-4">
                  <div className="absolute inset-0 flex items-center" aria-hidden>
                    <span className="w-full border-t border-white/25" />
                  </div>
                  <div className="relative flex justify-center text-[11px] font-semibold uppercase tracking-[0.12em] text-white/55">
                    <span className="rounded-full border border-white/20 bg-emerald-950/30 px-3 py-0.5">
                      {t('login.orEmail')}
                    </span>
                  </div>
                </div>
                <form
                  onSubmit={e => void handleEmailLogin(e)}
                  className="flex w-full flex-col gap-6"
                >
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder={t('login.emailPlaceholder')}
                    required
                    autoComplete="email"
                    aria-label={t('login.emailAria')}
                    className="input-touch w-full rounded-xl border border-white/50 bg-white px-4 text-zinc-900 placeholder:text-zinc-400 outline-none focus:ring-[3px] focus:ring-white/50"
                  />

                  <div className="relative">
                    {!forgotMode ? (
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder={t('login.passwordPlaceholder')}
                      required
                      autoComplete="current-password"
                      aria-label={t('login.passwordAria')}
                      className="input-touch w-full rounded-xl border border-white/50 bg-white px-4 pr-11 text-zinc-900 placeholder:text-zinc-400 outline-none focus:ring-[3px] focus:ring-white/50"
                    />
                    ) : null}
                    {!forgotMode && (
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-800"
                      aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                    )}
                  </div>

                  <div className="flex justify-end">
                    {!forgotMode ? (
                      <button
                        type="button"
                        className="text-sm font-semibold text-emerald-200 hover:underline"
                        onClick={() => {
                          setForgotMode(true);
                          setError(null);
                          setNotice(null);
                        }}
                      >
                        Forgot password?
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="text-sm font-semibold text-emerald-200 hover:underline"
                        onClick={() => {
                          setForgotMode(false);
                          setError(null);
                        }}
                      >
                        Back to sign in
                      </button>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading || forgotLoading}
                    className="btn-touch w-full rounded-xl bg-gradient-to-b from-emerald-400 to-emerald-600 text-[15px] font-semibold text-white shadow-[0_12px_28px_-8px_rgba(0,0,0,0.35)] disabled:opacity-50"
                  >
                    {isLoading || forgotLoading ? (
                      <>
                        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                        {forgotMode ? 'Sending…' : t('login.signingIn')}
                      </>
                    ) : forgotMode ? (
                      'Send reset email'
                    ) : (
                      t('login.signIn')
                    )}
                  </button>
                </form>

                <div className="mt-6 text-center">
                  <button
                    type="button"
                    className="text-sm font-semibold text-emerald-200 hover:underline"
                    onClick={() => {
                      setLoginMethod('phone');
                      setError(null);
                    }}
                  >
                    {t('login.signInWithPhone')}
                  </button>
                </div>
              </>
            )}

            {mainView === 'login' && loginMethod === 'phone' && (
              <PassengerPhoneAuthWizard
                shouldCreateUser={false}
                requireTerms={false}
                onVerified={() => {
                  setError(null);
                  toast.success(t('login.welcomeBack'));
                }}
                onCancel={() => {
                  setLoginMethod('email');
                  setError(null);
                }}
              />
            )}
          </div>
        </main>

        <div className="mt-auto w-full text-center pb-4 space-y-3">
          {mainView === 'login' ? (
            <button
              type="button"
              onClick={() => {
                setMainView('signup');
                setSignupSubView('main');
                setPendingConfirmEmail('');
                setError(null);
              }}
              className="text-sm font-semibold text-white/90 hover:text-white"
            >
              {t('login.noAccount')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setMainView('login');
                setSignupSubView('main');
                setPendingConfirmEmail('');
                setError(null);
              }}
              className="text-sm font-semibold text-white/90 hover:text-white"
            >
              {t('login.hasAccount')}
            </button>
          )}
          <LegalPolicyLinks
            variant="sentence"
            order="terms-first"
            className="text-[11px] font-medium tracking-wide text-white/45"
            beforePrivacy={t('login.copyrightPrefix', { year })}
            privacyClassName="underline underline-offset-2 hover:text-white/70"
            termsClassName="underline underline-offset-2 hover:text-white/70"
          />
        </div>
      </div>
    </div>
  );
}
