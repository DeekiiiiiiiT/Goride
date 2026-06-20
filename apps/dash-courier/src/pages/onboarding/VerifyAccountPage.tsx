import React, { useState } from 'react';
import { OnboardingHeader } from '@/components/layout/OnboardingHeader';
import { OtpInput } from '@/components/forms/OtpInput';
import { useResendTimer } from '@/hooks/useResendTimer';

type VerifyAccountPageProps = {
  onBack: () => void;
  onVerify: () => void;
};

export function VerifyAccountPage({ onBack, onVerify }: VerifyAccountPageProps) {
  const [otp, setOtp] = useState('');
  const { canResend, formatted, reset } = useResendTimer(59);

  const handleVerify = () => {
    if (otp.length < 6) return;
    onVerify();
  };

  return (
    <div className="bg-background text-on-background min-h-full flex flex-col font-sans">
      <header className="flex items-center px-[var(--spacing-edge)] h-14 w-full pt-safe pt-4 shrink-0">
        <button
          type="button"
          onClick={onBack}
          aria-label="Go back"
          className="p-2 -ml-2 rounded-full hover:bg-surface-container-high transition-colors active:scale-95 text-primary"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
      </header>

      <main className="flex-1 flex flex-col px-[var(--spacing-edge)] pt-6 pb-8 max-w-md mx-auto w-full">
        <div className="mb-8">
          <h1 className="text-[28px] leading-9 font-bold tracking-tight text-on-surface mb-2">
            Verify your account
          </h1>
          <p className="text-base text-muted">Enter the 6-digit code sent to your phone</p>
        </div>

        <div className="mb-8 w-full">
          <OtpInput value={otp} onChange={setOtp} />

          <div className="flex flex-col items-center justify-center text-center">
            {!canResend && (
              <p className="text-sm text-secondary mb-1">Resend code in {formatted}</p>
            )}
            <button
              type="button"
              disabled={!canResend}
              onClick={reset}
              className={`text-xs font-semibold uppercase tracking-wider transition-all ${
                canResend
                  ? 'text-primary cursor-pointer'
                  : 'text-muted opacity-50 cursor-not-allowed'
              }`}
            >
              Resend code
            </button>
          </div>
        </div>

        <div className="flex-1" />

        <div className="mt-auto pt-6">
          <button
            type="button"
            onClick={handleVerify}
            disabled={otp.length < 6}
            className="w-full h-14 bg-primary-container text-on-primary rounded-xl font-semibold text-xl shadow-[0_6px_12px_rgba(16,185,129,0.15)] hover:bg-primary-container/90 active:scale-[0.98] transition-all flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Verify
          </button>
        </div>
      </main>
    </div>
  );
}
