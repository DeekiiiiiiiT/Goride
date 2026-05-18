import React, { useEffect, useRef, useState } from 'react';
import { format, differenceInYears, startOfDay, subYears } from 'date-fns';
import { ArrowLeft, Briefcase, Building2, CalendarIcon, Car, Loader2, Mars, Venus } from 'lucide-react';
import { Button } from '@roam/ui';
import { Input } from '@roam/ui';
import { Label } from '@roam/ui';
import { Checkbox } from '@roam/ui';
import { Calendar } from '@roam/ui';
import { Popover, PopoverContent, PopoverTrigger } from '@roam/ui';
import { cn } from '@roam/ui';
import { supabase } from '../../utils/supabase/client';
import { useAuth } from '../../contexts/AuthContext';
import { useDriver } from '../../contexts/DriverContext';
import { ThemeToggleButton } from '../layout/ThemeToggleButton';
import { DriverPhoneCountryInput } from '../auth/DriverPhoneCountryInput';
import { toE164ForCountry } from '../../utils/phoneE164';
import { DEFAULT_PHONE_COUNTRY, type PhoneCountry } from '../../utils/phoneCountries';
import { useIpDefaultCountry } from '../../hooks/useIpDefaultCountry';
import { listenForSmsOtp } from '../../utils/webOtp';
import { formatPhoneAuthError, getAuthErrorMessage } from '../../utils/supabaseAuthErrors';
import { saveDriverOnboardingProfile } from '../../utils/saveDriverProfile';
import { api } from '../../services/api';
import {
  GOOGLE_ONBOARDING_ARCHETYPE,
  GOOGLE_ONBOARDING_PHONE,
  defaultRoamFleetSignupUrl,
} from '../../utils/googleDriverSignup';

type Gender = 'male' | 'female';

type Ui =
  | 'demographics'
  | 'phone'
  | 'verify'
  | 'celebrate'
  | 'archetype'
  | 'fleet_join'
  | 'fleet_owner_cta';

const MIN_DRIVER_AGE = 18;

export function DriverGoogleSignupWizard() {
  const { user, signOut } = useAuth();
  const { profile, refreshProfile } = useDriver();
  const { country: ipCountry, geoReady } = useIpDefaultCountry();
  const geoAppliedRef = useRef(false);
  const [hasManualCountry, setHasManualCountry] = useState(false);

  const [ui, setUi] = useState<Ui>('demographics');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dob, setDob] = useState<Date | undefined>(undefined);
  const [dobOpen, setDobOpen] = useState(false);
  const [gender, setGender] = useState<Gender | null>(null);
  const [certified, setCertified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [selectedCountry, setSelectedCountry] = useState<PhoneCountry>(DEFAULT_PHONE_COUNTRY);
  const [countryMenuOpen, setCountryMenuOpen] = useState(false);
  const [countryFilter, setCountryFilter] = useState('');
  const [nationalDigits, setNationalDigits] = useState('');
  const [e164Target, setE164Target] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const webOtpAbortRef = useRef<AbortController | null>(null);

  const [fleetId, setFleetId] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);

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
    if (ui !== 'verify' || !e164Target) return;
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
  }, [ui, e164Target]);

  useEffect(() => {
    if (!profile) {
      setUi('demographics');
      return;
    }
    if (profile.onboardingStep === GOOGLE_ONBOARDING_ARCHETYPE) {
      setUi(prev => {
        if (prev === 'celebrate' || prev === 'verify' || prev === 'fleet_join' || prev === 'fleet_owner_cta') return prev;
        return 'archetype';
      });
      return;
    }
    if (profile.onboardingStep === GOOGLE_ONBOARDING_PHONE) {
      setUi(prev => (prev === 'verify' || prev === 'celebrate' ? prev : 'phone'));
    }
  }, [profile?.id, profile?.onboardingStep]);

  const sendPhoneChangeOtp = async (phone: string) => {
    setLoading(true);
    setError(null);
    try {
      const { error: upErr } = await supabase.auth.updateUser({ phone });
      if (upErr) throw upErr;
      setE164Target(phone);
      setUi('verify');
      setOtp('');
      setResendIn(45);
    } catch (err: unknown) {
      const msg = getAuthErrorMessage(err, 'Could not send verification SMS.');
      setError(formatPhoneAuthError(msg));
    } finally {
      setLoading(false);
    }
  };

  const handleResendPhoneOtp = async () => {
    if (!e164Target || resendIn > 0) return;
    await sendPhoneChangeOtp(e164Target);
  };

  const handleDemographics = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!firstName.trim() || !lastName.trim()) {
      setError('Please enter your first and last name.');
      return;
    }
    if (!dob) {
      setError('Please select your date of birth.');
      return;
    }
    if (differenceInYears(new Date(), dob) < MIN_DRIVER_AGE) {
      setError(`You must be at least ${MIN_DRIVER_AGE} years old.`);
      return;
    }
    if (!gender) {
      setError('Please select your gender.');
      return;
    }
    if (!certified) {
      setError('Please confirm that your information is accurate.');
      return;
    }
    if (!user) return;

    setLoading(true);
    try {
      const displayName = `${firstName.trim()} ${lastName.trim()}`;
      const dobStr = format(dob, 'yyyy-MM-dd');

      await saveDriverOnboardingProfile(user, profile, {
        display_name: displayName,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        date_of_birth: dobStr,
        gender,
        onboarding_complete: false,
        onboarding_step: GOOGLE_ONBOARDING_PHONE,
      });

      await refreshProfile();
      setUi('phone');
    } catch (err: unknown) {
      setError(getAuthErrorMessage(err, 'Could not save your profile.'));
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneContinue = async () => {
    setError(null);
    try {
      const phone = toE164ForCountry(selectedCountry, nationalDigits);
      await sendPhoneChangeOtp(phone);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid phone number.');
    }
  };

  const handleVerifyPhone = async () => {
    const token = otp.replace(/\D/g, '');
    if (!e164Target || token.length < 4) {
      setError('Enter the verification code from your SMS.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { error: vErr } = await supabase.auth.verifyOtp({
        phone: e164Target,
        token,
        type: 'phone_change',
      });
      if (vErr) throw vErr;

      const { error: upErr } = await supabase
        .from('driver_profiles')
        .update({
          phone: e164Target,
          onboarding_step: GOOGLE_ONBOARDING_ARCHETYPE,
        })
        .eq('user_id', user!.id);
      if (upErr) throw upErr;

      setUi('celebrate');
      await refreshProfile();
    } catch (err: unknown) {
      const msg = getAuthErrorMessage(err, 'Verification failed.');
      setError(formatPhoneAuthError(msg));
    } finally {
      setLoading(false);
    }
  };

  const finishIndependent = async () => {
    if (!profile?.id) return;
    setLoading(true);
    setError(null);
    try {
      const { error: upErr } = await supabase
        .from('driver_profiles')
        .update({
          mode: 'independent',
          fleet_id: null,
          onboarding_complete: true,
          onboarding_step: null,
        })
        .eq('id', profile.id);
      if (upErr) throw upErr;
      await refreshProfile();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not finish signup.');
    } finally {
      setLoading(false);
    }
  };

  const finishFleetOwner = async () => {
    if (!profile?.id) return;
    setLoading(true);
    setError(null);
    try {
      const { error: metaErr } = await supabase.auth.updateUser({
        data: { signup_intent: 'fleet_owner' },
      });
      if (metaErr) throw metaErr;
      const { error: upErr } = await supabase
        .from('driver_profiles')
        .update({
          mode: 'independent',
          onboarding_complete: true,
          onboarding_step: null,
        })
        .eq('id', profile.id);
      if (upErr) throw upErr;
      await refreshProfile();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinFleet = async () => {
    setJoinError(null);
    const id = fleetId.trim();
    if (!id) {
      setJoinError('Enter your fleet organization ID.');
      return;
    }
    setLoading(true);
    try {
      await api.joinFleetByFleetId(id);
      const { error: upErr } = await supabase
        .from('driver_profiles')
        .update({
          onboarding_complete: true,
          onboarding_step: null,
        })
        .eq('id', profile!.id);
      if (upErr) console.warn('post-join onboarding flag:', upErr);
      await refreshProfile();
    } catch (e: unknown) {
      setJoinError(e instanceof Error ? e.message : 'Could not join fleet.');
    } finally {
      setLoading(false);
    }
  };

  const shellHeader = (
    <div className="flex justify-between px-4 pt-4">
      <button
        type="button"
        onClick={() => void signOut()}
        className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
      >
        <ArrowLeft className="h-4 w-4" />
        Sign out
      </button>
      <ThemeToggleButton />
    </div>
  );

  if (ui === 'celebrate') {
    return (
      <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-100 via-white to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
        {shellHeader}
        <div className="flex flex-1 flex-col items-center justify-center px-4 pb-12">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white/90 p-8 text-center shadow-xl dark:border-slate-700/60 dark:bg-slate-800/60">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/50">
              <Car className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">You&apos;re almost there</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Your phone is verified. Next, tell us how you plan to use Roam Driver.
            </p>
            <Button type="button" className="mt-6 w-full bg-gradient-to-r from-emerald-600 to-teal-600" onClick={() => setUi('archetype')}>
              Continue
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (ui === 'archetype') {
    return (
      <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-100 via-white to-slate-100 px-4 py-10 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
        {shellHeader}
        <div className="mx-auto w-full max-w-sm">
          <h1 className="text-center text-2xl font-bold tracking-tight text-slate-900 dark:text-white">How do you drive?</h1>
          <p className="mt-2 text-center text-sm text-slate-600 dark:text-slate-300">Choose one to finish setup.</p>
          <div className="mt-8 grid gap-4">
            <button
              type="button"
              disabled={loading}
              onClick={() => void finishIndependent()}
              className="flex flex-col items-start gap-2 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-emerald-500/40 hover:shadow-md disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800/80 dark:hover:border-emerald-500/30"
            >
              <Car className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
              <span className="text-base font-semibold text-slate-900 dark:text-white">Independent driver</span>
              <span className="text-sm text-slate-600 dark:text-slate-300">I drive on my own.</span>
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => setUi('fleet_join')}
              className="flex flex-col items-start gap-2 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-emerald-500/40 hover:shadow-md disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800/80 dark:hover:border-emerald-500/30"
            >
              <Building2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
              <span className="text-base font-semibold text-slate-900 dark:text-white">Join a fleet</span>
              <span className="text-sm text-slate-600 dark:text-slate-300">I have a fleet organization ID.</span>
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setError(null);
                setUi('fleet_owner_cta');
              }}
              className="flex flex-col items-start gap-2 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-emerald-500/40 hover:shadow-md disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800/80 dark:hover:border-emerald-500/30"
            >
              <Briefcase className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
              <span className="text-base font-semibold text-slate-900 dark:text-white">Fleet operator / owner</span>
              <span className="text-sm text-slate-600 dark:text-slate-300">I manage drivers and want the fleet portal.</span>
            </button>
          </div>
          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
              {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (ui === 'fleet_join') {
    return (
      <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-100 via-white to-slate-100 px-4 py-10 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
        {shellHeader}
        <div className="mx-auto w-full max-w-sm">
          <h1 className="text-center text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Join your fleet</h1>
          <p className="mt-2 text-center text-sm text-slate-600 dark:text-slate-300">Paste the organization ID your fleet admin shared.</p>
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-xl dark:border-slate-700/60 dark:bg-slate-800/60">
            {joinError && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                {joinError}
              </div>
            )}
            <Label htmlFor="g-fleet-org">Fleet organization ID</Label>
            <Input
              id="g-fleet-org"
              value={fleetId}
              onChange={e => setFleetId(e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="mt-2 font-mono text-sm"
              autoComplete="off"
            />
            <div className="mt-6 flex flex-col gap-2">
              <Button type="button" className="w-full" disabled={loading} onClick={() => void handleJoinFleet()}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Join fleet'}
              </Button>
              <Button type="button" variant="ghost" className="w-full" disabled={loading} onClick={() => setUi('archetype')}>
                Back
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (ui === 'fleet_owner_cta') {
    const url = defaultRoamFleetSignupUrl();
    return (
      <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-100 via-white to-slate-100 px-4 py-10 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
        {shellHeader}
        <div className="mx-auto w-full max-w-sm">
          <h1 className="text-center text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Roam Fleet</h1>
          <p className="mt-2 text-center text-sm text-slate-600 dark:text-slate-300">
            Create and manage your organization in the Roam Fleet portal. Your driver profile here stays available if you also drive.
          </p>
          <div className="mt-8 space-y-3 rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-xl dark:border-slate-700/60 dark:bg-slate-800/60">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center rounded-lg border border-emerald-600 bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-500"
            >
              Open fleet signup
            </a>
            <Button type="button" variant="secondary" className="w-full" disabled={loading} onClick={() => void finishFleetOwner()}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Continue to driver app'}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => setUi('archetype')}>
              Back
            </Button>
          </div>
          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
              {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (ui === 'verify' && e164Target) {
    return (
      <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-100 via-white to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
        {shellHeader}
        <div className="flex flex-1 flex-col items-center px-4 pb-12 pt-6">
          <div className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-xl dark:border-slate-700/60 dark:bg-slate-800/60">
            {error && (
              <div className="whitespace-pre-line rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                {error}
              </div>
            )}
            <div>
              <Label className="text-slate-800 dark:text-slate-200">Verification code</Label>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Enter the code we sent to {e164Target} via SMS.</p>
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
            <Button type="button" className="w-full bg-gradient-to-r from-emerald-600 to-teal-600" disabled={loading} onClick={() => void handleVerifyPhone()}>
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
                onClick={() => void handleResendPhoneOtp()}
              >
                {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
              </button>
              <button
                type="button"
                className="text-slate-500 hover:text-slate-800 dark:text-slate-400"
                onClick={() => {
                  setUi('phone');
                  setOtp('');
                  setError(null);
                }}
              >
                Change number
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (ui === 'phone') {
    return (
      <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-100 via-white to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
        {shellHeader}
        <div className="flex flex-1 flex-col items-center px-4 pb-12 pt-6">
          <div className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-xl dark:border-slate-700/60 dark:bg-slate-800/60">
            <div className="text-center">
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">Verify your phone</h1>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">We&apos;ll send a code by SMS to confirm your number.</p>
            </div>
            {error && (
              <div className="whitespace-pre-line rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                {error}
              </div>
            )}
            <DriverPhoneCountryInput
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
            <Button type="button" className="w-full bg-gradient-to-r from-emerald-600 to-teal-600" disabled={loading} onClick={() => void handlePhoneContinue()}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending…
                </>
              ) : (
                'Send SMS code'
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-100 via-white to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      {shellHeader}
      <div className="flex flex-1 flex-col items-center px-4 pb-12 pt-6">
        <div className="w-full max-w-sm space-y-4">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">About you</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">A few details to finish your driver account.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-xl dark:border-slate-700/60 dark:bg-slate-800/60">
            <form onSubmit={e => void handleDemographics(e)} className="space-y-4">
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                  {error}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="g-fn">First name</Label>
                  <Input id="g-fn" value={firstName} onChange={e => setFirstName(e.target.value)} className="mt-1.5" autoComplete="given-name" />
                </div>
                <div>
                  <Label htmlFor="g-ln">Last name</Label>
                  <Input id="g-ln" value={lastName} onChange={e => setLastName(e.target.value)} className="mt-1.5" autoComplete="family-name" />
                </div>
              </div>
              <div>
                <Label>Date of birth</Label>
                <Popover open={dobOpen} onOpenChange={setDobOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn('mt-1.5 w-full justify-start text-left font-normal', !dob && 'text-muted-foreground')}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dob ? format(dob, 'PPP') : 'Select date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto min-w-[288px] p-0" align="start">
                    <Calendar
                      mode="single"
                      captionLayout="dropdown-buttons"
                      fromYear={1920}
                      toYear={new Date().getFullYear() - MIN_DRIVER_AGE}
                      selected={dob}
                      onSelect={d => {
                        setDob(d);
                        setDobOpen(false);
                      }}
                      disabled={date =>
                        date > startOfDay(subYears(new Date(), MIN_DRIVER_AGE)) ||
                        date < new Date('1920-01-01')
                      }
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Gender</p>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setGender('male')}
                    className={cn(
                      'flex flex-col items-center gap-1.5 rounded-2xl border-2 py-3 text-xs font-semibold transition-colors sm:text-sm',
                      gender === 'male'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100'
                        : 'border-slate-200 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-900/50 dark:text-slate-200'
                    )}
                  >
                    <Mars className="h-5 w-5 text-sky-600 dark:text-sky-400" aria-hidden />
                    Male
                  </button>
                  <button
                    type="button"
                    onClick={() => setGender('female')}
                    className={cn(
                      'flex flex-col items-center gap-1.5 rounded-2xl border-2 py-3 text-xs font-semibold transition-colors sm:text-sm',
                      gender === 'female'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100'
                        : 'border-slate-200 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-900/50 dark:text-slate-200'
                    )}
                  >
                    <Venus className="h-5 w-5 text-pink-600 dark:text-pink-400" aria-hidden />
                    Female
                  </button>
                </div>
              </div>
              <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                <Checkbox checked={certified} onCheckedChange={v => setCertified(v === true)} className="mt-0.5" />
                <span>I certify that the information I provided is true and complete to the best of my knowledge.</span>
              </label>
              <Button type="submit" className="w-full bg-gradient-to-r from-emerald-600 to-teal-600" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  'Continue'
                )}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
