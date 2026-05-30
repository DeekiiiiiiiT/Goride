import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarDays,
  Clock,
  Package,
  UserPlus,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import {
  BADGE_BG,
  BADGE_TEXT,
  NAVY,
  SERVICES_MUTED as MUTED,
  SERVICES_PAGE_BG as PAGE_BG,
} from '@/lib/passengerTheme';

type ServiceMenuItem = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  iconWrapClassName: string;
};

const SERVICE_MENU: ServiceMenuItem[] = [
  {
    id: 'book-for-other',
    title: 'Book for someone',
    description: 'Friend, child, or family member',
    icon: UserPlus,
    iconWrapClassName: 'bg-[#E8F1FC] text-[#4A7FD4]',
  },
  {
    id: 'courier',
    title: 'Courier',
    description: 'Send packages across town',
    icon: Package,
    iconWrapClassName: 'bg-[#FFF0E6] text-[#E07A3A]',
  },
  {
    id: 'event',
    title: 'Event booking',
    description: 'Weddings, parties, group trips',
    icon: CalendarDays,
    iconWrapClassName: 'bg-[#F0EBFA] text-[#7B5CB8]',
  },
  {
    id: 'schedule',
    title: 'Schedule',
    description: 'Plan a ride for later time',
    icon: Clock,
    iconWrapClassName: 'bg-[#E8F6EE] text-[#3D9A5F]',
  },
];

function ServiceMenuCard({
  item,
  onClick,
  showComingBadge = true,
}: {
  item: ServiceMenuItem;
  onClick?: () => void;
  showComingBadge?: boolean;
}) {
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
        }`}
        aria-disabled={!interactive}
      >
        {showComingBadge ? (
          <span
            className="absolute right-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide"
            style={{ backgroundColor: BADGE_BG, color: BADGE_TEXT }}
          >
            Coming
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
  const navigate = useNavigate();

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
            aria-label="Back to home"
          >
            <ArrowLeft className="h-6 w-6" strokeWidth={2} aria-hidden />
          </button>
          <h1
            className="text-center text-[13px] font-bold uppercase tracking-[0.18em]"
            style={{ color: NAVY }}
          >
            Choose a service
          </h1>
          <span className="w-11" aria-hidden />
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 safe-x px-4 pt-5 pb-6">
        <nav aria-label="Roam services">
          <ul className="grid grid-cols-2 gap-4">
            {SERVICE_MENU.map((item) => (
              <ServiceMenuCard
                key={item.id}
                item={item}
                showComingBadge={false}
                onClick={
                  item.id === 'book-for-other'
                    ? () => navigate('/services/book-for-someone')
                    : item.id === 'courier'
                      ? () => navigate('/services/courier')
                      : item.id === 'schedule'
                        ? () => navigate('/services/schedule')
                        : item.id === 'event'
                          ? () => navigate('/services/event')
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
