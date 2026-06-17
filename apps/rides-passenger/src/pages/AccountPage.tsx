import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ChevronRight,
  Contact,
  Gift,
  Headphones,
  LogOut,
  Pencil,
  Settings,
  Shield,
  User,
  Wallet,
} from 'lucide-react';
import { supabase } from '@roam/auth-client';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import type { WalletBalanceDto } from '@roam/types/rides';
import { formatMoneyMinorPlain } from '@roam/types/rides';

import {
  formatRoamTagDisplay,
  getMyRoamPassengerTag,
} from '@/services/roamTagEdge';
import { walletGetBalance } from '@/services/walletEdge';
import { WALLET_BALANCE_CHANGED_EVENT } from '@/lib/walletEvents';
import { useDefaultPaymentMethod } from '@/hooks/useDefaultPaymentMethod';
import { useAppVersionInfo } from '@/hooks/useAppVersionLabel';
import {
  ERROR,
  INVERSE_SURFACE,
  ON_PRIMARY,
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  OUTLINE,
  OUTLINE_VARIANT,
  PAGE_BG,
  PRIMARY,
  PRIMARY_CONTAINER,
  PRIMARY_FIXED,
  SECONDARY,
} from '@/lib/passengerTheme';

function ComingSoonBadge({ label }: { label: string }) {
  return (
    <span
      className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--passenger-secondary) 12%, transparent)',
        color: SECONDARY,
      }}
    >
      {label}
    </span>
  );
}

function BentoCard({
  className = '',
  style,
  onClick,
  children,
}: {
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={style}
      className={`account-glass-card account-bento-card rounded-xl p-4 text-left passenger-row-hover ${className}`}
    >
      {children}
    </button>
  );
}

export default function AccountPage() {
  const { t } = useTranslation('account');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const { selectedMethod } = useDefaultPaymentMethod();
  const appVersionInfo = useAppVersionInfo();
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [roamTagLabel, setRoamTagLabel] = useState<string | null>(null);
  const [wallet, setWallet] = useState<WalletBalanceDto | null>(null);

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

  useEffect(() => {
    let cancelled = false;
    const loadWallet = () => {
      void walletGetBalance()
        .then((res) => {
          if (!cancelled) setWallet(res.wallet);
        })
        .catch(() => {
          if (!cancelled) setWallet(null);
        });
    };
    loadWallet();
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadWallet();
    };
    window.addEventListener(WALLET_BALANCE_CHANGED_EVENT, loadWallet);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener(WALLET_BALANCE_CHANGED_EVENT, loadWallet);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const displayName = useMemo(() => {
    const meta = user?.user_metadata;
    const name = (meta?.name as string | undefined)?.trim();
    if (name) return name;
    return user?.email?.split('@')[0] ?? t('defaultRiderName');
  }, [user, t]);

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

  const walletBalanceLabel = useMemo(() => {
    if (wallet) return formatMoneyMinorPlain(wallet.balance_minor);
    return '—';
  }, [wallet]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const notifySoon = () => {
    toast.message(tc('comingSoon'));
  };

  const avatarInner = avatarUrl ? (
    <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
  ) : (
    <div
      className="flex h-full w-full items-center justify-center text-2xl font-bold"
      style={{ color: PRIMARY, backgroundColor: PRIMARY_FIXED }}
    >
      {displayName.charAt(0).toUpperCase()}
    </div>
  );

  return (
    <div
      className="flex min-h-[100dvh] flex-col pb-28"
      style={{ backgroundColor: PAGE_BG, color: ON_SURFACE }}
    >
      <header className="safe-t safe-x z-10 flex h-16 shrink-0 items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="passenger-row-hover rounded-full p-2 transition-transform active:scale-95"
            style={{ color: PRIMARY }}
            aria-label={t('backAria')}
          >
            <ArrowLeft className="h-6 w-6" strokeWidth={2} aria-hidden />
          </button>
          <h1 className="text-lg font-bold tracking-tight" style={{ color: ON_SURFACE }}>
            {t('title')}
          </h1>
        </div>
        <button
          type="button"
          onClick={() => navigate('/account/profile')}
          className="h-10 w-10 overflow-hidden rounded-full border-2 transition-transform active:scale-95"
          style={{ borderColor: PRIMARY_CONTAINER }}
          aria-label={t('viewProfileAria')}
        >
          {avatarInner}
        </button>
      </header>

      <main className="safe-x mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 overflow-y-auto px-6 pb-4">
        <section className="flex flex-col items-center pb-2 pt-2">
          <button
            type="button"
            onClick={() => navigate('/account/profile')}
            className="group relative transition-transform active:scale-[0.98]"
            aria-label={t('editProfileAria')}
          >
            <div
              className="h-24 w-24 rounded-full border-4 p-1"
              style={{ borderColor: 'color-mix(in srgb, var(--passenger-primary) 10%, transparent)' }}
            >
              <div className="h-full w-full overflow-hidden rounded-full shadow-lg">{avatarInner}</div>
            </div>
            <div
              className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full shadow-md transition-transform active:scale-90"
              style={{ backgroundColor: PRIMARY, color: ON_PRIMARY }}
              aria-hidden
            >
              <Pencil className="h-4 w-4" strokeWidth={2.5} />
            </div>
          </button>
          <div className="mt-3 text-center">
            <h2 className="text-lg font-bold" style={{ color: ON_SURFACE }}>
              {displayName}
            </h2>
            <p
              className="mt-0.5 text-xs font-medium uppercase tracking-widest"
              style={{ color: SECONDARY }}
            >
              {handle}
            </p>
          </div>
        </section>

        <div className="grid min-h-0 grid-cols-2 gap-3">
          <BentoCard
            className="col-span-2 flex flex-col justify-between"
            onClick={() => navigate('/account/wallet')}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <Wallet className="h-5 w-5" style={{ color: PRIMARY }} fill="currentColor" aria-hidden />
                <span className="text-sm font-semibold" style={{ color: ON_SURFACE }}>
                  {t('wallet')}
                </span>
              </div>
              <span className="text-lg font-bold" style={{ color: PRIMARY }}>
                {walletBalanceLabel}
              </span>
            </div>
            <div
              className="mt-2 flex items-center justify-between border-t pt-2"
              style={{ borderColor: OUTLINE_VARIANT }}
            >
              <span className="text-xs" style={{ color: SECONDARY }}>
                {selectedMethod.barLabel}
              </span>
              <ChevronRight className="h-4 w-4" style={{ color: SECONDARY }} aria-hidden />
            </div>
          </BentoCard>

          <BentoCard className="flex flex-col justify-center gap-2" onClick={() => navigate('/account/profile')}>
            <User className="h-6 w-6" style={{ color: PRIMARY }} aria-hidden />
            <div>
              <h3 className="text-sm font-semibold" style={{ color: ON_SURFACE }}>
                {t('profile')}
              </h3>
              <p className="truncate text-xs" style={{ color: SECONDARY }}>
                {t('profileDescription')}
              </p>
            </div>
          </BentoCard>

          <BentoCard className="relative flex flex-col justify-center gap-2 opacity-80" onClick={notifySoon}>
            <div className="absolute right-3 top-3">
              <ComingSoonBadge label={tc('comingSoon')} />
            </div>
            <Headphones className="h-6 w-6" style={{ color: PRIMARY }} aria-hidden />
            <div>
              <h3 className="text-sm font-semibold" style={{ color: ON_SURFACE }}>
                {t('support')}
              </h3>
              <p className="truncate text-xs" style={{ color: SECONDARY }}>
                {t('supportDescription')}
              </p>
            </div>
          </BentoCard>

          <BentoCard className="flex flex-col justify-center gap-2" onClick={() => navigate('/account/contacts')}>
            <Contact className="h-6 w-6" style={{ color: PRIMARY }} aria-hidden />
            <div>
              <h3 className="text-sm font-semibold" style={{ color: ON_SURFACE }}>
                {t('contacts')}
              </h3>
              <p className="truncate text-xs" style={{ color: SECONDARY }}>
                {t('contactsDescription')}
              </p>
            </div>
          </BentoCard>

          <BentoCard
            className="relative flex flex-col justify-center gap-2 border-l-4 opacity-80"
            style={{ borderLeftColor: 'color-mix(in srgb, var(--passenger-error) 30%, transparent)' }}
            onClick={notifySoon}
          >
            <div className="absolute right-3 top-3">
              <ComingSoonBadge label={tc('comingSoon')} />
            </div>
            <Shield className="h-6 w-6" style={{ color: ERROR }} aria-hidden />
            <div>
              <h3 className="text-sm font-semibold" style={{ color: ON_SURFACE }}>
                {t('safety')}
              </h3>
              <p className="truncate text-xs" style={{ color: SECONDARY }}>
                {t('safetyDescription')}
              </p>
            </div>
          </BentoCard>

          <BentoCard
            className="col-span-2 flex items-center justify-between px-4 py-3 opacity-80"
            onClick={notifySoon}
          >
            <div className="flex min-w-0 items-center gap-3">
              <Gift className="h-6 w-6 shrink-0" style={{ color: PRIMARY_CONTAINER }} aria-hidden />
              <div className="min-w-0">
                <h3 className="text-sm font-semibold" style={{ color: ON_SURFACE }}>
                  {t('promotions')}
                </h3>
                <p className="truncate text-xs" style={{ color: SECONDARY }}>
                  {t('promotionsDescription')}
                </p>
              </div>
            </div>
            <ComingSoonBadge label={tc('comingSoon')} />
          </BentoCard>

          <BentoCard
            className="col-span-2 flex items-center justify-between px-4 py-3"
            onClick={() => navigate('/account/settings')}
          >
            <div className="flex min-w-0 items-center gap-3">
              <Settings className="h-5 w-5 shrink-0" style={{ color: ON_SURFACE_VARIANT }} aria-hidden />
              <span className="text-sm font-semibold" style={{ color: ON_SURFACE }}>
                {t('appSettings')}
              </span>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0" style={{ color: OUTLINE_VARIANT }} aria-hidden />
          </BentoCard>
        </div>

        <div className="mt-auto flex flex-col items-center gap-2 py-4">
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-4 text-sm font-semibold shadow-xl transition-transform active:scale-95"
            style={{ backgroundColor: INVERSE_SURFACE, color: ON_PRIMARY }}
          >
            <LogOut className="h-5 w-5" aria-hidden />
            {t('signOut')}
          </button>
          <span
            className="mt-2 text-[10px] uppercase tracking-widest opacity-50"
            style={{ color: OUTLINE }}
          >
            {t('appVersionShort', { version: appVersionInfo.version })}
          </span>
        </div>
      </main>
    </div>
  );
}
