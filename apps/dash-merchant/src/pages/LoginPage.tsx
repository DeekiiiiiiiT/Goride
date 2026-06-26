import { useState } from 'react';
import { GOOGLE_OAUTH_EMAIL_ONLY_SCOPES, useForgotPassword } from '@roam/auth-client';
import { supabase } from '../lib/partner-supabase';
import { toast } from 'sonner';
import { MaterialIcon } from '../signup/components/MaterialIcon';
import { useVisualViewport } from '../hooks/useVisualViewport';
import {
  clearPartnerOAuthIntent,
  getPartnerAuthRedirectUrl,
  PARTNER_OAUTH_INTENT_KEY,
  PARTNER_OAUTH_INTENT_LOGIN,
  PARTNER_OAUTH_INTENT_SIGNUP,
} from '../lib/partnerAuth';

interface LoginPageProps {
  onSuccess: () => void;
  initialSignUp?: boolean;
  initialEmail?: string;
  inviteMode?: boolean;
  onBack?: () => void;
  onApply?: () => void;
}

const inputClass =
  'input-touch h-12 w-full rounded-md border border-outline-variant bg-transparent px-inset-sm text-body-lg text-on-surface placeholder:text-on-surface-variant outline-none transition-colors partner-field focus:border-primary-container focus:ring-1 focus:ring-primary-container';

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
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
  onSuccess,
  initialSignUp = false,
  initialEmail = '',
  inviteMode = false,
  onBack,
  onApply,
}: LoginPageProps) {
  const [isSignUp, setIsSignUp] = useState(inviteMode ? false : initialSignUp);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const keyboardInset = useVisualViewport();
  const {
    forgotMode,
    setForgotMode,
    notice,
    setNotice,
    forgotLoading,
    sendResetEmail,
  } = useForgotPassword('partner', { signInHref: '/' });

  const handleGoogleAuth = async () => {
    setOauthLoading(true);
    try {
      sessionStorage.setItem(
        PARTNER_OAUTH_INTENT_KEY,
        isSignUp ? PARTNER_OAUTH_INTENT_SIGNUP : PARTNER_OAUTH_INTENT_LOGIN,
      );
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: getPartnerAuthRedirectUrl(),
          scopes: GOOGLE_OAUTH_EMAIL_ONLY_SCOPES,
          queryParams: { prompt: 'select_account' },
        },
      });
      if (error) throw error;
    } catch (error) {
      clearPartnerOAuthIntent();
      toast.error(
        error instanceof Error
          ? error.message
          : isSignUp
            ? 'Google sign-up failed.'
            : 'Google sign-in failed.',
      );
      setOauthLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (forgotMode) {
      setNotice(null);
      const err = await sendResetEmail(email);
      if (err) toast.error(err);
      return;
    }

    setIsLoading(true);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: inviteMode
              ? `${window.location.origin}${window.location.pathname}`
              : `${window.location.origin}/`,
          },
        });
        if (error) throw error;
        toast.success(
          inviteMode
            ? 'Account created! Joining your team…'
            : 'Account created! Check your email to verify.',
        );
        onSuccess();
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success('Welcome back!');
        onSuccess();
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Authentication failed';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const title = forgotMode
    ? 'Reset your password'
    : inviteMode
      ? isSignUp
        ? 'Create your account'
        : 'Join your team'
      : isSignUp
        ? 'Create your account'
        : 'Welcome back';

  const subtitle = forgotMode
    ? "We'll email you a link to reset your password."
    : inviteMode
      ? isSignUp
        ? 'Use the email from your invite. No restaurant setup required.'
        : 'Sign in with the email that received the team invite.'
      : isSignUp
        ? 'Complete registration to submit your application.'
        : 'Sign in to manage your Roam Dash store.';

  const submitLabel = isLoading || forgotLoading
    ? 'Please wait...'
    : forgotMode
      ? 'Send reset email'
      : inviteMode && isSignUp
        ? 'Create account & join'
        : isSignUp
          ? 'Create Account'
          : 'Sign In';

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[#fafafa] p-margin-mobile antialiased text-on-background safe-t md:p-margin-tablet">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="absolute left-margin-mobile top-6 flex items-center gap-1 text-sm font-medium text-on-surface-variant transition-colors hover:text-on-surface safe-t md:left-margin-tablet"
        >
          <MaterialIcon name="arrow_back" size={20} />
          Back
        </button>
      )}

      <main
        className="flex w-full max-w-[440px] flex-col items-center"
        style={{ paddingBottom: keyboardInset > 0 ? keyboardInset : undefined }}
      >
        <div className="mb-inset-lg flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-outline-variant bg-surface shadow-sm">
          <img
            alt="Roam Dash Partner Logo"
            className="h-full w-full object-cover"
            src="/assets/logo.png"
          />
        </div>

        <div className="mb-inset-lg w-full text-center">
          <h1 className="mb-inset-xs text-headline-lg-mobile font-bold text-on-surface md:text-headline-lg">
            {title}
          </h1>
          <p className="text-body-sm text-on-surface-variant">{subtitle}</p>
        </div>

        <div className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest p-inset-md shadow-sm transition-shadow duration-300 hover:shadow-md">
          <form className="flex flex-col gap-inset-sm" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-inset-base">
              <label className="text-label-md font-semibold text-on-surface" htmlFor="email">
                Email or phone number
              </label>
              <input
                id="email"
                name="email"
                type="text"
                autoComplete="username"
                className={inputClass}
                placeholder="Enter your email or phone"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              {inviteMode && (
                <p className="text-body-sm text-on-surface-variant">
                  Use the same email address that received the team invite.
                </p>
              )}
            </div>

            {!forgotMode && (
              <div className="mt-inset-xs flex flex-col gap-inset-base">
                <div className="flex w-full items-center justify-between">
                  <label className="text-label-md font-semibold text-on-surface" htmlFor="password">
                    Password
                  </label>
                  {!isSignUp && (
                    <button
                      type="button"
                      className="text-label-md font-semibold text-primary transition-colors hover:text-primary-fixed-dim"
                      onClick={() => {
                        setForgotMode(true);
                        setNotice(null);
                      }}
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={isSignUp ? 'new-password' : 'current-password'}
                    className={`${inputClass} pr-12`}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    aria-label="Toggle password visibility"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute right-0 top-0 flex h-12 w-12 items-center justify-center text-on-surface-variant transition-colors hover:text-on-surface focus:outline-none"
                  >
                    <MaterialIcon name={showPassword ? 'visibility_off' : 'visibility'} />
                  </button>
                </div>
              </div>
            )}

            {forgotMode && (
              <button
                type="button"
                className="self-start text-label-md font-semibold text-primary transition-colors hover:text-primary-fixed-dim"
                onClick={() => setForgotMode(false)}
              >
                Back to sign in
              </button>
            )}

            {!forgotMode && !isSignUp && (
              <div className="mt-inset-xs flex items-center gap-inset-xs">
                <input
                  id="remember"
                  name="remember"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 cursor-pointer rounded border-outline-variant bg-transparent text-primary-container focus:ring-primary-container"
                />
                <label
                  className="cursor-pointer text-body-sm text-on-surface-variant"
                  htmlFor="remember"
                >
                  Keep me signed in
                </label>
              </div>
            )}

            {notice && (
              <p className="text-center text-body-sm text-primary" role="status">
                {notice}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading || forgotLoading || oauthLoading}
              className="mt-inset-md flex h-12 w-full items-center justify-center rounded-md bg-primary-container text-label-md font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary focus:outline-none focus:ring-2 focus:ring-primary-container focus:ring-offset-2 focus:ring-offset-background active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading || forgotLoading ? (
                <span className="partner-spinner h-5 w-5 border-2" />
              ) : (
                submitLabel
              )}
            </button>

            {!forgotMode && (
              <>
                <div className="mt-inset-md flex items-center gap-inset-sm">
                  <div className="h-px flex-1 bg-outline-variant" />
                  <span className="text-body-sm text-on-surface-variant">or</span>
                  <div className="h-px flex-1 bg-outline-variant" />
                </div>

                <button
                  type="button"
                  onClick={() => void handleGoogleAuth()}
                  disabled={oauthLoading || isLoading}
                  className="flex h-12 w-full items-center justify-center gap-inset-xs rounded-md border border-outline-variant bg-surface text-label-md font-semibold text-on-surface shadow-sm transition-colors hover:bg-surface-container-low focus:outline-none focus:ring-2 focus:ring-primary-container focus:ring-offset-2 focus:ring-offset-background active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {oauthLoading ? (
                    <span className="partner-spinner h-5 w-5 border-2" />
                  ) : (
                    <GoogleIcon />
                  )}
                  {isSignUp ? 'Continue with Google' : 'Sign in with Google'}
                </button>
              </>
            )}
          </form>
        </div>

        <div className="mt-inset-lg text-center">
          {inviteMode ? (
            !forgotMode && (
              <p className="text-body-sm text-on-surface-variant">
                {isSignUp ? (
                  <>
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={() => setIsSignUp(false)}
                      className="ml-inset-xs text-label-md font-semibold text-primary transition-colors hover:text-primary-fixed-dim"
                    >
                      Sign in
                    </button>
                  </>
                ) : (
                  <>
                    First time here?{' '}
                    <button
                      type="button"
                      onClick={() => setIsSignUp(true)}
                      className="ml-inset-xs text-label-md font-semibold text-primary transition-colors hover:text-primary-fixed-dim"
                    >
                      Create account
                    </button>
                  </>
                )}
              </p>
            )
          ) : isSignUp ? (
            <p className="text-body-sm text-on-surface-variant">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => setIsSignUp(false)}
                className="ml-inset-xs text-label-md font-semibold text-primary transition-colors hover:text-primary-fixed-dim"
              >
                Sign in
              </button>
            </p>
          ) : (
            <p className="text-body-sm text-on-surface-variant">
              New to Roam Dash?{' '}
              <button
                type="button"
                onClick={onApply ?? onBack}
                className="ml-inset-xs text-label-md font-semibold text-primary transition-colors hover:text-primary-fixed-dim"
              >
                Apply to become a partner
              </button>
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
