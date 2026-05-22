import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Input, Label } from '@roam/ui';
import { Loader2, MessageCircle, Smartphone, X } from 'lucide-react';
import { supabase } from '../../../utils/supabase/client';
import { FleetPhoneCountryInput } from './FleetPhoneCountryInput';
import { toE164ForCountry } from '../../../utils/phoneE164';
import { DEFAULT_PHONE_COUNTRY, type PhoneCountry } from '../../../utils/phoneCountries';
import { useIpDefaultCountry } from '../../../hooks/useIpDefaultCountry';
import { listenForSmsOtp } from '../../../utils/webOtp';
import { formatPhoneAuthError, getAuthErrorMessage } from '../../../utils/supabaseAuthErrors';

export type OtpChannel = 'sms' | 'whatsapp';

interface FleetPhoneAuthWizardProps {
  requireTerms?: boolean;
  onVerified: () => void;
  onCancel: () => void;
}

const RESEND_SECONDS = 45;

export function FleetPhoneAuthWizard({
  requireTerms = true,
  onVerified,
  onCancel,
}: FleetPhoneAuthWizardProps) {
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
    if (step !== 'verify' || !e164 || channel !== 'sms') return;
    webOtpAbortRef.current?.abort();
    const ac = new AbortController();
    webOtpAbortRef.current = ac;
    listenForSmsOtp(code => {
      const digits = code.replace(/\D/g, '').slice(0, 8);
      if (digits) setOtp(digits);
    }, { signal: ac.signal });
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
          shouldCreateUser: true,
          channel: selected,
          data: { signup_intent: 'fleet_owner' },
        },
      });
      if (otpError) throw otpError;
      setChannel(selected);
      setChannelModalOpen(false);
      setStep('verify');
      setResendIn(RESEND_SECONDS);
      setOtp('');
    } catch (err: unknown) {
      setError(formatPhoneAuthError(getAuthErrorMessage(err, 'Could not send verification code.')));
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
      setE164(toE164ForCountry(selectedCountry, nationalDigits));
      setChannelModalOpen(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid phone number.');
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
      setError(formatPhoneAuthError(getAuthErrorMessage(err, 'Verification failed.')));
    } finally {
      setLoading(false);
    }
  };

  if (step === 'verify' && e164) {
    return (
      <div className="space-y-4">
        {error && (
          <div className="whitespace-pre-line rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
            {error}
          </div>
        )}
        <div>
          <Label className="text-slate-800 dark:text-slate-200">Verification code</Label>
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
        <Button type="button" className="w-full bg-indigo-600 hover:bg-indigo-700" disabled={loading} onClick={() => verify()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify and continue'}
        </Button>
        <button
          type="button"
          className="w-full text-sm text-slate-500"
          onClick={() => {
            setStep('phone');
            setOtp('');
          }}
        >
          Change number
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && !channelModalOpen && (
        <div className="whitespace-pre-line rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
          {error}
        </div>
      )}
      <FleetPhoneCountryInput
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
        <label className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={e => setTermsAccepted(e.target.checked)}
            className="mt-1"
          />
          <span>I accept the Privacy Policy and Terms &amp; Conditions.</span>
        </label>
      )}
      <button
        type="button"
        disabled={loading}
        onClick={() => openChannelModal()}
        className="flex w-full items-center justify-center rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Continue with phone'}
      </button>
      <button type="button" className="w-full text-sm text-slate-500" onClick={onCancel}>
        Back
      </button>
      {typeof document !== 'undefined' && channelModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <button type="button" className="absolute inset-0 bg-black/55" aria-label="Close" onClick={() => setChannelModalOpen(false)} />
            <div className="relative z-[201] w-full max-w-md rounded-xl border bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
              <h2 className="text-lg font-semibold">Send verification code</h2>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setChannel('whatsapp')} className={`rounded-xl border-2 p-4 ${channel === 'whatsapp' ? 'border-indigo-600 bg-indigo-50' : ''}`}>
                  <MessageCircle className="mx-auto h-8 w-8 text-indigo-600" />
                  <span className="mt-2 block text-sm font-semibold">WhatsApp</span>
                </button>
                <button type="button" onClick={() => setChannel('sms')} className={`rounded-xl border-2 p-4 ${channel === 'sms' ? 'border-indigo-600 bg-indigo-50' : ''}`}>
                  <Smartphone className="mx-auto h-8 w-8 text-indigo-600" />
                  <span className="mt-2 block text-sm font-semibold">SMS</span>
                </button>
              </div>
              <Button type="button" className="mt-4 w-full bg-indigo-600 hover:bg-indigo-700" disabled={loading} onClick={() => void sendOtp(channel)}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send code'}
              </Button>
              <button type="button" className="absolute right-3 top-3" onClick={() => setChannelModalOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
