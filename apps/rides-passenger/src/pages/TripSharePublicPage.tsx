import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MapPin, ShieldAlert } from 'lucide-react';
import type { TripSharePublicDto } from '@roam/types/tripShare';
import { getTripSharePublic } from '@/services/trustedContactsEdge';
import {
  CARD_SHADOW,
  ERROR,
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  PAGE_BG,
  PRIMARY,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';

export default function TripSharePublicPage() {
  const { token } = useParams<{ token: string }>();
  const { t } = useTranslation('booking');
  const [share, setShare] = useState<TripSharePublicDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const statusLabel = (status: string): string => {
    const key = `tripShare.status.${status}` as const;
    const translated = t(key);
    return translated !== key ? translated : status;
  };

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const load = async () => {
      try {
        const res = await getTripSharePublic(token);
        if (!cancelled) {
          setShare(res.share);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : t('tripShare.linkNotFound'));
          setShare(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    const interval = setInterval(() => {
      void load();
    }, 15000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [token, t]);

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center px-6" style={{ backgroundColor: PAGE_BG }}>
        <p style={{ color: ON_SURFACE_VARIANT }}>{t('tripShare.loading')}</p>
      </div>
    );
  }

  if (error || !share) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center px-6 text-center" style={{ backgroundColor: PAGE_BG }}>
        <p className="text-lg font-semibold" style={{ color: ON_SURFACE }}>
          {t('tripShare.unavailable')}
        </p>
        <p className="mt-2 text-sm" style={{ color: ON_SURFACE_VARIANT }}>
          {error ?? t('tripShare.expiredHint')}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] px-5 py-8 safe-x" style={{ backgroundColor: PAGE_BG, color: ON_SURFACE }}>
      <div className="mx-auto max-w-md space-y-6">
        {share.is_emergency ? (
          <div
            className="flex items-center gap-3 rounded-2xl p-4"
            style={{ backgroundColor: 'rgba(186,26,26,0.1)', color: ERROR }}
          >
            <ShieldAlert className="h-6 w-6 shrink-0" aria-hidden />
            <p className="text-sm font-semibold">{t('tripShare.emergencyAlert')}</p>
          </div>
        ) : null}

        <header>
          <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
            {t('tripShare.riderTrip', { name: share.rider_first_name })}
          </p>
          <h1 className="mt-1 text-2xl font-bold" style={{ color: PRIMARY }}>
            {statusLabel(share.status)}
          </h1>
          {share.expired ? (
            <p className="mt-2 text-sm" style={{ color: ON_SURFACE_VARIANT }}>
              {t('tripShare.linkExpired')}
            </p>
          ) : null}
        </header>

        <div className="space-y-3 rounded-[24px] p-5" style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}>
          {share.pickup_address ? (
            <div className="flex gap-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" style={{ color: PRIMARY }} aria-hidden />
              <div>
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color: ON_SURFACE_VARIANT }}>
                  {t('pickup')}
                </p>
                <p className="text-sm">{share.pickup_address}</p>
              </div>
            </div>
          ) : null}
          {share.dropoff_address ? (
            <div className="flex gap-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" style={{ color: PRIMARY }} aria-hidden />
              <div>
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color: ON_SURFACE_VARIANT }}>
                  {t('bookForSomeone.dropoff')}
                </p>
                <p className="text-sm">{share.dropoff_address}</p>
              </div>
            </div>
          ) : null}
          {share.vehicle_label ? (
            <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
              {t('tripShare.vehicle', { label: share.vehicle_label })}
            </p>
          ) : null}
          {share.eta_pickup_seconds_estimate != null && share.eta_pickup_seconds_estimate > 0 ? (
            <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
              {t('tripShare.etaPickup', { minutes: Math.ceil(share.eta_pickup_seconds_estimate / 60) })}
            </p>
          ) : null}
          {share.message ? (
            <p className="rounded-xl p-3 text-sm italic" style={{ backgroundColor: PAGE_BG, color: ON_SURFACE_VARIANT }}>
              &ldquo;{share.message}&rdquo;
            </p>
          ) : null}
        </div>

        <p className="text-center text-xs" style={{ color: ON_SURFACE_VARIANT }}>
          {t('tripShare.footer')}
        </p>
      </div>
    </div>
  );
}
