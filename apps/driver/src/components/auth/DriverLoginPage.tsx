import React, { useState } from 'react';
import { AlertCircle, Loader2, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { LegalPolicyLinks } from '@roam/ui';
import { useForgotPassword } from '@roam/auth-client';
import { supabase } from '../../utils/supabase/client';
import { ENABLE_PHONE_AUTH } from '../../utils/driverAuthSignup';
import { DriverPhoneAuthWizard } from './DriverPhoneAuthWizard';
import { DriverEmailSignupForm, GoogleSignupButton } from './DriverEmailSignupForm';
import { DriverEmailConfirmScreen } from './DriverEmailConfirmScreen';
import { DriverSplashScreen } from '../layout/DriverSplashScreen';

type AuthView = 'welcome' | 'login' | 'signup';

export function DriverLoginPage() {
  const [view, setView] = useState<AuthView>('welcome');
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
  } = useForgotPassword(supabase, 'driver', { signInHref: '/' });

  const resetToWelcome = () => {
    setView('welcome');
    setSignupSubView('main');
    setPendingConfirmEmail('');
    setLoginMethod('email');
    setError(null);
  };

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
    } catch (err: unknown) {
      console.error('Auth error:', err);
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  if (view === 'welcome') {
    return (
      <DriverSplashScreen
        onSignIn={() => {
          setView('login');
          setError(null);
        }}
        onBecomeDriver={() => {
          setView('signup');
          setSignupSubView('main');
          setError(null);
        }}
      />
    );
  }

  const panelTitle =
    view === 'login'
      ? ENABLE_PHONE_AUTH && loginMethod === 'phone'
        ? 'Sign in with phone'
        : 'Sign In to Dashboard'
      : signupSubView === 'confirm-email'
        ? 'Confirm your email'
        : signupSubView === 'email'
          ? 'Create your account'
          : 'Become a Driver';

  const panelSubtext =
    view === 'login'
      ? ENABLE_PHONE_AUTH && loginMethod === 'phone'
        ? 'Enter the code sent to your phone.'
        : ENABLE_PHONE_AUTH
          ? 'Sign in with Google, email, or phone.'
          : 'Sign in with Google or email.'
      : signupSubView === 'confirm-email'
        ? 'Check your inbox for a confirmation link.'
        : null;

  return (
    <DriverSplashScreen
      panel={
        <>
          <button type="button" className="driver-splash__back-btn" onClick={resetToWelcome}>
            ← Back
          </button>

          <div className="driver-splash__value-prop">
            <h2 className="driver-splash__headline">{panelTitle}</h2>
            {panelSubtext && <p className="driver-splash__subtext">{panelSubtext}</p>}
          </div>

          {error && (
            <div className="driver-splash__error">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {notice && (
            <div className="driver-splash__error" style={{ color: '#6ee7b7', borderColor: 'rgba(16,185,129,0.3)' }}>
              <span>{notice}</span>
            </div>
          )}

          {view === 'signup' && signupSubView === 'confirm-email' && (
            <DriverEmailConfirmScreen
              email={pendingConfirmEmail}
              onBack={() => {
                setSignupSubView('email');
                setError(null);
              }}
              onSignIn={() => {
                setView('login');
                setSignupSubView('main');
                setPendingConfirmEmail('');
                setError(null);
              }}
            />
          )}

          {view === 'signup' && signupSubView === 'email' && (
            <DriverEmailSignupForm
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
            <div className="driver-splash__auth-form">
              <GoogleSignupButton onError={msg => setError(msg || null)} />
              <LegalPolicyLinks
                variant="sentence"
                order="terms-first"
                className="driver-splash__terms"
                beforePrivacy="By continuing with Google, you agree to our "
                privacyClassName="underline underline-offset-2"
                termsClassName="underline underline-offset-2"
              />
              .
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setSignupSubView('email');
                }}
                className="driver-splash__btn-secondary"
              >
                Continue with email
              </button>
              {ENABLE_PHONE_AUTH && (
                <>
                  <div className="driver-splash__or-row">
                    <div className="driver-splash__or-line" aria-hidden />
                    <span className="driver-splash__or-text">or phone</span>
                    <div className="driver-splash__or-line" aria-hidden />
                  </div>
                  <DriverPhoneAuthWizard
                    shouldCreateUser
                    requireTerms
                    onVerified={() => setError(null)}
                    onCancel={resetToWelcome}
                  />
                </>
              )}
            </div>
          )}

          {view === 'login' && loginMethod === 'email' && (
            <div className="driver-splash__auth-form">
              <GoogleSignupButton variant="login" onError={msg => setError(msg || null)} />
              <div className="driver-splash__or-row">
                <div className="driver-splash__or-line" aria-hidden />
                <span className="driver-splash__or-text">or email</span>
                <div className="driver-splash__or-line" aria-hidden />
              </div>
              <form onSubmit={e => void handleEmailLogin(e)} className="driver-splash__auth-form">
                <div className="driver-splash__field">
                  <label htmlFor="driver-email">Email</label>
                  <div className="driver-splash__input-wrap">
                    <Mail className="driver-splash__input-icon" />
                    <input
                      id="driver-email"
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="driver@email.com"
                      required
                      className="driver-splash__input"
                    />
                  </div>
                </div>

                <div className="driver-splash__field">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="driver-password">Password</label>
                    {!forgotMode ? (
                      <button
                        type="button"
                        className="driver-splash__link-btn"
                        style={{ fontSize: '0.75rem', margin: 0 }}
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
                        className="driver-splash__link-btn"
                        style={{ fontSize: '0.75rem', margin: 0 }}
                        onClick={() => {
                          setForgotMode(false);
                          setError(null);
                        }}
                      >
                        Back to sign in
                      </button>
                    )}
                  </div>
                  {!forgotMode && (
                  <div className="driver-splash__input-wrap">
                    <Lock className="driver-splash__input-icon" />
                    <input
                      id="driver-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      required
                      className="driver-splash__input driver-splash__input--password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="driver-splash__toggle-password"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  )}
                </div>

                <button type="submit" disabled={isLoading || forgotLoading} className="driver-splash__btn-primary">
                  {isLoading || forgotLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {forgotMode ? 'Sending…' : 'Signing in…'}
                    </>
                  ) : forgotMode ? (
                    'Send reset email'
                  ) : (
                    'Sign In'
                  )}
                </button>
              </form>

              {ENABLE_PHONE_AUTH && (
                <button
                  type="button"
                  className="driver-splash__link-btn"
                  onClick={() => {
                    setLoginMethod('phone');
                    setError(null);
                  }}
                >
                  Sign in with phone instead
                </button>
              )}
            </div>
          )}

          {ENABLE_PHONE_AUTH && view === 'login' && loginMethod === 'phone' && (
            <div className="driver-splash__auth-form">
              <DriverPhoneAuthWizard
                shouldCreateUser={false}
                requireTerms={false}
                onVerified={() => setError(null)}
                onCancel={() => {
                  setLoginMethod('email');
                  setError(null);
                }}
              />
            </div>
          )}

          {view === 'login' && (
            <button
              type="button"
              className="driver-splash__link-btn"
              onClick={() => {
                setView('signup');
                setSignupSubView('main');
                setError(null);
              }}
            >
              Don&apos;t have an account? Sign up
            </button>
          )}

          {view === 'signup' && signupSubView === 'main' && (
            <button
              type="button"
              className="driver-splash__link-btn"
              onClick={() => {
                setView('login');
                setSignupSubView('main');
                setError(null);
              }}
            >
              Already have an account? Sign in
            </button>
          )}

          <LegalPolicyLinks
            variant="sentence"
            order="terms-first"
            className="driver-splash__terms"
            beforePrivacy="By continuing, you agree to our "
            privacyClassName="underline underline-offset-2"
            termsClassName="underline underline-offset-2"
          />
        </>
      }
    />
  );
}
