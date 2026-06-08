import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { PassengerPhoneCountryInput } from '@/components/auth/PassengerPhoneCountryInput';
import { useIpDefaultCountry } from '@/hooks/useIpDefaultCountry';
import { DEFAULT_PHONE_COUNTRY, type PhoneCountry } from '@/utils/phoneCountries';
import { toE164ForCountry } from '@/utils/phoneE164';
import { supabase } from '@roam/auth-client';
import { updateMyPassengerProfile } from '@/services/passengerProfileEdge';
import type { PassengerProfileDto } from '@roam/types/passengerProfile';
import {
  ON_PRIMARY,
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  PAGE_BG,
  PRIMARY,
  PRIMARY_CONTAINER,
  SURFACE_LOW,
} from '@/lib/passengerTheme';

type Props = {
  onComplete: (profile: PassengerProfileDto) => void;
};

export function PassengerPhoneOnboardingWizard({ onComplete }: Props) {
  const { country: ipCountry, geoReady } = useIpDefaultCountry();
  const [selectedCountry, setSelectedCountry] = useState<PhoneCountry>(DEFAULT_PHONE_COUNTRY);
  const geoAppliedRef = useRef(false);
  const [nationalDigits, setNationalDigits] = useState('');
  const [countryMenuOpen, setCountryMenuOpen] = useState(false);
  const [countryFilter, setCountryFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!geoReady || geoAppliedRef.current) return;
    geoAppliedRef.current = true;
    setSelectedCountry(ipCountry);
  }, [geoReady, ipCountry]);

  const handleContinue = async () => {
    setError(null);
    const digits = nationalDigits.replace(/\D/g, '');
    if (digits.length < selectedCountry.nationalMinLen) {
      setError('Enter a valid phone number.');
      return;
    }

    setLoading(true);
    try {
      const phone = toE164ForCountry(selectedCountry, digits);
      const { profile } = await updateMyPassengerProfile({ phone });
      try {
        await supabase.auth.updateUser({
          phone,
          data: { passenger_phone: phone },
        });
      } catch {
        /* auth phone sync is best-effort for email sign-in */
      }
      toast.success('Phone number saved.');
      onComplete(profile);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not save phone number.';
      setError(msg === 'invalid_phone' ? 'Enter a valid phone number.' : msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="flex min-h-[100dvh] flex-col px-5 py-8 safe-x safe-t safe-b"
      style={{ backgroundColor: PAGE_BG, color: ON_SURFACE }}
    >
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6">
        <div className="flex justify-center">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{ backgroundColor: PRIMARY_CONTAINER }}
          >
            <Smartphone className="h-8 w-8" style={{ color: PRIMARY }} aria-hidden />
          </div>
        </div>

        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">Add your phone number</h1>
          <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
            We&apos;ll use this for ride updates. SMS verification is coming soon.
          </p>
        </div>

        {error ? (
          <p className="rounded-xl px-3 py-2 text-center text-sm font-medium text-red-600">{error}</p>
        ) : null}

        <div className="rounded-2xl p-4 [&_label]:text-zinc-800 [&_p]:text-zinc-500" style={{ backgroundColor: SURFACE_LOW }}>
          <PassengerPhoneCountryInput
            showLabel
            label="Phone number"
            selectedCountry={selectedCountry}
            onSelectCountry={setSelectedCountry}
            nationalDigits={nationalDigits}
            onNationalDigitsChange={setNationalDigits}
            countryMenuOpen={countryMenuOpen}
            onCountryMenuOpenChange={setCountryMenuOpen}
            countryFilter={countryFilter}
            onCountryFilterChange={setCountryFilter}
          />
        </div>

        <button
          type="button"
          disabled={loading}
          onClick={() => void handleContinue()}
          className="flex h-14 w-full items-center justify-center rounded-2xl text-base font-semibold disabled:opacity-50"
          style={{ backgroundColor: PRIMARY, color: ON_PRIMARY }}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Saving…
            </>
          ) : (
            'Continue'
          )}
        </button>
      </div>
    </div>
  );
}
