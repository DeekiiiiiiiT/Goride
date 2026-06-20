import React, { useState } from 'react';
import { ROAM_LEGAL } from '@roam/business-config/legalUrls';
import { OnboardingHeader } from '@/components/layout/OnboardingHeader';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { saveSignupDraft } from '@/lib/signupDraft';

type SignUpPageProps = {
  onBack: () => void;
  onContinue: () => void;
};

const COUNTRY_OPTIONS = [
  { value: '+1', label: '🇯🇲 +1' },
  { value: '+1US', label: '🇺🇸 +1' },
  { value: '+44', label: '🇬🇧 +44' },
];

export function SignUpPage({ onBack, onContinue }: SignUpPageProps) {
  const [countryCode, setCountryCode] = useState('+1');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!termsAccepted) return;
    saveSignupDraft({ countryCode, phone, email });
    onContinue();
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

        <form className="flex-1 flex flex-col gap-6" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">
              Phone Number
            </label>
            <div className="flex gap-2 h-14">
              <div className="relative shrink-0 w-24">
                <select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="appearance-none w-full h-full bg-surface border border-outline-variant rounded-lg pl-3 pr-8 text-base text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors cursor-pointer"
                >
                  {COUNTRY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <MaterialIcon
                  name="expand_more"
                  className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-muted text-xl"
                />
              </div>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="876-555-0199"
                className="flex-1 h-full bg-surface border border-outline-variant rounded-lg px-4 text-base text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors placeholder:text-muted/50"
              />
            </div>
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
                <a
                  href={ROAM_LEGAL.termsOfServiceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline font-medium"
                >
                  Terms of Service
                </a>{' '}
                and{' '}
                <a
                  href={ROAM_LEGAL.privacyPolicyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline font-medium"
                >
                  Privacy Policy
                </a>
                .
              </span>
            </label>

            <button
              type="submit"
              disabled={!termsAccepted}
              className="w-full min-h-[56px] bg-primary-container text-on-primary-container rounded-lg font-semibold text-xl flex items-center justify-center shadow-[0_6px_12px_rgba(16,185,129,0.1)] hover:bg-primary-container/90 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Continue
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
