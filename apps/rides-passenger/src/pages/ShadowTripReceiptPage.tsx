import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ridesGetRequest } from '@/services/ridesEdge';
import { formatFareMinor } from '@/services/tripIntentEdge';
import { ON_SURFACE, ON_SURFACE_VARIANT, PAGE_BG, PRIMARY, SURFACE_LOWEST } from '@/lib/passengerTheme';

export default function ShadowTripReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [ride, setRide] = useState<Awaited<ReturnType<typeof ridesGetRequest>> | null>(null);

  useEffect(() => {
    if (!id) return;
    void ridesGetRequest(id).then(setRide).catch(() => undefined);
  }, [id]);

  const r = ride?.ride;

  return (
    <div className="flex min-h-[100dvh] flex-col" style={{ backgroundColor: PAGE_BG }}>
      <header className="flex h-16 items-center px-4 safe-t">
        <button type="button" onClick={() => navigate('/account/wallet')} className="rounded-full p-2" style={{ color: PRIMARY }}>
          <ArrowLeft className="h-6 w-6" />
        </button>
        <h1 className="ml-2 text-lg font-semibold" style={{ color: ON_SURFACE }}>
          Shadow trip receipt
        </h1>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 space-y-4 px-4 py-6">
        {r ? (
          <div className="space-y-4 rounded-2xl p-5" style={{ backgroundColor: SURFACE_LOWEST }}>
            <p className="text-sm font-semibold uppercase tracking-wide" style={{ color: ON_SURFACE_VARIANT }}>
              Shadow trip
            </p>
            <p className="text-2xl font-bold" style={{ color: ON_SURFACE }}>
              {formatFareMinor(r.fare_estimate_minor, r.currency)}
            </p>
            <dl className="space-y-3 text-sm">
              <div>
                <dt style={{ color: ON_SURFACE_VARIANT }}>Rider</dt>
                <dd className="font-medium" style={{ color: ON_SURFACE }}>{r.guest_passenger_name ?? 'Passenger'}</dd>
              </div>
              <div>
                <dt style={{ color: ON_SURFACE_VARIANT }}>Pickup time</dt>
                <dd className="font-medium" style={{ color: ON_SURFACE }}>
                  {r.created_at ? new Date(r.created_at).toLocaleString() : '—'}
                </dd>
              </div>
              <div>
                <dt style={{ color: ON_SURFACE_VARIANT }}>Drop-off time</dt>
                <dd className="font-medium" style={{ color: ON_SURFACE }}>
                  {r.updated_at && r.status === 'completed' ? new Date(r.updated_at).toLocaleString() : '—'}
                </dd>
              </div>
            </dl>
            <p className="text-xs" style={{ color: ON_SURFACE_VARIANT }}>
              Location details are not shown on Shadow trips.
            </p>
          </div>
        ) : (
          <p style={{ color: ON_SURFACE_VARIANT }}>Loading receipt…</p>
        )}
      </main>
    </div>
  );
}
