import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ArrowRight,
  Car,
  ChevronRight,
  CreditCard,
  FileText,
  Info,
  MessageCircle,
  Search,
  Shield,
  Ticket,
} from 'lucide-react';

import {
  CARD_SHADOW,
  ON_PRIMARY,
  ON_SECONDARY_CONTAINER,
  ON_SURFACE,
  ON_TERTIARY_FIXED_VARIANT,
  OUTLINE,
  PAGE_BG,
  PRIMARY,
  PRIMARY_CONTAINER,
  PRIMARY_FIXED,
  SECONDARY,
  SECONDARY_CONTAINER,
  SURFACE_LOWEST,
  TERTIARY,
} from '@/lib/passengerTheme';

function CategoryCard({
  title,
  description,
  icon: Icon,
  iconBg,
  iconColor,
  featured,
  linkLabel,
  onClick,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  iconBg: string;
  iconColor: string;
  featured?: boolean;
  linkLabel?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex w-full flex-col text-left transition-all active:scale-[0.98] ${
        featured ? 'justify-between p-6' : 'p-6'
      }`}
      style={{
        backgroundColor: SURFACE_LOWEST,
        borderRadius: 24,
        boxShadow: CARD_SHADOW,
      }}
    >
      <div className={featured ? 'space-y-4' : ''}>
        <div
          className={`flex items-center justify-center rounded-xl ${featured ? 'h-12 w-12' : 'mb-4 h-10 w-10'}`}
          style={{ backgroundColor: iconBg }}
        >
          <Icon
            className={featured ? 'h-7 w-7' : 'h-5 w-5'}
            style={{ color: iconColor }}
            aria-hidden
          />
        </div>
        <div>
          <h3
            className={`font-semibold tracking-tight ${featured ? 'mb-2 text-xl' : 'mb-1 text-lg'}`}
            style={{ color: ON_SURFACE }}
          >
            {title}
          </h3>
          <p className="text-sm line-clamp-2" style={{ color: SECONDARY }}>
            {description}
          </p>
        </div>
      </div>
      {featured && linkLabel ? (
        <div className="mt-6 flex items-center gap-2 text-xs font-bold tracking-wide" style={{ color: PRIMARY }}>
          <span>{linkLabel}</span>
          <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </div>
      ) : null}
    </button>
  );
}

export default function SupportCenterPage() {
  const navigate = useNavigate();
  const { t } = useTranslation('support');
  const { t: tc } = useTranslation('common');
  const [query, setQuery] = useState('');

  const categories = useMemo(
    () => [
      {
        id: 'trip' as const,
        title: t('center.categories.trip'),
        description: t('center.categories.tripDescription'),
        icon: Car,
        iconBg: 'rgba(37, 99, 235, 0.1)',
        iconColor: PRIMARY,
        featured: true,
        linkLabel: t('center.categories.tripLink'),
      },
      {
        id: 'payment' as const,
        title: t('center.categories.payment'),
        description: t('center.categories.paymentDescription'),
        icon: CreditCard,
        iconBg: 'rgba(188, 72, 0, 0.1)',
        iconColor: TERTIARY,
      },
      {
        id: 'account' as const,
        title: t('center.categories.account'),
        description: t('center.categories.accountDescription'),
        icon: Shield,
        iconBg: 'rgba(208, 225, 251, 0.5)',
        iconColor: ON_SECONDARY_CONTAINER,
      },
      {
        id: 'promotions' as const,
        title: t('center.categories.promotions'),
        description: t('center.categories.promotionsDescription'),
        icon: Ticket,
        iconBg: 'rgba(125, 45, 0, 0.1)',
        iconColor: ON_TERTIARY_FIXED_VARIANT,
      },
      {
        id: 'app' as const,
        title: t('center.categories.app'),
        description: t('center.categories.appDescription'),
        icon: Info,
        iconBg: 'rgba(219, 225, 255, 0.5)',
        iconColor: PRIMARY,
      },
    ],
    [t],
  );

  const popularArticles = useMemo(
    () => [
      t('center.articles.peakPricing'),
      t('center.articles.scheduleRide'),
      t('center.articles.lostItem'),
    ],
    [t],
  );

  const notifySoon = () => {
    toast.message(tc('comingSoon'));
  };

  return (
    <div
      className="flex min-h-[100dvh] flex-col pb-28"
      style={{ backgroundColor: PAGE_BG, color: ON_SURFACE }}
    >
      <header
        className="sticky top-0 z-50 flex h-16 w-full items-center gap-4 px-5 shadow-sm safe-t"
        style={{ backgroundColor: SURFACE_LOWEST }}
      >
        <button
          type="button"
          onClick={() => navigate('/account')}
          className="rounded-full p-2 transition-colors active:scale-95 passenger-row-hover"
          style={{ color: PRIMARY }}
          aria-label={t('center.backAria')}
        >
          <ArrowLeft className="h-6 w-6" strokeWidth={2} aria-hidden />
        </button>
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: PRIMARY }}>
          {t('center.title')}
        </h1>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-8 px-5 py-6 safe-x">
        <section className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-[30px] font-bold leading-tight tracking-tight" style={{ color: ON_SURFACE }}>
              {t('center.headline')}
            </h2>
            <p className="text-base" style={{ color: SECONDARY }}>
              {t('center.description')}
            </p>
          </div>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 transition-colors"
              style={{ color: OUTLINE }}
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('center.searchPlaceholder')}
              className="h-14 w-full rounded-xl pl-12 pr-4 text-base outline-none transition-all focus:ring-2 focus:ring-[#004ac6]"
              style={{
                backgroundColor: SURFACE_LOWEST,
                color: ON_SURFACE,
                boxShadow: CARD_SHADOW,
              }}
            />
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className={cat.featured ? 'sm:col-span-2' : undefined}
            >
              <CategoryCard
                title={cat.title}
                description={cat.description}
                icon={cat.icon}
                iconBg={cat.iconBg}
                iconColor={cat.iconColor}
                featured={cat.featured}
                linkLabel={cat.linkLabel}
                onClick={notifySoon}
              />
            </div>
          ))}
        </section>

        <section
          className="relative overflow-hidden rounded-[32px] p-8 shadow-lg"
          style={{ backgroundColor: PRIMARY, color: ON_PRIMARY }}
        >
          <div className="relative z-10 flex flex-col gap-8">
            <div className="max-w-xl space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 backdrop-blur-sm">
                <span className="h-2 w-2 animate-pulse rounded-full bg-green-400" aria-hidden />
                <span className="text-xs font-bold tracking-wide">{t('center.agentsOnline')}</span>
              </div>
              <h2 className="text-[30px] font-bold leading-tight tracking-tight">
                {t('center.cantFind')}
              </h2>
              <p className="text-base" style={{ color: PRIMARY_FIXED }}>
                {t('center.premiumSupport')}
              </p>
            </div>
            <button
              type="button"
              onClick={notifySoon}
              className="passenger-row-hover flex items-center justify-center gap-3 self-start rounded-xl px-8 py-4 text-lg font-semibold shadow-xl transition-colors active:scale-95"
              style={{ backgroundColor: SURFACE_LOWEST, color: PRIMARY }}
            >
              <MessageCircle className="h-6 w-6" aria-hidden />
              {t('center.contactSupport')}
            </button>
          </div>
          <div
            className="absolute -bottom-12 -right-12 h-64 w-64 rounded-full opacity-50 blur-3xl"
            style={{ backgroundColor: PRIMARY_CONTAINER }}
            aria-hidden
          />
        </section>

        <section className="space-y-4">
          <h3 className="px-2 text-xl font-semibold tracking-tight" style={{ color: ON_SURFACE }}>
            {t('center.popularArticles')}
          </h3>
          <div
            className="overflow-hidden rounded-[24px]"
            style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
          >
            <div className="flex flex-col gap-0 p-1">
            {popularArticles.map((title) => (
              <button
                key={title}
                type="button"
                onClick={notifySoon}
                className="group flex w-full items-center justify-between rounded-2xl p-4 text-left transition-colors passenger-row-hover"
              >
                <div className="flex min-w-0 items-center gap-4">
                  <FileText className="h-5 w-5 shrink-0" style={{ color: OUTLINE }} aria-hidden />
                  <span className="text-base" style={{ color: ON_SURFACE }}>
                    {title}
                  </span>
                </div>
                <ArrowRight
                  className="h-5 w-5 shrink-0 transition-colors group-hover:text-[#004ac6]"
                  style={{ color: OUTLINE }}
                  aria-hidden
                />
              </button>
            ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
