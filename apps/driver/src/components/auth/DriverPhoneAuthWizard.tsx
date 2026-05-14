/**
 * Phone / WhatsApp OTP requires the Supabase project to have Phone auth enabled,
 * an SMS provider configured, and (for WhatsApp) provider support + dashboard settings.
 * New users must receive `role: 'driver'` in auth metadata — passed via `options.data` below.
 */
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@roam/ui';
import { Input } from '@roam/ui';
import { Label } from '@roam/ui';
import { Popover, PopoverContent, PopoverTrigger } from '@roam/ui';
import { ScrollArea } from '@roam/ui';
import { ChevronDown, Loader2, MessageCircle, Smartphone, X } from 'lucide-react';
import { supabase } from '../../utils/supabase/client';
import { toE164ForCountry } from '../../utils/phoneE164';
import { DEFAULT_PHONE_COUNTRY, PHONE_COUNTRIES, flagEmoji, type PhoneCountry } from '../../utils/phoneCountries';
import { useIpDefaultCountry } from '../../hooks/useIpDefaultCountry';
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
    <div className="relative z-0 space-y-4">
      {error && !channelModalOpen && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
          {error}
        </div>
      )}

      <div>
        <Label className="text-slate-800 dark:text-slate-200">Mobile number</Label>
        <div className="mt-2 flex gap-2">
          <Popover open={countryMenuOpen} onOpenChange={setCountryMenuOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900/50 dark:text-slate-100 dark:hover:bg-slate-800/80"
                aria-label="Select country code"
              >
                <span className="text-lg leading-none" aria-hidden>
                  {flagEmoji(selectedCountry.iso2)}
                </span>
                <span>+{selectedCountry.dial}</span>
                <ChevronDown className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[min(100vw-2rem,20rem)] p-0" align="start">
              <div className="border-b border-slate-200 p-2 dark:border-slate-700">
                <Input
                  placeholder="Search country…"
                  value={countryFilter}
                  onChange={e => setCountryFilter(e.target.value)}
                  className="h-9"
                />
              </div>
              <ScrollArea className="h-72">
                <ul className="p-1">
                  {PHONE_COUNTRIES.filter(c => {
                    const q = countryFilter.trim().toLowerCase();
                    if (!q) return true;
                    return (
                      c.name.toLowerCase().includes(q) ||
                      c.iso2.toLowerCase().includes(q) ||
                      `+${c.dial}`.includes(q) ||
                      c.dial.includes(q.replace(/\D/g, ''))
                    );
                  }).map(c => (
                    <li key={c.iso2}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                        onClick={() => {
                          setHasManualCountry(true);
                          setSelectedCountry(c);
                          setCountryMenuOpen(false);
                          setCountryFilter('');
                        }}
                      >
                        <span className="text-lg leading-none">{flagEmoji(c.iso2)}</span>
                        <span className="flex-1 truncate font-medium text-slate-800 dark:text-slate-100">{c.name}</span>
                        <span className="shrink-0 text-slate-500 dark:text-slate-400">+{c.dial}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </PopoverContent>
          </Popover>
          <Input
            inputMode="numeric"
            autoComplete="tel-national"
            value={nationalDigits}
            onChange={e =>
              setNationalDigits(e.target.value.replace(/\D/g, '').slice(0, selectedCountry.nationalMaxLen))
            }
            placeholder={selectedCountry.placeholder}
            className="min-w-0 flex-1"
            maxLength={selectedCountry.nationalMaxLen}
          />
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {selectedCountry.name} · +{selectedCountry.dial} · {selectedCountry.nationalMinLen === selectedCountry.nationalMaxLen
            ? `${selectedCountry.nationalMinLen} digits`
            : `${selectedCountry.nationalMinLen}–${selectedCountry.nationalMaxLen} digits`}
        </p>
      </div>

      {requireTerms && (
        <div className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input
            id="driver-signup-terms"
            type="checkbox"
            checked={termsAccepted}
            onChange={e => setTermsAccepted(e.target.checked)}
            className="mt-1 size-4 shrink-0 cursor-pointer rounded border-slate-300"
          />
          <label htmlFor="driver-signup-terms" className="cursor-pointer leading-snug">
            I have read and accept the{' '}
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">Privacy Policy</span> and{' '}
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">Terms &amp; Conditions</span>.
          </label>
        </div>
      )}

      {/* Native button avoids Radix/shadcn layering quirks; keep above any stray overlays */}
      <button
        type="button"
        disabled={loading}
        onClick={() => openChannelModal()}
        className="relative z-10 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition-all hover:from-emerald-500 hover:to-teal-500 disabled:cursor-not-allowed disabled:opacity-50"
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
        className="relative z-10 w-full cursor-pointer text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
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
              className="absolute inset-0 bg-black/55 dark:bg-black/70"
              aria-label="Close"
              disabled={loading}
              onClick={() => !loading && setChannelModalOpen(false)}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="driver-otp-channel-title"
              className="relative z-[201] w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
            >
              {error && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                  {error}
                </div>
              )}
              <div className="mb-4 flex items-start justify-between gap-2">
                <div>
                  <h2 id="driver-otp-channel-title" className="text-lg font-semibold text-slate-900 dark:text-white">
                    Send OTP
                  </h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">How should we send the code?</p>
                </div>
                <button
                  type="button"
                  className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40 dark:hover:bg-slate-800 dark:hover:text-slate-100"
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
                      ? 'border-emerald-600 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-950/40'
                      : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40'
                  }`}
                >
                  <MessageCircle className="h-8 w-8 text-emerald-600" />
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">WhatsApp</span>
                </button>
                <button
                  type="button"
                  onClick={() => setChannel('sms')}
                  className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-colors ${
                    channel === 'sms'
                      ? 'border-sky-600 bg-sky-50 dark:border-sky-500 dark:bg-sky-950/40'
                      : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40'
                  }`}
                >
                  <Smartphone className="h-8 w-8 text-sky-600" />
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">SMS</span>
                </button>
              </div>
              <div className="mt-6">
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
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
