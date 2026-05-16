import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { DriverOfferWithRide, RideRequestRow } from '@roam/types/rides';
import { formatMoneyMinor } from '@roam/types/rides';
import {
  ridesDriverAcceptOffer,
  ridesDriverDeclineOffer,
  ridesDriverGetRequest,
  ridesDriverPendingOffers,
  ridesDriverPresence,
  ridesDriverTransition,
} from '../../services/ridesDriverEdge';

function statusTitle(r: RideRequestRow | null): string {
  if (!r) return '—';
  switch (r.status) {
    case 'matching':
      return 'Matching…';
    case 'driver_assigned':
      return 'Assigned — start heading to pickup';
    case 'driver_en_route_pickup':
      return 'En route to pickup';
    case 'driver_arrived_pickup':
      return 'Arrived at pickup';
    case 'on_trip':
      return 'On trip';
    case 'completed':
      return 'Completed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return r.status;
  }
}

export function RideDispatchPage() {
  const [online, setOnline] = useState(false);
  const [offers, setOffers] = useState<DriverOfferWithRide[]>([]);
  const [activeRide, setActiveRide] = useState<RideRequestRow | null>(null);
  const watchId = useRef<number | null>(null);

  const refreshOffers = useCallback(async () => {
    try {
      const { offers: o } = await ridesDriverPendingOffers();
      setOffers(o);
    } catch {
      /* offline / unauthorized handled elsewhere */
    }
  }, []);

  const pollActiveRide = useCallback(async (id: string) => {
    try {
      const { ride } = await ridesDriverGetRequest(id);
      setActiveRide(ride);
      if (ride.status === 'completed' || ride.status === 'cancelled') return false;
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (!online) return;
    const id = window.setInterval(refreshOffers, 4000);
    refreshOffers();
    return () => clearInterval(id);
  }, [online, refreshOffers]);

  useEffect(() => {
    if (!online || !navigator.geolocation) return;
    watchId.current = navigator.geolocation.watchPosition(
      async (pos) => {
        try {
          await ridesDriverPresence({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            heading_degrees: pos.coords.heading ?? undefined,
            available_for_rides: true,
          });
        } catch (e: unknown) {
          console.warn('presence failed', e);
        }
      },
      () => toast.error('Location permission needed for ride matching'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    return () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    };
  }, [online]);

  useEffect(() => {
    if (!activeRide?.id) return;
    const t = window.setInterval(async () => {
      const keep = await pollActiveRide(activeRide.id);
      if (!keep) window.clearInterval(t);
    }, 4000);
    return () => clearInterval(t);
  }, [activeRide?.id, pollActiveRide]);

  const goOffline = async () => {
    setOnline(false);
    setOffers([]);
  };

  const accept = async (offer: DriverOfferWithRide) => {
    try {
      const { ride } = await ridesDriverAcceptOffer(offer.id);
      setActiveRide(ride);
      toast.success('Ride assigned — head to pickup');
      await refreshOffers();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not accept');
    }
  };

  const decline = async (offer: DriverOfferWithRide) => {
    try {
      await ridesDriverDeclineOffer(offer.id);
      toast.message('Offer declined');
      await refreshOffers();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not decline');
    }
  };

  const advance = async (status: RideRequestRow['status']) => {
    if (!activeRide) return;
    try {
      const { ride } = await ridesDriverTransition(activeRide.id, { status });
      setActiveRide(ride);
      toast.success('Updated');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Transition failed');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-50 px-4 py-6 max-w-lg mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Passenger rides</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">Uber-style offers from roam-s.co</p>
        </div>
        <button
          type="button"
          onClick={() => (online ? goOffline() : setOnline(true))}
          className={`rounded-full px-4 py-1.5 text-xs font-semibold ${
            online
              ? 'bg-emerald-600 text-white'
              : 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-100'
          }`}
        >
          {online ? 'Online' : 'Go online'}
        </button>
      </div>

      {!online && (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Go online to broadcast your location to the matcher and receive ride offers.
        </p>
      )}

      {online && offers.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Incoming offers</h2>
          <ul className="space-y-2">
            {offers.map((o) => (
              <li
                key={o.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col gap-2"
              >
                <div className="text-xs text-slate-500 space-y-1">
                  <p>
                    Wave {o.wave} · {o.distance_km != null ? `${o.distance_km.toFixed(2)} km to pickup` : '—'}
                  </p>
                  {o.ride && (
                    <>
                      <p className="text-slate-700 dark:text-slate-200 font-medium truncate">
                        {o.ride.pickup_address ?? 'Pickup'} → {o.ride.dropoff_address ?? 'Drop-off'}
                      </p>
                      <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                        {formatMoneyMinor(o.ride.fare_estimate_minor, o.ride.currency ?? 'JMD')}
                        {o.ride.surge_multiplier > 1 ? (
                          <span className="text-amber-700 dark:text-amber-400 font-normal ml-1">
                            · surge ×{o.ride.surge_multiplier.toFixed(2)}
                          </span>
                        ) : null}
                      </p>
                    </>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="flex-1 rounded-xl bg-emerald-600 text-white py-2 text-sm font-medium"
                    onClick={() => accept(o)}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="flex-1 rounded-xl border border-slate-300 dark:border-slate-600 py-2 text-sm"
                    onClick={() => decline(o)}
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {activeRide && (
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active ride</h2>
          <p className="text-sm font-medium">{statusTitle(activeRide)}</p>
          <p className="text-xs text-slate-600 dark:text-slate-300">{activeRide.pickup_address ?? 'Pickup'}</p>
          <p className="text-xs text-slate-600 dark:text-slate-300">{activeRide.dropoff_address ?? 'Drop-off'}</p>
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
            Fare: {formatMoneyMinor(activeRide.fare_estimate_minor, activeRide.currency ?? 'JMD')}
          </p>

          <div className="flex flex-wrap gap-2 pt-2">
            {activeRide.status === 'driver_assigned' && (
              <button
                type="button"
                className="rounded-xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 px-3 py-2 text-xs font-medium"
                onClick={() => advance('driver_en_route_pickup')}
              >
                Start navigation
              </button>
            )}
            {activeRide.status === 'driver_en_route_pickup' && (
              <button
                type="button"
                className="rounded-xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 px-3 py-2 text-xs font-medium"
                onClick={() => advance('driver_arrived_pickup')}
              >
                Arrived at pickup
              </button>
            )}
            {activeRide.status === 'driver_arrived_pickup' && (
              <button
                type="button"
                className="rounded-xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 px-3 py-2 text-xs font-medium"
                onClick={() => advance('on_trip')}
              >
                Start trip
              </button>
            )}
            {activeRide.status === 'on_trip' && (
              <button
                type="button"
                className="rounded-xl bg-emerald-600 text-white px-3 py-2 text-xs font-medium"
                onClick={() => advance('completed')}
              >
                Complete trip
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
