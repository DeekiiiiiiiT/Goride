import { useState } from 'react';
import { supabase, useForgotPassword } from '@roam/auth-client';
import { toast } from 'sonner';
import { MaterialIcon } from '../signup/components/MaterialIcon';
import { useVisualViewport } from '../hooks/useVisualViewport';

interface LoginPageProps {
  onSuccess: () => void;
  initialSignUp?: boolean;
  initialEmail?: string;
  onBack?: () => void;
  onApply?: () => void;
}

const inputClass =
  'input-touch h-12 w-full rounded-md border border-outline-variant bg-transparent px-sm text-body-lg text-on-surface placeholder:text-on-surface-variant outline-none transition-colors partner-field focus:border-primary-container focus:ring-1 focus:ring-primary-container';

export default function LoginPage({
  onSuccess,
  initialSignUp = false,
  initialEmail = '',
  onBack,
  onApply,
}: LoginPageProps) {
  const [isSignUp, setIsSignUp] = useState(initialSignUp);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const keyboardInset = useVisualViewport();
  const {
    forgotMode,
    setForgotMode,
    notice,
    setNotice,
    forgotLoading,
    sendResetEmail,
  } = useForgotPassword('partner', { signInHref: '/' });

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
            emailRedirectTo: `${window.location.origin}/`,
          },
        });
        if (error) throw error;
        toast.success('Account created! Check your email to verify.');
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
    : isSignUp
      ? 'Create your account'
      : 'Welcome back';

  const subtitle = forgotMode
    ? "We'll email you a link to reset your password."
    : isSignUp
      ? 'Complete registration to submit your application.'
      : 'Sign in to manage your Roam Dash store.';

  const submitLabel = isLoading || forgotLoading
    ? 'Please wait...'
    : forgotMode
      ? 'Send reset email'
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
        <div className="mb-lg flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-outline-variant bg-surface shadow-sm">
          <img
            alt="Roam Dash Partner Logo"
            className="h-full w-full object-cover"
            src="/assets/logo.png"
          />
        </div>

        <div className="mb-lg w-full text-center">
          <h1 className="mb-xs text-headline-lg-mobile font-bold text-on-surface md:text-headline-lg">
            {title}
          </h1>
          <p className="text-body-sm text-on-surface-variant">{subtitle}</p>
        </div>

        <div className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest p-md shadow-sm transition-shadow duration-300 hover:shadow-md">
          <form className="flex flex-col gap-sm" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-base">
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
            </div>

            {!forgotMode && (
              <div className="mt-xs flex flex-col gap-base">
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
              <div className="mt-xs flex items-center gap-xs">
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
              disabled={isLoading || forgotLoading}
              className="mt-md flex h-12 w-full items-center justify-center rounded-md bg-primary-container text-label-md font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary focus:outline-none focus:ring-2 focus:ring-primary-container focus:ring-offset-2 focus:ring-offset-background active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading || forgotLoading ? (
                <span className="partner-spinner h-5 w-5 border-2" />
              ) : (
                submitLabel
              )}
            </button>
          </form>
        </div>

        <div className="mt-lg text-center">
          {isSignUp ? (
            <p className="text-body-sm text-on-surface-variant">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => setIsSignUp(false)}
                className="ml-xs text-label-md font-semibold text-primary transition-colors hover:text-primary-fixed-dim"
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
                className="ml-xs text-label-md font-semibold text-primary transition-colors hover:text-primary-fixed-dim"
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
