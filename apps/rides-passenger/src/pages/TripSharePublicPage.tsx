import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
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

function statusLabel(status: string): string {
  switch (status) {
    case 'matching':
      return 'Finding a driver';
    case 'driver_assigned':
      return 'Driver assigned';
    case 'driver_en_route_pickup':
      return 'Driver en route';
    case 'driver_arrived_pickup':
      return 'Driver has arrived';
    case 'on_trip':
      return 'On trip';
    case 'completed':
      return 'Trip completed';
    case 'cancelled':
      return 'Trip cancelled';
    default:
      return status;
  }
}

export default function TripSharePublicPage() {
  const { token } = useParams<{ token: string }>();
  const [share, setShare] = useState<TripSharePublicDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          setError(e instanceof Error ? e.message : 'Link not found');
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
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center px-6" style={{ backgroundColor: PAGE_BG }}>
        <p style={{ color: ON_SURFACE_VARIANT }}>Loading trip…</p>
      </div>
    );
  }

  if (error || !share) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center px-6 text-center" style={{ backgroundColor: PAGE_BG }}>
        <p className="text-lg font-semibold" style={{ color: ON_SURFACE }}>
          This link is unavailable
        </p>
        <p className="mt-2 text-sm" style={{ color: ON_SURFACE_VARIANT }}>
          {error ?? 'The trip share link may have expired.'}
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
            <p className="text-sm font-semibold">Emergency safety alert</p>
          </div>
        ) : null}

        <header>
          <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
            {share.rider_first_name}&apos;s Roam trip
          </p>
          <h1 className="mt-1 text-2xl font-bold" style={{ color: PRIMARY }}>
            {statusLabel(share.status)}
          </h1>
          {share.expired ? (
            <p className="mt-2 text-sm" style={{ color: ON_SURFACE_VARIANT }}>
              This link has expired.
            </p>
          ) : null}
        </header>

        <div className="space-y-3 rounded-[24px] p-5" style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}>
          {share.pickup_address ? (
            <div className="flex gap-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" style={{ color: PRIMARY }} aria-hidden />
              <div>
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color: ON_SURFACE_VARIANT }}>
                  Pickup
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
                  Drop-off
                </p>
                <p className="text-sm">{share.dropoff_address}</p>
              </div>
            </div>
          ) : null}
          {share.vehicle_label ? (
            <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
              Vehicle: {share.vehicle_label}
            </p>
          ) : null}
          {share.eta_pickup_seconds_estimate != null && share.eta_pickup_seconds_estimate > 0 ? (
            <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
              ETA to pickup: ~{Math.ceil(share.eta_pickup_seconds_estimate / 60)} min
            </p>
          ) : null}
          {share.message ? (
            <p className="rounded-xl p-3 text-sm italic" style={{ backgroundColor: PAGE_BG, color: ON_SURFACE_VARIANT }}>
              &ldquo;{share.message}&rdquo;
            </p>
          ) : null}
        </div>

        <p className="text-center text-xs" style={{ color: ON_SURFACE_VARIANT }}>
          Link expires when the trip ends. Roam — ride with confidence.
        </p>
      </div>
    </div>
  );
}
