/**
 * Phone OTP requires Supabase Phone auth + SMS/WhatsApp provider configuration.
 * New users receive `role: 'passenger'` in auth metadata via `options.data`.
 */
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@roam/ui';
import { Input } from '@roam/ui';
import { Label } from '@roam/ui';
import { LegalPolicyAcceptanceLabel } from '@roam/ui';
import { Loader2, MessageCircle, Smartphone, X } from 'lucide-react';
import { supabase } from '@roam/auth-client';
import { ensurePassengerProfile } from '@/services/passengerProfileEdge';
import { PassengerPhoneCountryInput } from './PassengerPhoneCountryInput';
import { toE164ForCountry } from '../../utils/phoneE164';
import { DEFAULT_PHONE_COUNTRY, type PhoneCountry } from '../../utils/phoneCountries';
import { useIpDefaultCountry } from '../../hooks/useIpDefaultCountry';
import { listenForSmsOtp } from '../../utils/webOtp';
import { formatPhoneAuthError, getAuthErrorMessage } from '../../utils/supabaseAuthErrors';

export type OtpChannel = 'sms' | 'whatsapp';

interface PassengerPhoneAuthWizardProps {
  shouldCreateUser: boolean;
  requireTerms: boolean;
  onVerified: () => void;
  onCancel: () => void;
}

const RESEND_SECONDS = 45;

export function PassengerPhoneAuthWizard({
  shouldCreateUser,
  requireTerms,
  onVerified,
  onCancel,
}: PassengerPhoneAuthWizardProps) {
  const { country: ipCountry, geoReady } = useIpDefaultCountry();
  const [selectedCountry, setSelectedCountry] = useState<PhoneCountry>(DEFAULT_PHONE_COUNTRY);
  const geoAppliedRef = useRef(false);
  const [hasManualCountry, setHasManualCountry] = useState(false);
  const [countryMenuOpen, setCountryMenuOpen] = useState(false);
  const [countryFilter, setCountryFilter] = useState('');

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
    if (!geoReady || geoAppliedRef.current) return;
    geoAppliedRef.current = true;
    if (!hasManualCountry) setSelectedCountry(ipCountry);
  }, [geoReady, ipCountry, hasManualCountry]);

  useEffect(() => {
    setNationalDigits(d => d.replace(/\D/g, '').slice(0, selectedCountry.nationalMaxLen));
  }, [selectedCountry]);

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

  useEffect(() => {
    if (!channelModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) setChannelModalOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [channelModalOpen, loading]);

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
          data: { role: 'passenger' },
        },
      });
      if (otpError) throw otpError;
      setChannel(selected);
      setChannelModalOpen(false);
      setStep('verify');
      setResendIn(RESEND_SECONDS);
      setOtp('');
    } catch (err: unknown) {
      const msg = getAuthErrorMessage(err, 'Could not send verification code.');
      setError(formatPhoneAuthError(msg));
    } finally {
      setLoading(false);
    }
  };

  const openChannelModal = () => {
    setError(null);
    setCountryMenuOpen(false);
    if (requireTerms && !termsAccepted) {
      setError('Please accept the Terms and Privacy Policy to continue.');
      return;
    }
    try {
      const formatted = toE164ForCountry(selectedCountry, nationalDigits);
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
      try {
        await ensurePassengerProfile();
      } catch {
        /* profile sync is best-effort; gate will retry */
      }
      onVerified();
    } catch (err: unknown) {
      const msg = getAuthErrorMessage(err, 'Verification failed.');
      setError(formatPhoneAuthError(msg));
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
      <div className="flex flex-col gap-5">
        {error && (
          <div className="whitespace-pre-line rounded-xl border border-red-300/50 bg-red-500/15 px-3 py-2 text-sm font-medium text-white">
            {error}
          </div>
        )}
        <div>
          <Label className="text-white">Verification code</Label>
          <p className="mt-1 text-xs text-white/70">
            Enter the code we sent to {e164}
            {channel === 'sms' ? ' via SMS' : ' via WhatsApp'}.
          </p>
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            value={otp}
            onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 8))}
            placeholder="000000"
            className="input-touch mt-2 rounded-xl border-white/35 bg-white/90 text-center text-lg tracking-widest text-zinc-900"
            maxLength={8}
          />
        </div>
        <button
          type="button"
          className="btn-touch w-full rounded-xl bg-gradient-to-b from-emerald-400 to-emerald-600 text-[15px] font-semibold text-white shadow-[0_12px_28px_-8px_rgba(0,0,0,0.35)] disabled:opacity-50"
          disabled={loading}
          onClick={() => verify()}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
              Verifying…
            </>
          ) : (
            'Verify and continue'
          )}
        </button>
        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            className="font-medium text-emerald-200 hover:underline disabled:opacity-40"
            disabled={resendIn > 0 || loading}
            onClick={() => void handleResend()}
          >
            {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
          </button>
          <button
            type="button"
            className="text-white/65 hover:text-white"
            onClick={() => {
              setStep('phone');
              setOtp('');
              setError(null);
            }}
          >
            Change number
          </button>
        </div>
        <button type="button" className="w-full text-sm text-white/55 hover:text-white/90" onClick={onCancel}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="relative z-0 flex flex-col gap-6">
      {error && !channelModalOpen && (
        <div className="whitespace-pre-line rounded-xl border border-red-300/50 bg-red-500/15 px-3 py-2 text-sm font-medium text-white">
          {error}
        </div>
      )}

      <PassengerPhoneCountryInput
        showLabel={false}
        selectedCountry={selectedCountry}
        onSelectCountry={setSelectedCountry}
        onMarkManualCountry={() => setHasManualCountry(true)}
        nationalDigits={nationalDigits}
        onNationalDigitsChange={setNationalDigits}
        countryMenuOpen={countryMenuOpen}
        onCountryMenuOpenChange={setCountryMenuOpen}
        countryFilter={countryFilter}
        onCountryFilterChange={setCountryFilter}
      />

      {requireTerms && (
        <div className="flex items-start gap-2 text-sm text-white/90">
          <input
            id="passenger-signup-terms-phone"
            type="checkbox"
            checked={termsAccepted}
            onChange={e => setTermsAccepted(e.target.checked)}
            className="mt-1 size-4 shrink-0 cursor-pointer rounded border-white/40 bg-white/10"
          />
          <label htmlFor="passenger-signup-terms-phone" className="cursor-pointer leading-snug">
            <LegalPolicyAcceptanceLabel privacyClassName="font-semibold text-emerald-200" termsClassName="font-semibold text-emerald-200" />
          </label>
        </div>
      )}

      <button
        type="button"
        disabled={loading}
        onClick={() => openChannelModal()}
        className="btn-touch relative z-10 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-emerald-400 to-emerald-600 text-[15px] font-semibold text-white shadow-[0_12px_28px_-8px_rgba(0,0,0,0.35)] transition hover:from-emerald-300 hover:to-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Please wait…
          </>
        ) : (
          'Continue'
        )}
      </button>
      <button
        type="button"
        className="relative z-10 w-full cursor-pointer text-sm text-white/55 hover:text-white/90"
        onClick={onCancel}
      >
        Back
      </button>

      {typeof document !== 'undefined' &&
        channelModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <button
              type="button"
              className="absolute inset-0 bg-black/55"
              aria-label="Close"
              disabled={loading}
              onClick={() => !loading && setChannelModalOpen(false)}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="passenger-otp-channel-title"
              className="relative z-[201] w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-2xl"
            >
              {error && (
                <div className="mb-4 whitespace-pre-line rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
                  {error}
                </div>
              )}
              <div className="mb-4 flex items-start justify-between gap-2">
                <div>
                  <h2 id="passenger-otp-channel-title" className="text-lg font-semibold text-zinc-900">
                    Send OTP
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500">How should we send the code?</p>
                </div>
                <button
                  type="button"
                  className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 disabled:opacity-40"
                  disabled={loading}
                  onClick={() => setChannelModalOpen(false)}
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 py-1">
                <button
                  type="button"
                  onClick={() => setChannel('whatsapp')}
                  className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-colors ${
                    channel === 'whatsapp'
                      ? 'border-emerald-600 bg-emerald-50'
                      : 'border-zinc-200 bg-zinc-50'
                  }`}
                >
                  <MessageCircle className="h-8 w-8 text-emerald-600" />
                  <span className="text-sm font-semibold text-zinc-900">WhatsApp</span>
                </button>
                <button
                  type="button"
                  onClick={() => setChannel('sms')}
                  className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-colors ${
                    channel === 'sms' ? 'border-sky-600 bg-sky-50' : 'border-zinc-200 bg-zinc-50'
                  }`}
                >
                  <Smartphone className="h-8 w-8 text-sky-600" />
                  <span className="text-sm font-semibold text-zinc-900">SMS</span>
                </button>
              </div>
              <div className="mt-6">
                <Button
                  type="button"
                  className="w-full bg-zinc-900 text-white hover:bg-zinc-800"
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
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
