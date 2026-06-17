import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Car,
  CreditCard,
  Gift,
  Info,
  Wallet,
} from 'lucide-react';

import {
  CARD_SHADOW,
  CARD_SHADOW_STRONG,
  ON_PRIMARY,
  ON_SURFACE,
  PAGE_BG,
  PRIMARY,
  SECONDARY,
  SURFACE_LOW,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';

const GIFT_BANNER_URL =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuAe7-ykiff6goxLKNI3mNzbXr79HAwcfVc6bUKjTEAqJxWV87mezWuGBJS-TpET5vI9FeD-IKzXpbRXU4E0xTdeZf3xLD_bhjjXG7Iuk6rX4BvR9ZsHyBVo8N9OMRUgGNMaM2urf7jmaJkQsOfrIxMvgION7bsGXeIoGC7b2GpzYGBlDFPoFbR4H8k-tG3GTrVoGrXgS6-4FROAhCe4XSpJrwMBhZJ7hVvSXZxvMjsbdTe4A8lU6z0c-4CYDWMzivMN-CpikSThGOM1';

const DEMO_ACTIVITY = [
  {
    id: 'redeem',
    titleKey: 'giftCards.activity.redeemed',
    date: 'Oct 24, 2023',
    amount: '+$50.00',
    positive: true,
    icon: CreditCard,
  },
  {
    id: 'ride',
    titleKey: 'giftCards.activity.ride',
    date: 'Oct 20, 2023',
    amount: '-$22.40',
    positive: false,
    icon: Car,
  },
] as const;

function PresetCard({
  label,
  amount,
  badge,
  onSelect,
}: {
  label: string;
  amount: number;
  badge?: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="group relative flex flex-col items-center rounded-[24px] border p-6 text-center transition-all active:scale-95 hover:border-[var(--passenger-primary)] hover:bg-[var(--passenger-highlight)]"
      style={{
        backgroundColor: SURFACE_LOWEST,
        borderColor: SURFACE_LOW,
        boxShadow: CARD_SHADOW,
      }}
    >
      {badge ? (
        <span
          className="absolute -right-1 -top-2 rounded-full px-2 py-0.5 text-[11px] font-semibold shadow-sm"
          style={{ backgroundColor: PRIMARY, color: ON_PRIMARY }}
        >
          {badge}
        </span>
      ) : null}
      <span
        className="mb-2 text-xs font-bold tracking-wide transition-colors group-hover:text-[#004ac6]"
        style={{ color: SECONDARY }}
      >
        {label}
      </span>
      <span className="text-[30px] font-bold leading-tight tracking-tight" style={{ color: ON_SURFACE }}>
        ${amount}
      </span>
    </button>
  );
}

export default function GiftCardsPage() {
  const navigate = useNavigate();
  const { t } = useTranslation('support');
  const { t: tc } = useTranslation('common');
  const [code, setCode] = useState('');
  const [customAmount, setCustomAmount] = useState('');
  const [customFocused, setCustomFocused] = useState(false);

  const balance = 0;

  const presets = useMemo(
    () => [
      { id: 'starter' as const, label: t('giftCards.presets.starter'), amount: 25 },
      { id: 'popular' as const, label: t('giftCards.presets.popular'), amount: 50, badge: t('giftCards.presets.best') },
      { id: 'premium' as const, label: t('giftCards.presets.premium'), amount: 100 },
    ],
    [t],
  );

  const activity = useMemo(
    () =>
      DEMO_ACTIVITY.map((item) => ({
        ...item,
        title: t(item.titleKey),
      })),
    [t],
  );

  const notifySoon = () => {
    toast.message(tc('comingSoon'));
  };

  const handleApply = () => {
    if (!code.trim()) return;
    notifySoon();
  };

  return (
    <div className="flex min-h-[100dvh] flex-col pb-28" style={{ backgroundColor: PAGE_BG, color: ON_SURFACE }}>
      <header
        className="sticky top-0 z-50 flex h-16 w-full items-center justify-between border-b px-5 shadow-sm safe-t"
        style={{
          backgroundColor: SURFACE_LOWEST,
          borderColor: '#e0e3e5',
        }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/account')}
            className="shrink-0 rounded-full p-2 transition-colors active:scale-95 passenger-row-hover"
            style={{ color: PRIMARY }}
            aria-label={t('giftCards.backAria')}
          >
            <ArrowLeft className="h-6 w-6" strokeWidth={2} aria-hidden />
          </button>
          <h1 className="truncate text-xl font-semibold tracking-tight" style={{ color: ON_SURFACE }}>
            {t('giftCards.title')}
          </h1>
        </div>
        <span
          className="shrink-0 text-lg font-bold tracking-tight"
          style={{ color: PRIMARY }}
        >
          {t('giftCards.brand')}
        </span>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 space-y-8 px-5 py-6 safe-x">
        <section
          className="relative overflow-hidden rounded-[24px] p-6 text-white"
          style={{ backgroundColor: PRIMARY, boxShadow: CARD_SHADOW_STRONG }}
        >
          <div className="relative z-10">
            <p className="mb-1 text-xs font-bold uppercase tracking-wide opacity-80">{t('giftCards.currentBalance')}</p>
            <h2 className="text-[40px] font-bold tracking-tight">
              ${balance.toFixed(2)}
            </h2>
            <div className="mt-6 flex items-center gap-2">
              <Wallet className="h-5 w-5 shrink-0" fill="currentColor" aria-hidden />
              <p className="text-sm">{t('giftCards.readyToUse')}</p>
            </div>
          </div>
          <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-white/10 blur-3xl" aria-hidden />
          <Gift className="absolute bottom-8 right-8 h-[120px] w-[120px] opacity-20" strokeWidth={1} aria-hidden />
        </section>

        <section className="space-y-4">
          <h3 className="text-xl font-semibold tracking-tight" style={{ color: ON_SURFACE }}>
            {t('giftCards.redeemTitle')}
          </h3>
          <div
            className="rounded-[24px] p-6"
            style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
          >
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={t('giftCards.enterCode')}
                className="w-full flex-1 rounded-xl border-none px-4 py-3 text-base outline-none transition-all focus:ring-2 focus:ring-[#004ac6]"
                style={{
                  backgroundColor: SURFACE_LOW,
                  color: ON_SURFACE,
                }}
              />
              <button
                type="button"
                onClick={handleApply}
                className="shrink-0 rounded-xl px-8 py-3 font-bold transition-all active:scale-95 hover:opacity-90"
                style={{ backgroundColor: PRIMARY, color: ON_PRIMARY }}
              >
                {t('giftCards.apply')}
              </button>
            </div>
            <p className="mt-3 px-1 text-sm" style={{ color: SECONDARY }}>
              {t('giftCards.codeHint')}
            </p>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold tracking-tight" style={{ color: ON_SURFACE }}>
              {t('giftCards.buyTitle')}
            </h3>
            <button
              type="button"
              onClick={notifySoon}
              className="rounded-full p-1 transition-opacity hover:opacity-70"
              aria-label={t('giftCards.infoAria')}
            >
              <Info className="h-5 w-5" style={{ color: SECONDARY }} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {presets.map((preset) => (
              <PresetCard
                key={preset.id}
                label={preset.label}
                amount={preset.amount}
                badge={'badge' in preset ? preset.badge : undefined}
                onSelect={notifySoon}
              />
            ))}
            <button
              type="button"
              onClick={() => document.getElementById('gift-custom-amount')?.focus()}
              className={`group relative flex flex-col items-center rounded-[24px] border p-6 text-center transition-all active:scale-95 ${
                customFocused ? 'border-[#004ac6] bg-[#2563eb]/5' : ''
              }`}
              style={{
                backgroundColor: SURFACE_LOWEST,
                borderColor: customFocused ? PRIMARY : SURFACE_LOW,
                boxShadow: CARD_SHADOW,
              }}
            >
              <span
                className="mb-2 text-xs font-bold tracking-wide transition-colors group-hover:text-[#004ac6]"
                style={{ color: SECONDARY }}
              >
                {t('giftCards.presets.custom')}
              </span>
              <div className="flex items-center">
                <span className="text-[30px] font-bold tracking-tight" style={{ color: ON_SURFACE }}>
                  $
                </span>
                <input
                  id="gift-custom-amount"
                  type="number"
                  min={1}
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  onFocus={() => setCustomFocused(true)}
                  onBlur={() => setCustomFocused(false)}
                  placeholder={t('giftCards.presets.other')}
                  className="w-16 border-none bg-transparent p-0 text-[30px] font-bold tracking-tight outline-none focus:ring-0"
                  style={{ color: ON_SURFACE }}
                />
              </div>
            </button>
          </div>

          <div className="group relative h-48 w-full overflow-hidden rounded-[24px]">
            <img
              src={GIFT_BANNER_URL}
              alt=""
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 flex items-center bg-gradient-to-r from-[#00174b]/60 to-transparent p-8">
              <div className="max-w-[200px] text-white">
                <p className="mb-2 text-xl font-semibold leading-snug">
                  {t('giftCards.bannerTitle')}
                </p>
                <button
                  type="button"
                  onClick={notifySoon}
                  className="rounded-full px-4 py-2 text-xs font-bold tracking-wide shadow-lg transition-colors passenger-row-hover"
                  style={{ backgroundColor: SURFACE_LOWEST, color: PRIMARY }}
                >
                  {t('giftCards.learnMore')}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h3 className="text-xl font-semibold tracking-tight" style={{ color: ON_SURFACE }}>
            {t('giftCards.recentActivity')}
          </h3>
          <div
            className="overflow-hidden rounded-[24px]"
            style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
          >
            <div className="space-y-0 divide-y-0 p-2">
            {activity.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between px-4 py-5"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-xl"
                      style={{ backgroundColor: SURFACE_LOW }}
                    >
                      <Icon
                        className="h-6 w-6"
                        style={{ color: item.positive ? PRIMARY : SECONDARY }}
                        aria-hidden
                      />
                    </div>
                    <div>
                      <p className="font-semibold" style={{ color: ON_SURFACE }}>
                        {item.title}
                      </p>
                      <p className="text-sm" style={{ color: SECONDARY }}>
                        {item.date}
                      </p>
                    </div>
                  </div>
                  <span
                    className="text-xl font-semibold"
                    style={{ color: item.positive ? PRIMARY : ON_SURFACE }}
                  >
                    {item.amount}
                  </span>
                </div>
              );
            })}
            </div>
            <button
              type="button"
              onClick={notifySoon}
              className="w-full py-4 text-xs font-bold tracking-wide transition-colors passenger-row-hover"
              style={{ color: PRIMARY }}
            >
              {t('giftCards.viewFullHistory')}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
