import React, { useState } from 'react';
import { ROAM_LEGAL } from '@roam/business-config/legalUrls';
import { OnboardingHeader } from '@/components/layout/OnboardingHeader';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { CourierGoogleAuthButton } from '@/components/auth/CourierGoogleAuthButton';
import { PhoneInput, toE164JamaicaPhone } from '@/components/forms/PhoneInput';
import { saveSignupDraft } from '@/lib/signupDraft';
import { supabase } from '@/lib/supabase';

type SignUpPageProps = {
  onBack: () => void;
  onContinue: () => void;
};

export function SignUpPage({ onBack, onContinue }: SignUpPageProps) {
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!termsAccepted) return;

    const trimmedEmail = email.trim();
    const trimmedPhone = phone.trim();
    const hasEmail = trimmedEmail.includes('@');
    const hasPhone = trimmedPhone.replace(/\D/g, '').length >= 7;

    if (!hasEmail && !hasPhone) {
      setAuthError('Enter an email address or phone number.');
      return;
    }
    if (password.length < 8) {
      setAuthError('Password must be at least 8 characters.');
      return;
    }

    setAuthError(null);
    setLoading(true);

    try {
      if (hasEmail) {
        saveSignupDraft({ countryCode: '+1', phone: trimmedPhone, email: trimmedEmail });
        const { error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: {
            data: {
              phone: hasPhone ? toE164JamaicaPhone(trimmedPhone) : null,
              countryCode: '+1',
            },
          },
        });
        if (error) throw error;
        onContinue();
        return;
      }

      const e164 = toE164JamaicaPhone(trimmedPhone);
      saveSignupDraft({ countryCode: '+1', phone: trimmedPhone, email: '' });
      const { error } = await supabase.auth.signUp({ phone: e164, password });
      if (error) {
        setAuthError(
          error.message.includes('SMS')
            ? 'Phone signup requires SMS verification. Please use email signup instead.'
            : error.message,
        );
        return;
      }
      onContinue();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Sign up failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-background text-on-background min-h-full flex flex-col antialiased">
      <OnboardingHeader onBack={onBack} />

      <main className="flex-1 flex flex-col px-[var(--spacing-edge)] pt-[calc(56px+env(safe-area-inset-top))] pb-safe max-w-md mx-auto w-full">
        <div className="mt-6 mb-8">
          <h1 className="text-[28px] leading-9 font-bold tracking-tight text-on-surface">
            Create your courier account
          </h1>
          <p className="text-sm text-muted mt-2">Join the fleet and start earning on your schedule.</p>
        </div>

        <form className="flex-1 flex flex-col gap-6" onSubmit={(e) => void handleSubmit(e)}>
          <div className="flex flex-col gap-3">
            <CourierGoogleAuthButton variant="signup" onError={(msg) => setGoogleError(msg || null)} />
            <p className="text-xs text-muted leading-relaxed text-center px-2">
              By continuing with Google, you agree to Roam Dash Courier&apos;s{' '}
              <a href={ROAM_LEGAL.termsOfServiceUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">
                Terms of Service
              </a>{' '}
              and{' '}
              <a href={ROAM_LEGAL.privacyPolicyUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">
                Privacy Policy
              </a>
              .
            </p>
            {(googleError || authError) && (
              <p className="text-sm text-error text-center" role="alert">
                {authError || googleError}
              </p>
            )}
          </div>

          <div className="flex items-center gap-4">
            <div className="flex-1 h-px bg-outline-variant/30" />
            <span className="text-xs font-semibold text-muted uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-outline-variant/30" />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">
              Phone Number
            </label>
            <PhoneInput value={phone} onChange={setPhone} />
          </div>

          <div className="flex items-center gap-4">
            <div className="flex-1 h-px bg-outline-variant/30" />
            <span className="text-xs font-semibold text-muted uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-outline-variant/30" />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="email" className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="h-14 bg-surface border border-outline-variant rounded-lg px-4 text-base text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors placeholder:text-muted/50"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">
              Password
            </label>
            <div className="relative h-14">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                required
                className="w-full h-full bg-surface border border-outline-variant rounded-lg pl-4 pr-12 text-base text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors placeholder:text-muted/50"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-0 top-0 h-full w-12 flex items-center justify-center text-muted hover:text-on-surface transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <MaterialIcon name={showPassword ? 'visibility' : 'visibility_off'} />
              </button>
            </div>
          </div>

          <div className="flex-1" />

          <div className="flex flex-col gap-4 mt-8">
            <label className="flex items-start gap-2 cursor-pointer group">
              <div className="relative flex items-center justify-center w-6 h-6 shrink-0 mt-0.5">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="peer appearance-none w-5 h-5 border-2 border-outline-variant rounded bg-surface checked:bg-primary checked:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer"
                />
                <MaterialIcon
                  name="check"
                  className="absolute text-on-primary pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity text-lg"
                  filled
                />
              </div>
              <span className="text-sm text-on-surface-variant leading-tight">
                I agree to Roam Dash Courier&apos;s{' '}
                <a href={ROAM_LEGAL.termsOfServiceUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">
                  Terms of Service
                </a>{' '}
                and{' '}
                <a href={ROAM_LEGAL.privacyPolicyUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">
                  Privacy Policy
                </a>
                .
              </span>
            </label>

            <button
              type="submit"
              disabled={!termsAccepted || loading}
              className="w-full min-h-[56px] bg-primary-container text-on-primary-container rounded-lg font-semibold text-xl flex items-center justify-center shadow-[0_6px_12px_rgba(16,185,129,0.1)] hover:bg-primary-container/90 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Please wait…' : 'Continue'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
