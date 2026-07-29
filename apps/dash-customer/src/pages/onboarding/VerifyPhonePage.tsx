import React, { useEffect, useRef, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { OtpInput } from '@/components/forms/OtpInput';
import { PhoneInput, formatJamaicaPhone, toE164JamaicaPhone } from '@/components/forms/PhoneInput';
import { useResendTimer } from '@/hooks/useResendTimer';
import { getProfile, saveProfile } from '@/lib/accountContent';
import { supabase } from '@/lib/supabase';

type VerifyPhonePageProps = {
  onBack: () => void;
  onVerify: () => void;
  /** Optional prefilled local or E.164 phone from signup */
  initialPhone?: string;
};

function normalizeLocalDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  // Strip leading country code for PhoneInput display (JM +1 876…)
  if (digits.startsWith('1876') && digits.length >= 11) return formatJamaicaPhone(digits.slice(1));
  if (digits.startsWith('876') && digits.length >= 10) return formatJamaicaPhone(digits);
  return formatJamaicaPhone(digits.slice(0, 10));
}

function resolveInitialPhone(prop?: string): string {
  if (prop?.trim()) return normalizeLocalDisplay(prop);
  const fromProfile = getProfile().phone?.trim();
  if (fromProfile) return normalizeLocalDisplay(fromProfile);
  return '';
}

export function VerifyPhonePage({ onBack, onVerify, initialPhone }: VerifyPhonePageProps) {
  const [phoneLocal, setPhoneLocal] = useState(() => resolveInitialPhone(initialPhone));
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [sending, setSending] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { canResend, formatted, reset } = useResendTimer(59);
  const autoSentRef = useRef(false);

  const e164 = phoneLocal.trim() ? toE164JamaicaPhone(phoneLocal) : '';
  const phoneReady = /^\+1876\d{7}$/.test(e164) || /^\+1\d{10}$/.test(e164);

  const sendOtp = async () => {
    if (!phoneReady) {
      setError('Enter a valid Jamaica phone number (876…).');
      return false;
    }
    setSending(true);
    setError(null);
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({ phone: e164 });
      if (otpError) throw otpError;
      saveProfile({ phone: e164 });
      setOtpSent(true);
      reset();
      setCode('');
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send verification code.');
      return false;
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (autoSentRef.current || !phoneReady) return;
    autoSentRef.current = true;
    void (async () => {
      const ok = await sendOtp();
      if (!ok) autoSentRef.current = false;
    })();
    // Intentionally once when a valid phone is already known (signup / OAuth return)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phoneReady]);

  const handleVerify = async () => {
    if (code.length < 6 || !phoneReady) return;
    setVerifying(true);
    setError(null);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        phone: e164,
        token: code,
        type: 'sms',
      });
      if (verifyError) throw verifyError;
      saveProfile({ phone: e164 });
      try {
        await supabase.auth.updateUser({ data: { phone: e164, phone_verified: true } });
      } catch {
        // Session is enough to continue onboarding
      }
      onVerify();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    if (!canResend || sending) return;
    await sendOtp();
  };

  const handlePhoneChange = (value: string) => {
    setPhoneLocal(formatJamaicaPhone(value));
    setOtpSent(false);
    autoSentRef.current = false;
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
          <p className="text-lg leading-7 text-on-surface-variant">
            {otpSent
              ? `We sent a 6-digit code to ${e164}.`
              : 'Enter your Jamaica mobile number to receive a verification code.'}
          </p>
        </div>

        {!otpSent && (
          <div className="mb-6 space-y-4">
            <PhoneInput value={phoneLocal} onChange={handlePhoneChange} required />
            <button
              type="button"
              onClick={() => void sendOtp()}
              disabled={!phoneReady || sending}
              className="w-full max-w-[400px] mx-auto bg-primary-container text-on-primary-container text-sm font-semibold tracking-wider uppercase py-4 px-6 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? 'Sending…' : 'Send code'}
            </button>
          </div>
        )}

        {otpSent && (
          <>
            <OtpInput value={code} onChange={setCode} />

            <div className="flex flex-col items-center mt-4 mb-auto space-y-2">
              <p className="text-base text-on-surface-variant">
                {canResend ? 'You can resend the code now' : `Resend code in ${formatted}`}
              </p>
              <button
                type="button"
                onClick={() => void handleResend()}
                disabled={!canResend || sending}
                className={`text-sm font-semibold tracking-wider uppercase ${
                  canResend && !sending
                    ? 'text-primary hover:text-primary-container'
                    : 'text-outline cursor-not-allowed'
                }`}
              >
                {sending ? 'Sending…' : 'Resend code'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setOtpSent(false);
                  setCode('');
                  setError(null);
                }}
                className="text-sm text-on-surface-variant hover:text-on-surface mt-1"
              >
                Change number
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
          </>
        )}

        {error && (
          <p className="text-sm text-error text-center mt-4" role="alert">
            {error}
          </p>
        )}
      </main>
    </div>
  );
}
