/**
 * Phone / WhatsApp OTP requires the Supabase project to have Phone auth enabled,
 * an SMS provider configured, and (for WhatsApp) provider support + dashboard settings.
 * New users must receive `role: 'driver'` in auth metadata — passed via `options.data` below.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@roam/ui';
import { Button } from '@roam/ui';
import { Input } from '@roam/ui';
import { Label } from '@roam/ui';
import { Loader2, MessageCircle, Smartphone } from 'lucide-react';
import { supabase } from '../../utils/supabase/client';
import { toE164 } from '../../utils/phoneE164';
import { listenForSmsOtp } from '../../utils/webOtp';

export type OtpChannel = 'sms' | 'whatsapp';

interface DriverPhoneAuthWizardProps {
  /** true = new account (metadata role driver); false = existing user sign-in */
  shouldCreateUser: boolean;
  /** Require terms checkbox before sending OTP (sign-up only) */
  requireTerms: boolean;
  onVerified: () => void;
  onCancel: () => void;
}

const RESEND_SECONDS = 45;

export function DriverPhoneAuthWizard({
  shouldCreateUser,
  requireTerms,
  onVerified,
  onCancel,
}: DriverPhoneAuthWizardProps) {
  const [nationalDigits, setNationalDigits] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [channelModalOpen, setChannelModalOpen] = useState(false);
  const [channel, setChannel] = useState<OtpChannel>('sms');
  const [e164, setE164] = useState<string | null>(null);
  const [step, setStep] = useState<'phone' | 'verify'>('phone');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const webOtpAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setInterval(() => setResendIn(s => (s <= 1 ? 0 : s - 1)), 1000);
    return () => window.clearInterval(t);
  }, [resendIn]);

  useEffect(() => {
    if (step !== 'verify' || !e164) return;
    if (channel !== 'sms') return;

    webOtpAbortRef.current?.abort();
    const ac = new AbortController();
    webOtpAbortRef.current = ac;
    listenForSmsOtp(
      code => {
        const digits = code.replace(/\D/g, '').slice(0, 8);
        if (digits) setOtp(digits);
      },
      { signal: ac.signal }
    );
    return () => ac.abort();
  }, [step, e164, channel]);

  const sendOtp = async (selected: OtpChannel) => {
    if (!e164) return;
    setLoading(true);
    setError(null);
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        phone: e164,
        options: {
          shouldCreateUser,
          channel: selected,
          data: { role: 'driver' },
        },
      });
      if (otpError) throw otpError;
      setChannel(selected);
      setChannelModalOpen(false);
      setStep('verify');
      setResendIn(RESEND_SECONDS);
      setOtp('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not send verification code.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const openChannelModal = () => {
    setError(null);
    if (requireTerms && !termsAccepted) {
      setError('Please accept the Terms and Privacy Policy to continue.');
      return;
    }
    try {
      const formatted = toE164('1', nationalDigits);
      setE164(formatted);
      setChannelModalOpen(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid phone number.';
      setError(msg);
    }
  };

  const verify = async (code?: string) => {
    const token = (code ?? otp).replace(/\D/g, '');
    if (!e164 || token.length < 4) {
      setError('Enter the verification code from your message.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { error: vError } = await supabase.auth.verifyOtp({
        phone: e164,
        token,
        type: 'sms',
      });
      if (vError) throw vError;
      onVerified();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Verification failed.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!e164 || resendIn > 0) return;
    await sendOtp(channel);
  };

  if (step === 'verify' && e164) {
    return (
      <div className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
            {error}
          </div>
        )}
        <div>
          <Label className="text-slate-800 dark:text-slate-200">Verification code</Label>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Enter the code we sent to {e164}
            {channel === 'sms' ? ' via SMS' : ' via WhatsApp'}.
          </p>
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            value={otp}
            onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 8))}
            placeholder="000000"
            className="mt-2 text-center text-lg tracking-widest"
            maxLength={8}
          />
        </div>
        <Button
          type="button"
          className="w-full bg-gradient-to-r from-emerald-600 to-teal-600"
          disabled={loading}
          onClick={() => verify()}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Verifying…
            </>
          ) : (
            'Verify and continue'
          )}
        </Button>
        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            className="font-medium text-emerald-700 hover:underline disabled:opacity-40 dark:text-emerald-400"
            disabled={resendIn > 0 || loading}
            onClick={() => void handleResend()}
          >
            {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
          </button>
          <button
            type="button"
            className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            onClick={() => {
              setStep('phone');
              setOtp('');
              setError(null);
            }}
          >
            Change number
          </button>
        </div>
        <button
          type="button"
          className="w-full text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
          {error}
        </div>
      )}

      <div>
        <Label className="text-slate-800 dark:text-slate-200">Mobile number</Label>
        <div className="mt-2 flex gap-2">
          <div className="flex shrink-0 items-center rounded-lg border border-slate-300 bg-slate-50 px-3 text-sm font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-900/50 dark:text-slate-200">
            +1
          </div>
          <Input
            inputMode="numeric"
            autoComplete="tel-national"
            value={nationalDigits}
            onChange={e => setNationalDigits(e.target.value.replace(/\D/g, '').slice(0, 10))}
            placeholder="8765551234"
            className="flex-1"
          />
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Country code +1 (Jamaica / NANP)</p>
      </div>

      {requireTerms && (
        <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={e => setTermsAccepted(e.target.checked)}
            className="mt-1 rounded border-slate-300"
          />
          <span>
            I have read and accept the{' '}
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">Privacy Policy</span> and{' '}
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">Terms &amp; Conditions</span>.
          </span>
        </label>
      )}

      <Button
        type="button"
        className="w-full bg-gradient-to-r from-emerald-600 to-teal-600"
        disabled={loading}
        onClick={() => openChannelModal()}
      >
        Continue
      </Button>
      <button
        type="button"
        className="w-full text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400"
        onClick={onCancel}
      >
        Back
      </button>

      <Dialog open={channelModalOpen} onOpenChange={setChannelModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send OTP</DialogTitle>
            <DialogDescription>How should we send the code?</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <button
              type="button"
              onClick={() => setChannel('whatsapp')}
              className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-colors ${
                channel === 'whatsapp'
                  ? 'border-emerald-600 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-950/40'
                  : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/40'
              }`}
            >
              <MessageCircle className="h-8 w-8 text-emerald-600" />
              <span className="text-sm font-semibold">WhatsApp</span>
            </button>
            <button
              type="button"
              onClick={() => setChannel('sms')}
              className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-colors ${
                channel === 'sms'
                  ? 'border-sky-600 bg-sky-50 dark:border-sky-500 dark:bg-sky-950/40'
                  : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/40'
              }`}
            >
              <Smartphone className="h-8 w-8 text-sky-600" />
              <span className="text-sm font-semibold">SMS</span>
            </button>
          </div>
          <DialogFooter>
            <Button
              type="button"
              className="w-full bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
              disabled={loading}
              onClick={() => void sendOtp(channel)}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending…
                </>
              ) : (
                'Send OTP'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
