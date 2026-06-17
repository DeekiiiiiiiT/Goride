import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { ridesGetRequest } from '@/services/ridesEdge';
import { delegatedRidePath, isShadowBookerTrip } from '@/lib/delegatedRideNavigation';
import { formatFareMinor } from '@/services/tripIntentEdge';
import { ON_SURFACE, ON_SURFACE_VARIANT, PAGE_BG, PRIMARY, SURFACE_LOWEST } from '@/lib/passengerTheme';

export default function ShadowTripReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('booking');
  const { t: tc } = useTranslation('common');
  const [ride, setRide] = useState<Awaited<ReturnType<typeof ridesGetRequest>> | null>(null);

  useEffect(() => {
    if (!id) return;
    void ridesGetRequest(id)
      .then((res) => {
        const role = res.participant_role;
        const roamMode = res.roam_mode ?? res.ride.roam_mode ?? null;
        if (!isShadowBookerTrip(role, roamMode, res.booker_visibility)) {
          navigate(delegatedRidePath(id, role, roamMode, res.booker_visibility), { replace: true });
          return;
        }
        setRide(res);
      })
      .catch(() => undefined);
  }, [id, navigate]);

  const r = ride?.ride;

  return (
    <div className="flex min-h-[100dvh] flex-col" style={{ backgroundColor: PAGE_BG }}>
      <header className="flex h-16 items-center px-4 safe-t">
        <button type="button" onClick={() => navigate('/account/wallet')} className="rounded-full p-2" style={{ color: PRIMARY }} aria-label={tc('back')}>
          <ArrowLeft className="h-6 w-6" />
        </button>
        <h1 className="ml-2 text-lg font-semibold" style={{ color: ON_SURFACE }}>
          {t('shadow.receiptTitle')}
        </h1>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 space-y-4 px-4 py-6">
        {r ? (
          <div className="space-y-4 rounded-2xl p-5" style={{ backgroundColor: SURFACE_LOWEST }}>
            <p className="text-sm font-semibold uppercase tracking-wide" style={{ color: ON_SURFACE_VARIANT }}>
              {t('shadow.shadowTrip')}
            </p>
            <p className="text-2xl font-bold" style={{ color: ON_SURFACE }}>
              {formatFareMinor(r.fare_estimate_minor, r.currency)}
            </p>
            <dl className="space-y-3 text-sm">
              <div>
                <dt style={{ color: ON_SURFACE_VARIANT }}>{t('shadow.rider')}</dt>
                <dd className="font-medium" style={{ color: ON_SURFACE }}>{r.guest_passenger_name ?? t('shadow.passenger')}</dd>
              </div>
              <div>
                <dt style={{ color: ON_SURFACE_VARIANT }}>{t('shadow.pickupTime')}</dt>
                <dd className="font-medium" style={{ color: ON_SURFACE }}>
                  {r.created_at ? new Date(r.created_at).toLocaleString() : '—'}
                </dd>
              </div>
              <div>
                <dt style={{ color: ON_SURFACE_VARIANT }}>{t('shadow.dropoffTime')}</dt>
                <dd className="font-medium" style={{ color: ON_SURFACE }}>
                  {r.updated_at && r.status === 'completed' ? new Date(r.updated_at).toLocaleString() : '—'}
                </dd>
              </div>
            </dl>
            <p className="text-xs" style={{ color: ON_SURFACE_VARIANT }}>
              {t('shadow.locationHidden')}
            </p>
          </div>
        ) : (
          <p style={{ color: ON_SURFACE_VARIANT }}>{t('shadow.loadingReceipt')}</p>
        )}
      </main>
    </div>
  );
}
