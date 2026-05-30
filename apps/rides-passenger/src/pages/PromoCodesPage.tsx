import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Award,
  Calendar,
  Car,
  Plane,
  Tag,
  Ticket,
  BadgeCheck,
} from 'lucide-react';

import {
  CARD_SHADOW,
  ON_PRIMARY,
  ON_PRIMARY_CONTAINER,
  ON_SECONDARY_CONTAINER,
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  OUTLINE,
  PAGE_BG,
  PRIMARY,
  PRIMARY_CONTAINER,
  PRIMARY_FIXED,
  SECONDARY,
  SECONDARY_CONTAINER,
  SURFACE_CONTAINER_HIGH,
  SURFACE_LOW,
  SURFACE_LOWEST,
  TERTIARY,
  TERTIARY_FIXED,
} from '@/lib/passengerTheme';

const ACTIVE_PROMOS = [
  {
    id: 'rides20',
    title: '20% off next 3 rides',
    description:
      'Valid for all premium and executive class bookings in the city area.',
    expires: 'EXPIRES DEC 24, 2023',
    code: 'ROAM20OFF',
    codeStyle: 'primary' as const,
    icon: Car,
    iconBg: 'rgba(0, 74, 198, 0.1)',
    iconColor: PRIMARY,
    comingSoon: true,
    footerAction: 'DETAILS',
    variant: 'light' as const,
  },
  {
    id: 'airport5',
    title: '$5 off airport trips',
    description:
      'Flat discount on any trip originating or ending at International Hub.',
    expires: 'EXPIRES JAN 05, 2024',
    code: 'FLYSAFE5',
    codeStyle: 'tertiary' as const,
    icon: Plane,
    iconBg: 'rgba(148, 55, 0, 0.1)',
    iconColor: TERTIARY,
    comingSoon: false,
    footerAction: 'DETAILS',
    variant: 'light' as const,
  },
  {
    id: 'welcome',
    title: 'First Ride Free',
    description: 'Welcome to Roam Rides. Enjoy your first ride on us up to $25.',
    badge: 'NEW MEMBERS ONLY',
    code: 'WELCOMEVIP',
    footerAction: 'REDEEM NOW',
    icon: Award,
    variant: 'featured' as const,
  },
] as const;

function PromoCardFooter({
  code,
  codeStyle,
  action,
  featured,
  onAction,
}: {
  code: string;
  codeStyle?: 'primary' | 'tertiary';
  action: string;
  featured?: boolean;
  onAction: () => void;
}) {
  const codeBg =
    codeStyle === 'tertiary'
      ? TERTIARY_FIXED
      : featured
        ? 'rgba(255, 255, 255, 0.2)'
        : PRIMARY_FIXED;
  const codeColor =
    codeStyle === 'tertiary' ? TERTIARY : featured ? ON_PRIMARY_CONTAINER : PRIMARY;

  return (
    <div className={`mt-6 flex items-center justify-between pt-4 ${featured ? 'relative z-10' : ''}`}>
      <span
        className="rounded-lg px-3 py-1 text-xs font-bold tracking-wide"
        style={{ backgroundColor: codeBg, color: codeColor }}
      >
        {code}
      </span>
      <button
        type="button"
        onClick={onAction}
        className="text-xs font-bold tracking-wide hover:underline"
        style={{ color: featured ? ON_PRIMARY_CONTAINER : PRIMARY }}
      >
        {action}
      </button>
    </div>
  );
}

export default function PromoCodesPage() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');

  const notifySoon = () => {
    toast.message('Coming soon');
  };

  const handleApply = () => {
    if (!code.trim()) return;
    notifySoon();
  };

  return (
    <div
      className="flex min-h-[100dvh] flex-col pb-28"
      style={{ backgroundColor: PAGE_BG, color: ON_SURFACE }}
    >
      <header
        className="sticky top-0 z-50 flex h-16 w-full items-center justify-between px-5 shadow-sm safe-t"
        style={{ backgroundColor: SURFACE_LOWEST }}
      >
        <button
          type="button"
          onClick={() => navigate('/account')}
          className="flex h-10 w-10 items-center justify-center rounded-full transition-colors active:scale-95 passenger-row-hover"
          style={{ color: PRIMARY }}
          aria-label="Back to account"
        >
          <ArrowLeft className="h-6 w-6" strokeWidth={2} aria-hidden />
        </button>
        <h1
          className="flex-1 text-center text-xl font-semibold tracking-tight"
          style={{ color: PRIMARY }}
        >
          Promo Codes
        </h1>
        <div className="w-10 shrink-0" aria-hidden />
      </header>

      <main className="mx-auto w-full max-w-xl flex-1 space-y-8 px-5 py-6 safe-x">
        <section className="space-y-4">
          <h2
            className="text-xs font-bold uppercase tracking-widest"
            style={{ color: SECONDARY }}
          >
            Add New Code
          </h2>
          <div className="flex items-center gap-3">
            <div className="relative min-w-0 flex-1">
              <Tag
                className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2"
                style={{ color: OUTLINE }}
                aria-hidden
              />
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Enter promo code"
                className="w-full rounded-xl py-4 pl-12 pr-4 text-base outline-none transition-all focus:ring-2 focus:ring-[#004ac6]"
                style={{
                  backgroundColor: SURFACE_LOWEST,
                  color: ON_SURFACE,
                  boxShadow: CARD_SHADOW,
                }}
              />
            </div>
            <button
              type="button"
              onClick={handleApply}
              disabled={!code.trim()}
              className="shrink-0 rounded-xl px-6 py-4 text-xs font-bold tracking-wide transition-all active:scale-95 disabled:opacity-50"
              style={{
                backgroundColor: PRIMARY,
                color: ON_PRIMARY,
                boxShadow: code.trim() ? '0 10px 25px rgba(0, 74, 198, 0.2)' : undefined,
              }}
            >
              APPLY
            </button>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold tracking-tight" style={{ color: ON_SURFACE }}>
              Active Promos
            </h2>
            <span
              className="rounded-full px-3 py-1 text-[11px] font-semibold"
              style={{ backgroundColor: SECONDARY_CONTAINER, color: ON_SECONDARY_CONTAINER }}
            >
              3 AVAILABLE
            </span>
          </div>

          <div className="grid gap-4">
            {ACTIVE_PROMOS.map((promo) => {
              if (promo.variant === 'featured') {
                const Icon = promo.icon;
                return (
                  <div
                    key={promo.id}
                    className="relative overflow-hidden rounded-[24px] p-6"
                    style={{
                      backgroundColor: PRIMARY_CONTAINER,
                      color: ON_PRIMARY_CONTAINER,
                      boxShadow: '0 20px 40px rgba(0, 74, 198, 0.2)',
                    }}
                  >
                    <div
                      className="absolute -bottom-10 -right-10 h-40 w-40 rounded-full bg-white/10 blur-3xl"
                      aria-hidden
                    />
                    <div className="relative z-10 flex items-start gap-5">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20">
                        <Icon className="h-8 w-8 text-white" aria-hidden />
                      </div>
                      <div className="min-w-0 space-y-1">
                        <h3 className="text-xl font-semibold">{promo.title}</h3>
                        <p className="text-sm opacity-90">{promo.description}</p>
                        <div className="mt-3 flex items-center gap-2 opacity-75">
                          <BadgeCheck className="h-[18px] w-[18px]" aria-hidden />
                          <span className="text-xs font-bold tracking-wide">{promo.badge}</span>
                        </div>
                      </div>
                    </div>
                    <PromoCardFooter
                      code={promo.code}
                      action={promo.footerAction}
                      featured
                      onAction={notifySoon}
                    />
                  </div>
                );
              }

              const Icon = promo.icon;
              return (
                <div
                  key={promo.id}
                  className="group relative overflow-hidden rounded-[24px] p-6 transition-all hover:-translate-y-0.5"
                  style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
                >
                  {promo.comingSoon ? (
                    <div className="absolute right-0 top-0 p-4">
                      <span
                        className="rounded-full px-3 py-1 text-[11px] font-semibold"
                        style={{
                          backgroundColor: SURFACE_CONTAINER_HIGH,
                          color: ON_SURFACE_VARIANT,
                        }}
                      >
                        Coming Soon
                      </span>
                    </div>
                  ) : null}
                  <div className="flex items-start gap-5">
                    <div
                      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
                      style={{ backgroundColor: promo.iconBg }}
                    >
                      <Icon className="h-8 w-8" style={{ color: promo.iconColor }} aria-hidden />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <h3 className="text-xl font-semibold" style={{ color: ON_SURFACE }}>
                        {promo.title}
                      </h3>
                      <p className="text-sm" style={{ color: SECONDARY }}>
                        {promo.description}
                      </p>
                      <div className="mt-3 flex items-center gap-2" style={{ color: OUTLINE }}>
                        <Calendar className="h-[18px] w-[18px]" aria-hidden />
                        <span className="text-xs font-bold tracking-wide">{promo.expires}</span>
                      </div>
                    </div>
                  </div>
                  <PromoCardFooter
                    code={promo.code}
                    codeStyle={promo.codeStyle}
                    action={promo.footerAction}
                    onAction={notifySoon}
                  />
                </div>
              );
            })}
          </div>
        </section>

        <section className="flex flex-col items-center space-y-4 pt-8 text-center">
          <div
            className="mb-2 flex h-32 w-32 items-center justify-center rounded-full"
            style={{ backgroundColor: SURFACE_CONTAINER_HIGH }}
          >
            <Ticket className="h-12 w-12" style={{ color: OUTLINE }} aria-hidden />
          </div>
          <p className="max-w-xs text-sm" style={{ color: SECONDARY }}>
            Check back often for seasonal promotions and loyalty rewards tailored for your commute.
          </p>
        </section>
      </main>
    </div>
  );
}
