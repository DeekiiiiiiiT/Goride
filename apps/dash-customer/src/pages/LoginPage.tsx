import React, { useState } from 'react';
import { useForgotPassword, GOOGLE_OAUTH_EMAIL_ONLY_SCOPES } from '@roam/auth-client';
import { toast } from 'sonner';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { PhoneInput, toE164JamaicaPhone } from '@/components/forms/PhoneInput';
import { ABOUT_LINKS } from '@/lib/aboutContent';
import { saveProfile } from '@/lib/accountContent';
import { supabase } from '@/lib/supabase';
import {
  clearDashCustomerOAuthIntent,
  DASH_CUSTOMER_OAUTH_INTENT_KEY,
  DASH_CUSTOMER_OAUTH_INTENT_LOGIN,
  DASH_CUSTOMER_OAUTH_INTENT_SIGNUP,
  getDashCustomerAuthRedirectUrl,
} from '@/lib/dashCustomerAuth';

type LoginPageProps = {
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
  onBack?: () => void;
  onSignInSuccess?: () => void;
  onSignUpSuccess?: () => void;
  initialSignUp?: boolean;
  fullScreen?: boolean;
};

function GoogleIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

export default function LoginPage({
  onNavigate,
  onBack,
  onSignInSuccess,
  onSignUpSuccess,
  initialSignUp = false,
  fullScreen = false,
}: LoginPageProps) {
  const [isSignUp, setIsSignUp] = useState(initialSignUp);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const {
    forgotMode,
    setForgotMode,
    notice,
    setNotice,
    forgotLoading,
    sendResetEmail,
  } = useForgotPassword('dash', { signInHref: '/' });

  const handleGoogleAuth = async () => {
    setOauthLoading(true);
    try {
      sessionStorage.setItem(
        DASH_CUSTOMER_OAUTH_INTENT_KEY,
        isSignUp ? DASH_CUSTOMER_OAUTH_INTENT_SIGNUP : DASH_CUSTOMER_OAUTH_INTENT_LOGIN,
      );
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: getDashCustomerAuthRedirectUrl(),
          scopes: GOOGLE_OAUTH_EMAIL_ONLY_SCOPES,
          queryParams: { prompt: 'select_account' },
        },
      });
      if (error) throw error;
    } catch (error) {
      clearDashCustomerOAuthIntent();
      toast.error(error instanceof Error ? error.message : 'Google sign-in failed');
      setOauthLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = (isSignUp ? signupEmail : identifier).trim();

    if (forgotMode) {
      if (!email.includes('@')) {
        toast.error('Enter a valid email address.');
        return;
      }
      setNotice(null);
      const err = await sendResetEmail(email);
      if (err) toast.error(err);
      return;
    }

    if (!email.includes('@')) {
      toast.error('Sign in with your email address.');
      return;
    }

    if (isSignUp && !termsAccepted) {
      toast.error('Please accept the Terms of Service and Privacy Policy.');
      return;
    }

    if (isSignUp && !phone.trim()) {
      toast.error('Please enter your phone number.');
      return;
    }

    setIsLoading(true);
    try {
      if (isSignUp) {
        const e164Phone = toE164JamaicaPhone(phone);
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { name, phone: e164Phone },
            emailRedirectTo: `${window.location.origin}/`,
          },
        });
        if (error) throw error;
        const [firstName, ...rest] = name.trim().split(' ');
        saveProfile({
          firstName: firstName || name,
          lastName: rest.join(' ') || '',
          email,
          phone: e164Phone,
        });
        toast.success('Account created! Check your email to verify.');
        onSignUpSuccess?.();
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success('Welcome back!');
        if (onSignInSuccess) {
          onSignInSuccess();
        } else {
          onNavigate('home');
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  const shellClass = fullScreen
    ? 'app-fullscreen-screen bg-surface text-on-surface antialiased selection:bg-primary-container selection:text-on-primary-container'
    : 'min-h-[calc(100dvh-65px)] bg-surface text-on-surface antialiased';

  return (
    <div className={shellClass}>
      <div className="h-48 w-full absolute top-0 left-0 -z-10 bg-gradient-to-b from-surface-container-high to-surface opacity-50 overflow-hidden pointer-events-none">
        <div
          className="w-full h-full bg-cover bg-center opacity-30 mix-blend-multiply"
          style={{ backgroundImage: "url('/images/login-hero.png')" }}
        />
      </div>

      <main className="flex-1 flex flex-col px-4 pt-20 pb-8 max-w-md w-full mx-auto relative z-10 min-h-0 overflow-y-auto scrollbar-hide">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="absolute top-4 left-2 w-10 h-10 rounded-full flex items-center justify-center text-on-surface hover:bg-surface-variant transition-colors"
            aria-label="Go back"
          >
            <MaterialIcon name="arrow_back" />
          </button>
        )}

        <header className="mb-8">
          <h1 className="text-[28px] leading-[34px] font-bold text-on-surface mb-2">
            {forgotMode ? 'Reset password' : isSignUp ? 'Create your account' : 'Welcome back'}
          </h1>
          <p className="text-base text-on-surface-variant">
            {forgotMode
              ? 'We will email you a link to reset your password.'
              : isSignUp
                ? 'Sign up to start ordering from your favorite restaurants.'
                : 'Sign in to continue your culinary journey.'}
          </p>
        </header>

        <form className="flex flex-col gap-6 flex-1" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-4">
            {isSignUp && !forgotMode && (
              <>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full name"
                  required
                  className="w-full bg-surface-container-high text-on-surface text-base rounded-lg px-4 py-4 border-2 border-transparent focus:bg-surface-container-lowest focus:border-primary focus:outline-none transition-all placeholder:text-on-surface-variant/60"
                />
                <PhoneInput value={phone} onChange={setPhone} required />
                <div className="flex items-center gap-4">
                  <div className="flex-1 h-px bg-surface-container-highest" />
                  <span className="text-sm text-on-surface-variant">or</span>
                  <div className="flex-1 h-px bg-surface-container-highest" />
                </div>
                <input
                  type="email"
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                  placeholder="Email address"
                  required
                  className="w-full bg-surface-container-high text-on-surface text-base rounded-lg px-4 py-4 border-2 border-transparent focus:bg-surface-container-lowest focus:border-primary focus:outline-none transition-all placeholder:text-on-surface-variant/60"
                />
              </>
            )}

            {!isSignUp && (
            <input
              id="identifier"
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="Email or phone number"
              required
              className="w-full bg-surface-container-high text-on-surface text-base rounded-lg px-4 py-4 border-2 border-transparent focus:bg-surface-container-lowest focus:border-primary focus:outline-none transition-all placeholder:text-on-surface-variant/60"
            />
            )}

            {!forgotMode && (
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  required
                  minLength={6}
                  className="w-full bg-surface-container-high text-on-surface text-base rounded-lg pl-4 pr-12 py-4 border-2 border-transparent focus:bg-surface-container-lowest focus:border-primary focus:outline-none transition-all placeholder:text-on-surface-variant/60"
                />
                <button
                  type="button"
                  aria-label="Toggle password visibility"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface transition-colors"
                >
                  <MaterialIcon name={showPassword ? 'visibility' : 'visibility_off'} className="text-[20px]" />
                </button>
              </div>
            )}

            {isSignUp && !forgotMode && (
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary"
                  required
                />
                <span className="text-body-sm text-on-surface-variant">
                  I agree to the{' '}
                  <a href={ABOUT_LINKS[0].href} target="_blank" rel="noopener noreferrer" className="text-primary font-semibold">
                    Terms of Service
                  </a>{' '}
                  and{' '}
                  <a href={ABOUT_LINKS[1].href} target="_blank" rel="noopener noreferrer" className="text-primary font-semibold">
                    Privacy Policy
                  </a>
                </span>
              </label>
            )}

            {!isSignUp && (
              <div className="flex justify-end">
                {!forgotMode ? (
                  <button
                    type="button"
                    onClick={() => {
                      setForgotMode(true);
                      setNotice(null);
                    }}
                    className="text-sm text-primary hover:text-primary-container transition-colors"
                  >
                    Forgot password?
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setForgotMode(false)}
                    className="text-sm text-primary hover:text-primary-container transition-colors"
                  >
                    Back to sign in
                  </button>
                )}
              </div>
            )}
          </div>

          {notice && (
            <p className="text-sm text-primary text-center" role="status">
              {notice}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading || forgotLoading}
            className="w-full bg-primary-container text-on-primary text-sm font-semibold tracking-wide py-4 rounded-lg shadow-sm hover:opacity-90 active:scale-[0.98] transition-all duration-200 flex items-center justify-center disabled:opacity-50"
          >
            {isLoading || forgotLoading
              ? 'Please wait…'
              : forgotMode
                ? 'Send reset email'
                : isSignUp
                  ? 'Continue'
                  : 'Sign In'}
          </button>

          {!forgotMode && (
            <>
              <div className="flex items-center gap-4">
                <div className="flex-1 h-px bg-surface-container-highest" />
                <span className="text-sm text-on-surface-variant">or</span>
                <div className="flex-1 h-px bg-surface-container-highest" />
              </div>

              <div className="flex flex-col gap-4">
                <button
                  type="button"
                  onClick={() => void handleGoogleAuth()}
                  disabled={oauthLoading}
                  className="w-full bg-surface-container-lowest border border-surface-container-highest text-on-surface text-sm font-semibold tracking-wide py-3.5 rounded-lg hover:bg-surface-container-low active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  <GoogleIcon />
                  Continue with Google
                </button>
                <button
                  type="button"
                  disabled
                  title="Coming soon"
                  className="w-full bg-surface-container-lowest border border-surface-container-highest text-on-surface-variant text-sm font-semibold tracking-wide py-3.5 rounded-lg flex items-center justify-center gap-3 opacity-60 cursor-not-allowed"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.15 2.95.93 3.78 2.04-3.18 1.9-2.65 6.33.6 7.61-.75 1.49-1.57 2.72-2.98 3.36zM12.03 7.25C11.75 4.09 14.39 1.45 17.51 1c.36 3.43-2.92 6.13-5.48 6.25z" />
                  </svg>
                  Continue with Apple
                </button>
              </div>
            </>
          )}
        </form>

        {!forgotMode && (
          <div className="mt-auto pt-6 text-center pb-safe">
            <p className="text-sm text-on-surface-variant">
              {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
              <button
                type="button"
                onClick={() => setIsSignUp((v) => !v)}
                className="text-primary text-sm font-semibold tracking-wide hover:text-primary-container transition-colors"
              >
                {isSignUp ? 'Sign in' : 'Sign up'}
              </button>
            </p>
            {!fullScreen && (
              <button
                type="button"
                onClick={() => onNavigate('home')}
                className="mt-4 text-sm text-on-surface-variant hover:text-on-surface"
              >
                Continue browsing as guest
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
