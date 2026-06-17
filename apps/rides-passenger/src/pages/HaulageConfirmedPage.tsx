import React from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { formatMoneyMinor } from '@roam/types/rides';
import type { HaulageConfirmation } from '@/lib/haulage/types';
import { PAGE_BG, PRIMARY } from '@/lib/passengerTheme';

type LocationState = {
  confirmation?: HaulageConfirmation;
};

export default function HaulageConfirmedPage() {
  const { t } = useTranslation('haulage');
  const navigate = useNavigate();
  const location = useLocation();
  const data = (location.state as LocationState | null)?.confirmation;

  if (!data) {
    return (
      <div
        className="flex min-h-[100dvh] flex-col items-center justify-center px-6"
        style={{ backgroundColor: PAGE_BG }}
      >
        <p className="text-sm text-gray-500">{t('confirmed.unavailable')}</p>
        <button
          type="button"
          className="mt-4 text-sm font-semibold"
          style={{ color: PRIMARY }}
          onClick={() => navigate('/services/haulage')}
        >
          {t('confirmed.retry')}
        </button>
      </div>
    );
  }

  const fareLabel = formatMoneyMinor(data.estimatedTotalMinor, data.currency);

  return (
    <div
      className="flex min-h-[100dvh] flex-col pb-24"
      style={{ backgroundColor: PAGE_BG }}
    >
      <header className="sticky top-0 z-10 flex h-16 items-center border-b px-4 safe-t" style={{ borderColor: 'var(--passenger-outline-variant)' }}>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="rounded-full p-2 active:scale-95"
          style={{ color: PRIMARY }}
          aria-label={t('backAria')}
        >
          <ArrowLeft className="h-6 w-6" />
        </button>
        <h1 className="ml-3 text-xl font-semibold" style={{ color: PRIMARY }}>
          {t('confirmed.title')}
        </h1>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 space-y-4 px-6 py-6 safe-x">
        <div className="flex flex-col items-center rounded-2xl border p-6 text-center" style={{ borderColor: 'var(--passenger-outline-variant)', backgroundColor: '#fff' }}>
          <CheckCircle2 className="mb-3 h-12 w-12" style={{ color: PRIMARY }} />
          <h2 className="text-xl font-bold">{t('confirmed.heading')}</h2>
          <p className="mt-2 text-sm text-gray-500">{t('confirmed.ref', { ref: data.bookingRef })}</p>
          <p className="mt-4 text-2xl font-bold">{fareLabel}</p>
          <p className="mt-1 text-xs text-gray-500">{t('confirmed.inclFees')}</p>
        </div>

        <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--passenger-outline-variant)', backgroundColor: '#fff' }}>
          <p className="font-semibold">{t('confirmed.summary')}</p>
          <p className="mt-2 text-gray-600">{data.pickupAddress}</p>
          <p className="text-gray-400">↓</p>
          <p className="text-gray-600">{data.dropoffAddress}</p>
          <p className="mt-3 text-xs text-gray-500">
            {t('confirmed.itemCount', { count: data.itemCount })}
          </p>
        </div>

        <button
          type="button"
          onClick={() => navigate('/activity')}
          className="haulage-primary-btn w-full rounded-xl py-4 font-semibold"
        >
          {t('confirmed.viewActivity')}
        </button>
      </main>
    </div>
  );
}
