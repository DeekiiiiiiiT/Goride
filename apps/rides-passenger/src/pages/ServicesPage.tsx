import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft,
  CalendarDays,
  Clock,
  Package,
  Truck,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import {
  BADGE_BG,
  BADGE_TEXT,
  NAVY,
  SERVICES_MUTED as MUTED,
  SERVICES_PAGE_BG as PAGE_BG,
} from '@/lib/passengerTheme';

type ServiceMenuConfig = {
  id: string;
  titleKey: string;
  descriptionKey: string;
  icon: LucideIcon;
  iconWrapClassName: string;
};

const SERVICE_MENU: ServiceMenuConfig[] = [
  {
    id: 'book-for-others',
    titleKey: 'items.bookForOthers.title',
    descriptionKey: 'items.bookForOthers.description',
    icon: Users,
    iconWrapClassName: 'bg-[#E8F1FC] text-[#4A7FD4]',
  },
  {
    id: 'courier',
    titleKey: 'items.courier.title',
    descriptionKey: 'items.courier.description',
    icon: Package,
    iconWrapClassName: 'bg-[#FFF0E6] text-[#E07A3A]',
  },
  {
    id: 'event',
    titleKey: 'items.event.title',
    descriptionKey: 'items.event.description',
    icon: CalendarDays,
    iconWrapClassName: 'bg-[#F0EBFA] text-[#7B5CB8]',
  },
  {
    id: 'schedule',
    titleKey: 'items.schedule.title',
    descriptionKey: 'items.schedule.description',
    icon: Clock,
    iconWrapClassName: 'bg-[#E8F6EE] text-[#3D9A5F]',
  },
  {
    id: 'haulage',
    titleKey: 'items.haulage.title',
    descriptionKey: 'items.haulage.description',
    icon: Truck,
    iconWrapClassName: 'bg-[#EEF2F5] text-[#5A6B7D]',
  },
];

type ServiceMenuItem = ServiceMenuConfig & {
  title: string;
  description: string;
};

function ServiceMenuCard({
  item,
  onClick,
  showComingBadge = true,
}: {
  item: ServiceMenuItem;
  onClick?: () => void;
  showComingBadge?: boolean;
}) {
  const { t } = useTranslation('services');
  const { t: tc } = useTranslation('common');
  const Icon = item.icon;
  const interactive = Boolean(onClick);

  return (
    <li className="min-w-0">
      <button
        type="button"
        onClick={onClick}
        disabled={!interactive}
        className={`services-menu-card relative flex min-h-[10.75rem] w-full flex-col items-center rounded-2xl px-3 pb-5 pt-6 text-center ${
          interactive ? 'touch-manipulation transition-transform active:scale-[0.98]' : ''
        } ${showComingBadge ? 'opacity-80' : ''}`}
        aria-disabled={!interactive}
      >
        {showComingBadge ? (
          <span
            className="absolute right-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide"
            style={{ backgroundColor: BADGE_BG, color: BADGE_TEXT }}
          >
            {tc('comingSoon')}
          </span>
        ) : null}

        <div
          className={`mb-4 flex h-[3.75rem] w-[3.75rem] items-center justify-center rounded-2xl ${item.iconWrapClassName}`}
        >
          <Icon className="h-8 w-8" strokeWidth={1.65} aria-hidden />
        </div>

        <p className="text-[15px] font-bold leading-tight" style={{ color: NAVY }}>
          {item.title}
        </p>
        <p className="mt-2 max-w-[9.5rem] text-[12px] leading-snug" style={{ color: MUTED }}>
          {item.description}
        </p>
      </button>
    </li>
  );
}

export default function ServicesPage() {
  const { t } = useTranslation('services');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();

  const notifySoon = () => {
    toast.message(tc('comingSoon'));
  };

  const menuItems = useMemo<ServiceMenuItem[]>(
    () =>
      SERVICE_MENU.map((item) => ({
        ...item,
        title: t(item.titleKey),
        description: t(item.descriptionKey),
      })),
    [t],
  );

  return (
    <div
      className="flex min-h-[100dvh] flex-col pb-[calc(4rem+env(safe-area-inset-bottom,0px))]"
      style={{ backgroundColor: PAGE_BG }}
    >
      <header className="services-subheader sticky top-0 z-10 safe-t">
        <div className="mx-auto grid max-w-lg grid-cols-[3rem_1fr_3rem] items-center px-2 py-3.5">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="btn-touch flex h-11 w-11 items-center justify-center touch-manipulation"
            style={{ color: NAVY }}
            aria-label={t('backAria')}
          >
            <ArrowLeft className="h-6 w-6" strokeWidth={2} aria-hidden />
          </button>
          <h1
            className="text-center text-[13px] font-bold uppercase tracking-[0.18em]"
            style={{ color: NAVY }}
          >
            {t('title')}
          </h1>
          <span className="w-11" aria-hidden />
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 safe-x px-4 pt-5 pb-6">
        <nav aria-label={t('navAria')}>
          <ul className="grid grid-cols-2 gap-4">
            {menuItems.map((item) => (
              <ServiceMenuCard
                key={item.id}
                item={item}
                showComingBadge={item.id === 'event'}
                onClick={
                  item.id === 'event'
                    ? notifySoon
                    : item.id === 'book-for-others'
                      ? () => navigate('/services/book-for-others')
                      : item.id === 'courier'
                        ? () => navigate('/services/courier')
                        : item.id === 'haulage'
                          ? () => navigate('/services/haulage')
                          : item.id === 'schedule'
                            ? () => navigate('/services/schedule')
                            : undefined
                }
              />
            ))}
          </ul>
        </nav>
      </main>
    </div>
  );
}
