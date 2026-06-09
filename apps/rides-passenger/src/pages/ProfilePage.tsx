import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BadgeCheck, Loader2, Mail, Phone, Tag, User } from 'lucide-react';
import { supabase } from '@roam/auth-client';
import type { User as SupabaseUser } from '@supabase/supabase-js';

import { formatGuestPhoneDisplay } from '@/lib/guestRecipientBooking';
import {
  CARD_SHADOW,
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  OUTLINE,
  PAGE_BG,
  PRIMARY,
  SURFACE_LOW,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';
import { getMyPassengerProfile } from '@/services/passengerProfileEdge';
import { formatRoamTagDisplay, getMyRoamPassengerTag } from '@/services/roamTagEdge';

function ProfileField({
  icon,
  label,
  value,
  trailing,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="px-5 py-4">
      <div className="mb-1 flex items-center gap-2">
        <span style={{ color: ON_SURFACE_VARIANT }}>{icon}</span>
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: ON_SURFACE_VARIANT }}>
          {label}
        </span>
      </div>
      <div className="flex items-center gap-2 pl-7">
        <p className="text-sm font-medium break-all" style={{ color: ON_SURFACE }}>
          {value}
        </p>
        {trailing}
      </div>
    </div>
  );
}

function formatPhoneE164(phone: string | null | undefined): string | null {
  if (!phone?.trim()) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 ${formatGuestPhoneDisplay(digits.slice(1))}`;
  }
  if (digits.length === 10) {
    return `+1 ${formatGuestPhoneDisplay(digits)}`;
  }
  return phone;
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<SupabaseUser | null>(null);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const { data: profileData, isLoading: profileLoading } = useQuery({
    queryKey: ['passenger-profile'],
    queryFn: getMyPassengerProfile,
  });

  const { data: tagData, isLoading: tagLoading } = useQuery({
    queryKey: ['roam-passenger-tag'],
    queryFn: getMyRoamPassengerTag,
  });

  const profile = profileData?.profile;
  const roamTag = formatRoamTagDisplay(tagData?.tag.custom_tag_name);

  const displayName = useMemo(() => {
    const fromProfile = profile?.display_name?.trim();
    if (fromProfile) return fromProfile;
    const meta = user?.user_metadata;
    const name = (meta?.name as string | undefined)?.trim();
    if (name) return name;
    return user?.email?.split('@')[0] ?? 'Rider';
  }, [profile?.display_name, user]);

  const email = user?.email?.trim() || 'Not set';
  const phone = formatPhoneE164(profile?.phone_e164) ?? 'Not set';

  const avatarUrl =
    (user?.user_metadata?.avatar_url as string | undefined) ||
    (user?.user_metadata?.picture as string | undefined) ||
    null;

  const loading = profileLoading || tagLoading;

  return (
    <div className="flex min-h-[100dvh] flex-col pb-28" style={{ backgroundColor: PAGE_BG, color: ON_SURFACE }}>
      <header
        className="sticky top-0 z-50 flex h-14 items-center px-4 safe-t"
        style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
      >
        <button
          type="button"
          onClick={() => navigate('/account')}
          className="rounded-full p-2"
          style={{ color: PRIMARY }}
          aria-label="Back"
        >
          <ArrowLeft className="h-6 w-6" />
        </button>
        <h1 className="ml-2 text-xl font-semibold" style={{ color: PRIMARY }}>
          Profile
        </h1>
      </header>

      <main className="mx-auto w-full max-w-xl flex-1 space-y-4 px-5 py-4 safe-x">
        <section className="flex flex-col items-center space-y-2 text-center">
          <div
            className="h-20 w-20 overflow-hidden rounded-full border-4"
            style={{
              borderColor: SURFACE_LOWEST,
              boxShadow: CARD_SHADOW,
              backgroundColor: SURFACE_LOW,
            }}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div
                className="flex h-full w-full items-center justify-center text-2xl font-bold"
                style={{ color: PRIMARY, backgroundColor: '#dbe1ff' }}
              >
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div>
            <h2 className="text-lg font-bold leading-tight" style={{ color: ON_SURFACE }}>
              {displayName}
            </h2>
            {roamTag ? (
              <span
                className="mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[12px] lowercase tracking-normal"
                style={{ backgroundColor: SURFACE_LOW, color: ON_SURFACE_VARIANT }}
              >
                {roamTag}
              </span>
            ) : null}
          </div>
        </section>

        <div
          className="overflow-hidden rounded-[20px] divide-y"
          style={{
            backgroundColor: SURFACE_LOWEST,
            boxShadow: CARD_SHADOW,
            borderColor: OUTLINE,
          }}
        >
          {loading ? (
            <div className="flex items-center justify-center px-5 py-10">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: PRIMARY }} aria-hidden />
              <span className="sr-only">Loading profile</span>
            </div>
          ) : (
            <>
              <ProfileField
                icon={<User className="h-4 w-4" />}
                label="Name"
                value={displayName}
              />
              <ProfileField
                icon={<Mail className="h-4 w-4" />}
                label="Email"
                value={email}
              />
              <ProfileField
                icon={<Phone className="h-4 w-4" />}
                label="Phone"
                value={phone}
                trailing={
                  profile?.phone_verified ? (
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                      style={{ backgroundColor: SURFACE_LOW, color: PRIMARY }}
                    >
                      <BadgeCheck className="h-3 w-3" aria-hidden />
                      Verified
                    </span>
                  ) : null
                }
              />
              <ProfileField
                icon={<Tag className="h-4 w-4" />}
                label="Roam Tag"
                value={roamTag ?? 'Not set'}
              />
            </>
          )}
        </div>
      </main>
    </div>
  );
}
