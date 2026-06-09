import React, { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { supabase } from '@roam/auth-client';
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

/** Profile survives ride ↔ home navigation so minimize does not re-trigger splash. */
let cachedPassengerProfile: PassengerProfileDto | null = null;
let profileLoadPromise: Promise<PassengerProfileDto | null> | null = null;

async function loadPassengerProfileOnce(): Promise<PassengerProfileDto | null> {
  if (cachedPassengerProfile) return cachedPassengerProfile;
  if (profileLoadPromise) return profileLoadPromise;

  profileLoadPromise = (async () => {
    try {
      const { profile: p } = await ensurePassengerProfile();
      cachedPassengerProfile = p;
      return p;
    } catch {
      try {
        const { profile: p } = await getMyPassengerProfile();
        cachedPassengerProfile = p;
        return p;
      } catch {
        const { data: { user } } = await supabase.auth.getUser();
        const fallback = user ? profileFromAuthUser(user) : null;
        cachedPassengerProfile = fallback;
        return fallback;
      }
    } finally {
      profileLoadPromise = null;
    }
  })();

  return profileLoadPromise;
}

export function AuthenticatedPassengerRoute() {
  const [loading, setLoading] = useState(!cachedPassengerProfile);
  const [profile, setProfile] = useState<PassengerProfileDto | null>(cachedPassengerProfile);

  useEffect(() => {
    let cancelled = false;
    void loadPassengerProfileOnce().then((p) => {
      if (cancelled) return;
      setProfile(p);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        cachedPassengerProfile = null;
      }
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return <SplashScreen />;
  }

  if (needsPassengerPhoneOnboarding(profile)) {
    return (
      <PassengerPhoneOnboardingWizard
        onComplete={(saved) => {
          cachedPassengerProfile = saved;
          setProfile(saved);
        }}
      />
    );
  }

  return <Outlet />;
}
