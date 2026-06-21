import React, { useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { OtpInput } from '@/components/forms/OtpInput';
import { useResendTimer } from '@/hooks/useResendTimer';

type VerifyPhonePageProps = {
  onBack: () => void;
  onVerify: () => void;
};

export function VerifyPhonePage({ onBack, onVerify }: VerifyPhonePageProps) {
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const { canResend, formatted, reset } = useResendTimer(59);

  const handleVerify = async () => {
    if (code.length < 6) return;
    setVerifying(true);
    await new Promise((resolve) => window.setTimeout(resolve, 400));
    setVerifying(false);
    onVerify();
  };

  const handleResend = () => {
    if (!canResend) return;
    reset();
    setCode('');
  };

  return (
    <div className="app-fullscreen-screen bg-surface text-on-surface antialiased selection:bg-primary-container selection:text-on-primary-container">
      <header className="px-4 pt-6 pb-4 flex items-center z-10 relative max-w-[1200px] mx-auto w-full">
        <button
          type="button"
          aria-label="Go back"
          onClick={onBack}
          className="w-10 h-10 -ml-2 rounded-full flex items-center justify-center text-on-surface hover:bg-surface-variant transition-colors active:scale-95"
        >
          <MaterialIcon name="arrow_back" />
        </button>
      </header>

      <main className="flex-1 flex flex-col px-4 w-full max-w-[1200px] mx-auto relative z-10 pb-8 min-h-0">
        <div className="mt-6 mb-8 dash-fade-in-up">
          <h1 className="text-[28px] leading-[34px] md:text-[32px] md:leading-[40px] font-bold text-on-surface mb-2">
            Verify your phone
          </h1>
          <p className="text-lg leading-7 text-on-surface-variant">We sent a 6-digit code to your number.</p>
        </div>

        <OtpInput value={code} onChange={setCode} />

        <div className="flex flex-col items-center mt-4 mb-auto space-y-2">
          <p className="text-base text-on-surface-variant">
            {canResend ? 'You can resend the code now' : `Resend code in ${formatted}`}
          </p>
          <button
            type="button"
            onClick={handleResend}
            disabled={!canResend}
            className={`text-sm font-semibold tracking-wider uppercase ${
              canResend ? 'text-primary hover:text-primary-container' : 'text-outline cursor-not-allowed'
            }`}
          >
            Resend code
          </button>
        </div>

        <div className="mt-8 w-full max-w-[400px] mx-auto pb-safe">
          <button
            type="button"
            onClick={() => void handleVerify()}
            disabled={code.length < 6 || verifying}
            className="w-full bg-primary-container text-on-primary-container text-sm font-semibold tracking-wider uppercase py-4 px-6 rounded-lg shadow-[0_8px_16px_rgba(16,185,129,0.2)] hover:shadow-[0_12px_20px_rgba(16,185,129,0.3)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all duration-200 flex justify-center items-center disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
          >
            {verifying ? 'Verifying…' : 'Verify'}
          </button>
        </div>
      </main>
    </div>
  );
}
