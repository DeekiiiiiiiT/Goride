import React, { useEffect, useState } from 'react';
import { supabase } from '@roam/auth-client';
import { PassengerShell } from '@/components/layout/PassengerShell';
import { PassengerPhoneOnboardingWizard } from '@/components/onboarding/PassengerPhoneOnboardingWizard';
import { SplashScreen } from '@/components/layout/SplashScreen';
import {
  ensurePassengerProfile,
  getMyPassengerProfile,
  needsPassengerPhoneOnboarding,
} from '@/services/passengerProfileEdge';
import type { PassengerProfileDto } from '@roam/types/passengerProfile';

function profileFromAuthUser(user: {
  phone?: string | null;
  user_metadata?: Record<string, unknown>;
}): PassengerProfileDto | null {
  const authPhone = user.phone?.trim();
  const metaPhone = typeof user.user_metadata?.passenger_phone === 'string'
    ? user.user_metadata.passenger_phone.trim()
    : '';
  const phone = authPhone || metaPhone || null;
  if (!phone) return null;
  return {
    display_name: null,
    phone_e164: phone,
    phone_on_file: true,
    phone_verified: true,
  };
}

export function AuthenticatedPassengerRoute() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<PassengerProfileDto | null>(null);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const { profile: p } = await ensurePassengerProfile();
      setProfile(p);
      return;
    } catch {
      try {
        const { profile: p } = await getMyPassengerProfile();
        setProfile(p);
        return;
      } catch {
        const { data: { user } } = await supabase.auth.getUser();
        setProfile(user ? profileFromAuthUser(user) : null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProfile();
  }, []);

  if (loading) {
    return <SplashScreen />;
  }

  if (needsPassengerPhoneOnboarding(profile)) {
    return (
      <PassengerPhoneOnboardingWizard
        onComplete={(saved) => {
          setProfile(saved);
          void loadProfile();
        }}
      />
    );
  }

  return <PassengerShell />;
}
