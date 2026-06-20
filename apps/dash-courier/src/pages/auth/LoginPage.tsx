import React, { useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { CourierGoogleAuthButton } from '@/components/auth/CourierGoogleAuthButton';

type LoginPageProps = {
  onBack: () => void;
  onSignIn: () => void;
  onSignUp: () => void;
};

export function LoginPage({ onBack, onSignIn, onSignUp }: LoginPageProps) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSignIn();
  };

  return (
    <div className="bg-background text-on-background min-h-full flex flex-col antialiased">
      <main className="flex-grow flex flex-col px-[var(--spacing-edge)] pt-8 pb-safe md:justify-center md:items-center">
        <div className="w-full max-w-md mx-auto bg-surface rounded-xl shadow-soft p-6 flex flex-col gap-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-primary-container to-primary" />

          <header className="flex flex-col gap-2 pt-2">
            <button
              type="button"
              onClick={onBack}
              className="self-start text-sm text-muted hover:text-on-surface mb-2 flex items-center gap-1"
            >
              <MaterialIcon name="arrow_back" className="text-lg" />
              Back
            </button>
            <div className="flex items-center gap-1 text-primary mb-4">
              <MaterialIcon name="local_shipping" filled />
              <span className="text-xl font-bold">Roam Dash Courier</span>
            </div>
            <h1 className="text-[28px] leading-9 font-bold tracking-tight text-on-surface">
              Welcome back
            </h1>
            <p className="text-sm text-muted">Enter your details to access your route.</p>
          </header>

          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-1">
              <label htmlFor="identifier" className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">
                Email or Phone
              </label>
              <div className="relative group">
                <MaterialIcon
                  name="person"
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-muted group-focus-within:text-primary transition-colors"
                />
                <input
                  id="identifier"
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full h-14 pl-12 pr-4 bg-surface-container-low border border-surface-dim rounded-lg text-base text-on-surface focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow placeholder:text-muted/60"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex justify-between items-center">
                <label htmlFor="login-password" className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">
                  Password
                </label>
                <button type="button" className="text-xs font-semibold text-primary hover:text-on-primary-container transition-colors">
                  Forgot password?
                </button>
              </div>
              <div className="relative group">
                <MaterialIcon
                  name="lock"
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-muted group-focus-within:text-primary transition-colors"
                />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full h-14 pl-12 pr-12 bg-surface-container-low border border-surface-dim rounded-lg text-base text-on-surface focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow placeholder:text-muted/60"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label="Toggle password visibility"
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted hover:text-on-surface transition-colors"
                >
                  <MaterialIcon name={showPassword ? 'visibility' : 'visibility_off'} />
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="h-14 w-full bg-primary-container text-on-primary-container text-xs font-semibold uppercase tracking-wide rounded-lg shadow-[0_6px_12px_rgba(16,185,129,0.1)] hover:bg-primary hover:text-on-primary active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-2"
            >
              Sign In
              <MaterialIcon name="arrow_forward" className="text-[20px]" />
            </button>
          </form>

          <div className="flex items-center gap-4 py-2">
            <div className="h-px flex-grow bg-surface-dim" />
            <span className="text-[11px] text-muted uppercase tracking-widest">Or</span>
            <div className="h-px flex-grow bg-surface-dim" />
          </div>

          <CourierGoogleAuthButton
            variant="login"
            className="text-xs uppercase tracking-wide"
            onError={(msg) => setGoogleError(msg || null)}
          />
          {googleError && (
            <p className="text-sm text-error text-center -mt-2" role="alert">
              {googleError}
            </p>
          )}

          <p className="text-center text-sm">
            <span className="text-muted">Don&apos;t have an account?</span>{' '}
            <button type="button" onClick={onSignUp} className="text-primary font-semibold hover:underline">
              Sign up
            </button>
          </p>
        </div>
      </main>
    </div>
  );
}
