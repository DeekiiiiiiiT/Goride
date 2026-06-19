import React, { useState } from 'react';
import { ArrowRight, ChevronDown, Eye, EyeOff, Loader2, Mail } from 'lucide-react';
import { LegalPolicyAcceptanceLabel } from '@roam/ui';
import { supabase } from '../../utils/supabase/client';
import { getHaulAuthRedirectUrl } from '../../utils/haulAuthRedirect';
import { HaulAuthAtmosphere } from './HaulAuthAtmosphere';
import {
  haulAuthCard,
  haulErrorBox,
  haulFieldLabel,
  haulInput,
  haulInputWrap,
  haulPrimaryBtn,
} from './haulAuthUi';

export type CreateAccountResult =
  | { kind: 'phone'; phoneE164: string }
  | { kind: 'email'; email: string; needsConfirmation: boolean }
  | { kind: 'session' };

type Props = {
  onSuccess: (result: CreateAccountResult) => void;
  onLogin: () => void;
};

function formatNationalPhone(digits: string): string {
  const d = digits.replace(/\D/g, '').slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

function toJamaicaE164(nationalDigits: string): string {
  const d = nationalDigits.replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return `+1${d}`;
}

export function HaulCreateAccountScreen({ onSuccess, onLogin }: Props) {
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usePhone = phone.replace(/\D/g, '').length >= 7;
  const useEmail = email.trim().length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!termsAccepted) {
      setError('Please accept the Terms and Privacy Policy to continue.');
      return;
    }

    if (!usePhone && !useEmail) {
      setError('Enter a phone number or email address.');
      return;
    }

    if (useEmail && password.length < 6) {
      setError('Use at least 6 characters for your password.');
      return;
    }

    setLoading(true);
    try {
      if (usePhone && !useEmail) {
        const phoneE164 = toJamaicaE164(phone);
        const { error: otpErr } = await supabase.auth.signInWithOtp({ phone: phoneE164 });
        if (otpErr) throw otpErr;
        onSuccess({ kind: 'phone', phoneE164 });
        return;
      }

      const trimmedEmail = email.trim();
      const redirect = getHaulAuthRedirectUrl();
      const { data, error: signErr } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          data: { surface: 'hauler' },
          emailRedirectTo: redirect,
        },
      });
      if (signErr) throw signErr;

      if (data.session) {
        onSuccess({ kind: 'session' });
        return;
      }

      if (data.user && (!data.user.identities || data.user.identities.length === 0)) {
        setError('An account with this email already exists. Try logging in instead.');
        return;
      }

      onSuccess({ kind: 'email', email: trimmedEmail, needsConfirmation: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not create account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center bg-[#0b1326] p-4 text-[#dae2fd] antialiased md:p-12">
      <HaulAuthAtmosphere />

      <main className={haulAuthCard}>
        <header className="flex flex-col items-center gap-2 text-center">
          <div className="mb-1 flex h-16 w-16 items-center justify-center rounded-lg border border-[#534434] bg-[#2d3449]">
            <span className="material-symbols-outlined text-[32px] text-[#ffc174]" style={{ fontVariationSettings: "'FILL' 1" }}>
              local_shipping
            </span>
          </div>
          <h1 className="text-[28px] leading-9 font-bold tracking-tight text-[#dae2fd] md:text-[32px]">
            Create your account
          </h1>
          <p className="text-base text-[#d8c3ad]">Secure access to premium independent freight.</p>
        </header>

        {error ? <div className={haulErrorBox}>{error}</div> : null}

        <form className="flex flex-col gap-4" onSubmit={(e) => void handleSubmit(e)}>
          <div className="group flex flex-col gap-1">
            <label className={haulFieldLabel} htmlFor="haul-phone">
              Phone Number
            </label>
            <div className={`${haulInputWrap} flex items-stretch`}>
              <button
                type="button"
                className="flex min-h-11 items-center gap-1 border-r border-[#534434] bg-[#171f33] px-2 hover:bg-[#2d3449]"
                tabIndex={-1}
                aria-hidden
              >
                <span className="text-sm">🇯🇲</span>
                <span className="text-base text-[#dae2fd]">+1</span>
                <ChevronDown className="h-4 w-4 text-[#d8c3ad]" />
              </button>
              <input
                id="haul-phone"
                type="tel"
                className={haulInput}
                placeholder="(555) 000-0000"
                value={phone}
                onChange={(e) => setPhone(formatNationalPhone(e.target.value))}
                autoComplete="tel"
              />
            </div>
          </div>

          <div className="flex items-center gap-4 py-1">
            <div className="h-px flex-1 bg-[#534434]" />
            <span className="text-sm font-medium tracking-widest text-[#d8c3ad] uppercase">or</span>
            <div className="h-px flex-1 bg-[#534434]" />
          </div>

          <div className="group flex flex-col gap-1">
            <label className={haulFieldLabel} htmlFor="haul-email">
              Email Address
            </label>
            <div className={haulInputWrap}>
              <div className="flex items-center pl-4">
                <Mail className="h-5 w-5 text-[#d8c3ad]" aria-hidden />
              </div>
              <input
                id="haul-email"
                type="email"
                className={haulInput}
                placeholder="hauler@roamhaul.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
          </div>

          <div className="group flex flex-col gap-1">
            <label className={haulFieldLabel} htmlFor="haul-password">
              Password
            </label>
            <div className={`${haulInputWrap} relative`}>
              <div className="flex items-center pl-4">
                <span className="material-symbols-outlined text-[20px] text-[#d8c3ad]">lock</span>
              </div>
              <input
                id="haul-password"
                type={showPassword ? 'text' : 'password'}
                className={`${haulInput} pr-12`}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="absolute top-0 right-0 flex h-11 w-11 items-center justify-center text-[#d8c3ad] hover:text-[#dae2fd]"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <div className="mt-1 flex items-start gap-2">
            <input
              id="haul-terms"
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              className="mt-0.5 size-[18px] shrink-0 cursor-pointer rounded border-[#534434] bg-[#0b1326] text-[#f59e0b] focus:ring-[#ffc174]"
            />
            <label htmlFor="haul-terms" className="cursor-pointer text-sm leading-snug text-[#d8c3ad]">
              <LegalPolicyAcceptanceLabel
                beforePrivacy="By continuing, you agree to RoamHaul's "
                privacyClassName="font-medium text-[#ffc174] hover:text-[#ffddb8]"
                termsClassName="font-medium text-[#ffc174] hover:text-[#ffddb8]"
              />
            </label>
          </div>

          <button type="submit" disabled={loading} className={haulPrimaryBtn}>
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
            Continue
            {!loading ? <ArrowRight className="h-5 w-5" /> : null}
          </button>
        </form>

        <div className="border-t border-[#534434]/50 pt-4 text-center">
          <p className="text-sm text-[#d8c3ad]">
            Already have an account?{' '}
            <button type="button" onClick={onLogin} className="font-semibold text-[#ffc174] hover:text-[#ffddb8]">
              Log in
            </button>
          </p>
        </div>
      </main>
    </div>
  );
}
