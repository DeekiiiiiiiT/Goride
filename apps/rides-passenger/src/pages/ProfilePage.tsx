import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BadgeCheck, Loader2, Mail, Phone, Tag, User } from 'lucide-react';
import { supabase } from '@roam/auth-client';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { cn } from '@roam/ui';

import { formatGuestPhoneDisplay } from '@/lib/guestRecipientBooking';
import { PAGE_BG } from '@/lib/passengerTheme';
import { getMyPassengerProfile } from '@/services/passengerProfileEdge';
import { formatRoamTagDisplay, getMyRoamPassengerTag } from '@/services/roamTagEdge';

const PROFILE_PRIMARY = '#00a86b';

function ProfileFieldRow({
  icon,
  label,
  value,
  trailing,
  valueClassName,
  isLast = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  trailing?: React.ReactNode;
  valueClassName?: string;
  isLast?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-start p-5',
        !isLast && 'border-b border-gray-50 dark:border-slate-800/80',
      )}
    >
      <div className="mr-4 mt-1 text-gray-500 dark:text-slate-400">{icon}</div>
      <div className="min-w-0 flex-1">
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400">
          {label}
        </span>
        <div className="flex items-center justify-between gap-3">
          <span
            className={cn(
              'break-all text-base font-semibold text-gray-900 dark:text-white',
              valueClassName,
            )}
          >
            {value}
          </span>
          {trailing}
        </div>
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
  const { t } = useTranslation('profile');
  const { t: ta } = useTranslation('account');
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
    return user?.email?.split('@')[0] ?? ta('defaultRiderName');
  }, [profile?.display_name, user, ta]);

  const email = user?.email?.trim() || t('notSet');
  const phone = formatPhoneE164(profile?.phone_e164) ?? t('notSet');

  const avatarUrl =
    (user?.user_metadata?.avatar_url as string | undefined) ||
    (user?.user_metadata?.picture as string | undefined) ||
    null;

  const loading = profileLoading || tagLoading;

  return (
    <div
      className="flex min-h-[100dvh] flex-col pb-28"
      style={{ backgroundColor: PAGE_BG, color: 'var(--passenger-on-surface)' }}
    >
      <header className="sticky top-0 z-10 flex items-center border-b border-gray-100 bg-white px-6 py-4 safe-t dark:border-slate-800 dark:bg-slate-900">
        <button
          type="button"
          onClick={() => navigate('/account')}
          className="-ml-2 rounded-full p-1 transition-transform active:scale-95"
          style={{ color: PROFILE_PRIMARY }}
          aria-label={t('backAria')}
        >
          <ArrowLeft className="h-6 w-6" strokeWidth={2.5} />
        </button>
        <h1 className="ml-4 text-xl font-bold tracking-tight text-gray-900 dark:text-white">{t('title')}</h1>
      </header>

      <main className="mx-auto w-full max-w-xl flex-1 safe-x">
        <section className="flex flex-col items-center px-6 pb-6 pt-8">
          <div className="mb-4 flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-[#dbdad9] shadow-sm dark:border-slate-800 dark:bg-slate-700">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-3xl font-semibold text-gray-600 dark:text-slate-300">
                {displayName.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <h2 className="text-2xl font-extrabold text-gray-900 dark:text-white">{displayName}</h2>
          {roamTag ? (
            <p className="mt-1 font-medium text-gray-500 dark:text-slate-400">{roamTag}</p>
          ) : null}
        </section>

        <section className="px-5">
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] dark:border-slate-800 dark:bg-slate-900">
            {loading ? (
              <div className="flex items-center justify-center px-5 py-12">
                <Loader2 className="h-6 w-6 animate-spin" style={{ color: PROFILE_PRIMARY }} aria-hidden />
                <span className="sr-only">{t('loadingAria')}</span>
              </div>
            ) : (
              <>
                <ProfileFieldRow
                  icon={<User className="h-5 w-5" strokeWidth={2} />}
                  label={t('name')}
                  value={displayName}
                />
                <ProfileFieldRow
                  icon={<Mail className="h-5 w-5" strokeWidth={2} />}
                  label={t('email')}
                  value={email}
                />
                <ProfileFieldRow
                  icon={<Phone className="h-5 w-5" strokeWidth={2} />}
                  label={t('phone')}
                  value={phone}
                  trailing={
                    profile?.phone_verified ? (
                      <div className="flex shrink-0 items-center rounded-full bg-[#00a86b]/10 px-2 py-0.5">
                        <BadgeCheck className="mr-1 h-3 w-3" style={{ color: PROFILE_PRIMARY }} aria-hidden />
                        <span
                          className="text-[10px] font-bold uppercase"
                          style={{ color: PROFILE_PRIMARY }}
                        >
                          {t('verified')}
                        </span>
                      </div>
                    ) : null
                  }
                />
                <ProfileFieldRow
                  icon={<Tag className="h-5 w-5" strokeWidth={2} />}
                  label={t('roamTag')}
                  value={roamTag ?? t('notSet')}
                  valueClassName={roamTag ? 'text-[#00a86b]' : undefined}
                  isLast
                />
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
