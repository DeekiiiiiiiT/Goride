import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronRight,
  CircleHelp,
  Contact,
  Gift,
  History,
  Pencil,
  Settings,
  Siren,
  Tag,
} from 'lucide-react';
import { supabase } from '@roam/auth-client';
import type { User as SupabaseUser } from '@supabase/supabase-js';

import {
  formatRoamTagDisplay,
  getMyRoamPassengerTag,
} from '@/services/roamTagEdge';
import {
  CARD_SHADOW,
  ERROR,
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  OUTLINE,
  OUTLINE_VARIANT,
  PAGE_BG,
  PRIMARY,
  SECONDARY,
  SURFACE_CONTAINER,
  SURFACE_LOW,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';

function AccountListRow({
  icon,
  iconClassName,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  iconClassName?: string;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="passenger-row-hover flex w-full items-center justify-between px-5 py-3 text-left transition-colors active:opacity-80"
    >
      <div className="flex items-center gap-3">
        <span className={iconClassName}>{icon}</span>
        <span className="text-sm" style={{ color: ON_SURFACE }}>
          {label}
        </span>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0" style={{ color: OUTLINE_VARIANT }} aria-hidden />
    </button>
  );
}

function GroupCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="overflow-hidden rounded-[20px]"
      style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
    >
      <div className="px-5 py-3">
        <h3 className="text-sm font-bold" style={{ color: ON_SURFACE }}>
          {title}
        </h3>
      </div>
      <div>{children}</div>
    </div>
  );
}

export default function AccountPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [roamTagLabel, setRoamTagLabel] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    void getMyRoamPassengerTag()
      .then((res) => setRoamTagLabel(formatRoamTagDisplay(res.tag.custom_tag_name)))
      .catch(() => setRoamTagLabel(null));
  }, [user?.id]);

  const displayName = useMemo(() => {
    const meta = user?.user_metadata;
    const name = (meta?.name as string | undefined)?.trim();
    if (name) return name;
    return user?.email?.split('@')[0] ?? 'Rider';
  }, [user]);

  const handle = useMemo(() => {
    if (roamTagLabel) return roamTagLabel;
    const meta = user?.user_metadata;
    const username = (meta?.username as string | undefined)?.trim();
    if (username) return username.startsWith('@') ? username : `@${username}`;
    const email = user?.email;
    if (email) return `@${email.split('@')[0]}`;
    return '@rider';
  }, [user, roamTagLabel]);

  const avatarUrl =
    (user?.user_metadata?.avatar_url as string | undefined) ||
    (user?.user_metadata?.picture as string | undefined) ||
    null;

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div
      className="flex min-h-[100dvh] flex-col pb-28"
      style={{ backgroundColor: PAGE_BG, color: ON_SURFACE }}
    >
      <header
        className="sticky top-0 z-[60] flex h-14 w-full items-center justify-between safe-t px-5 shadow-sm"
        style={{ backgroundColor: SURFACE_LOWEST }}
      >
        <button
          type="button"
          onClick={() => navigate('/')}
          className="passenger-row-hover rounded-full p-2 transition-colors active:scale-95"
          style={{ color: PRIMARY }}
          aria-label="Back"
        >
          <ArrowLeft className="h-6 w-6" strokeWidth={2} aria-hidden />
        </button>
        <h1
          className="scale-90 text-center text-xl font-bold tracking-tight"
          style={{ color: PRIMARY }}
        >
          ACCOUNT
        </h1>
        <div className="w-10" aria-hidden />
      </header>

      <main className="mx-auto w-full max-w-xl flex-1 space-y-4 px-5 pt-4 safe-x">
        <section className="flex flex-col items-center space-y-2 text-center">
          <div className="relative">
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
            <div
              className="absolute bottom-0 right-0 flex items-center justify-center rounded-full border-2 p-1"
              style={{
                backgroundColor: PRIMARY,
                borderColor: SURFACE_LOWEST,
                color: '#ffffff',
              }}
              aria-hidden
            >
              <Pencil className="h-3 w-3" strokeWidth={2.5} />
            </div>
          </div>
          <div>
            <h2 className="text-lg font-bold leading-tight" style={{ color: ON_SURFACE }}>
              {displayName}
            </h2>
            <span
              className="mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[12px] lowercase tracking-normal"
              style={{ backgroundColor: SURFACE_LOW, color: ON_SURFACE_VARIANT }}
            >
              {handle}
            </span>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-3">
          <button
            type="button"
            onClick={() => navigate('/account/wallet')}
            className="passenger-row-hover rounded-[20px] p-4 text-left transition-colors active:scale-[0.98]"
            style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
          >
            <div className="mb-2 flex items-start justify-between">
              <div
                className="rounded-lg p-2"
                style={{ backgroundColor: 'rgba(80, 95, 118, 0.1)', color: SECONDARY }}
              >
                <History className="h-5 w-5" aria-hidden />
              </div>
            </div>
            <h3 className="text-sm font-bold" style={{ color: ON_SURFACE }}>
              Wallet
            </h3>
            <p className="text-[13px]" style={{ color: ON_SURFACE_VARIANT }}>
              Balance, payments &amp; history
            </p>
          </button>
        </div>

        <div className="space-y-3">
          <GroupCard title="Contact">
            <AccountListRow
              icon={<Contact className="h-5 w-5" style={{ color: PRIMARY }} />}
              label="Contacts"
              onClick={() => navigate('/account/contacts')}
            />
          </GroupCard>

          <GroupCard title="Safety & Settings">
            <AccountListRow
              icon={<Siren className="h-5 w-5" style={{ color: ERROR }} />}
              label="Emergency Assistance"
              onClick={() => navigate('/account/emergency-assistance')}
            />
            <AccountListRow
              icon={<Settings className="h-5 w-5" style={{ color: ON_SURFACE_VARIANT }} />}
              label="App Settings"
              onClick={() => navigate('/account/settings')}
            />
          </GroupCard>

          <GroupCard title="Promotions & Credits">
            <AccountListRow
              icon={<Tag className="h-5 w-5" style={{ color: PRIMARY }} />}
              label="Roam Tag"
              onClick={() => navigate('/services/roam-tag')}
            />
            <AccountListRow
              icon={<Gift className="h-5 w-5" style={{ color: ON_SURFACE_VARIANT }} />}
              label="Gift Cards"
              onClick={() => navigate('/account/gift-cards')}
            />
            <AccountListRow
              icon={<Tag className="h-5 w-5" style={{ color: ON_SURFACE_VARIANT }} />}
              label="Promo Codes"
              onClick={() => navigate('/account/promo-codes')}
            />
          </GroupCard>

          <div
            className="overflow-hidden rounded-[20px]"
            style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
          >
            <button
              type="button"
              onClick={() => navigate('/account/support')}
              className="passenger-row-hover flex w-full items-center justify-between px-5 py-3 text-left transition-colors"
            >
              <div className="flex items-center gap-3">
                <CircleHelp className="h-5 w-5 shrink-0" style={{ color: ON_SURFACE_VARIANT }} />
                <div>
                  <h3 className="text-sm font-bold" style={{ color: ON_SURFACE }}>
                    Support Center
                  </h3>
                  <p className="text-[12px] leading-tight" style={{ color: ON_SURFACE_VARIANT }}>
                    Help with trips, payments, &amp; safety
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0" style={{ color: OUTLINE_VARIANT }} />
            </button>
          </div>
        </div>

        <div className="px-4 pt-2">
          <button
            type="button"
            onClick={() => void signOut()}
            className="w-full rounded-xl px-6 py-3 text-sm font-bold transition-transform active:scale-95 hover:opacity-90"
            style={{
              backgroundColor: SURFACE_CONTAINER,
              color: ON_SURFACE_VARIANT,
            }}
          >
            Sign Out
          </button>
          <p
            className="mt-4 text-center text-[10px] uppercase tracking-widest opacity-50"
            style={{ color: OUTLINE }}
          >
            App Version 0.1.0
          </p>
        </div>
      </main>
    </div>
  );
}
