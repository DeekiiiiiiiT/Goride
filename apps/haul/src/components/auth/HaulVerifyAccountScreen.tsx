import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { supabase } from '../../utils/supabase/client';
import { HaulAuthAtmosphere } from './HaulAuthAtmosphere';
import { OtpInput } from './OtpInput';
import { haulAuthCard, haulErrorBox, haulPrimaryBtn } from './haulAuthUi';

const RESEND_SECONDS = 120;

type Props = {
  phoneE164: string;
  onVerified: () => void;
  onBack: () => void;
};

export function HaulVerifyAccountScreen({ phoneE164, onVerified, onBack }: Props) {
  const [otp, setOtp] = useState('');
  const [resendIn, setResendIn] = useState(RESEND_SECONDS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setInterval(() => setResendIn((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => window.clearInterval(t);
  }, [resendIn]);

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleResend = async () => {
    if (resendIn > 0) return;
    setError(null);
    const { error: otpErr } = await supabase.auth.signInWithOtp({ phone: phoneE164 });
    if (otpErr) {
      setError(otpErr.message);
      return;
    }
    setResendIn(RESEND_SECONDS);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 6) {
      setError('Enter the 6-digit code.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { error: verifyErr } = await supabase.auth.verifyOtp({
        phone: phoneE164,
        token: otp,
        type: 'sms',
      });
      if (verifyErr) throw verifyErr;
      await supabase.auth.updateUser({ data: { surface: 'hauler' } });
      onVerified();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center bg-[#0b1326] p-4 text-[#dae2fd] antialiased md:p-12">
      <HaulAuthAtmosphere />

      <main className="relative z-10 w-full max-w-[440px]">
        <div className="mb-8 flex items-center justify-center gap-2">
          <span className="material-symbols-outlined text-[32px] text-[#ffc174]" style={{ fontVariationSettings: "'FILL' 1" }}>
            local_shipping
          </span>
          <span className="text-xl font-bold tracking-tight text-[#ffc174]">RoamHaul</span>
        </div>

        <div className={`${haulAuthCard} max-w-none overflow-hidden`}>
          <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-[#171f33] via-[#f59e0b] to-[#171f33] opacity-80" aria-hidden />

          <div className="mb-6 text-center md:text-left">
            <h1 className="mb-2 text-[32px] leading-10 font-bold tracking-tight text-[#dae2fd]">
              Verify your account
            </h1>
            <p className="text-base text-[#d8c3ad]">
              For your security, please enter the 6-digit authorization code sent to your registered
              device.
            </p>
          </div>

          {error ? <div className={`${haulErrorBox} mb-4`}>{error}</div> : null}

          <form className="flex flex-col gap-8" onSubmit={(e) => void handleSubmit(e)}>
            <OtpInput value={otp} onChange={setOtp} disabled={loading} />

            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-1 rounded-full border border-[#31394d] bg-[#0b1326] px-3 py-1.5 text-[#d8c3ad]">
                <span className="material-symbols-outlined text-base">timer</span>
                <span className="tracking-widest">{formatTimer(resendIn)}</span>
              </div>
              <button
                type="button"
                disabled={resendIn > 0}
                onClick={() => void handleResend()}
                className="text-[#ffc174] underline-offset-4 hover:underline disabled:opacity-40"
              >
                Resend code
              </button>
            </div>

            <button type="submit" disabled={loading || otp.length < 6} className={haulPrimaryBtn}>
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
              <span className="font-bold tracking-wide uppercase">Verify</span>
              <ArrowRight className="h-5 w-5" />
            </button>
          </form>
        </div>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={onBack}
            className="mx-auto flex min-h-11 items-center justify-center gap-1 px-4 text-sm text-[#d8c3ad] hover:text-[#dae2fd]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to login
          </button>
        </div>
      </main>
    </div>
  );
}
