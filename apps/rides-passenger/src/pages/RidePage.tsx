import React, { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Loader2 } from 'lucide-react';
import type { RideRequestStatus } from '@roam/types';
import { formatMoneyMinor } from '@roam/types';
import { ridesCancelRequest, ridesGetRequest } from '@/services/ridesEdge';

function statusLabel(s: RideRequestStatus): string {
  switch (s) {
    case 'matching':
      return 'Finding a nearby driver…';
    case 'driver_assigned':
      return 'Driver assigned';
    case 'driver_en_route_pickup':
      return 'Driver is on the way';
    case 'driver_arrived_pickup':
      return 'Driver has arrived';
    case 'on_trip':
      return 'On trip';
    case 'completed':
      return 'Trip completed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return s;
  }
}

export default function RidePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data, error, refetch, isFetching } = useQuery({
    queryKey: ['ride', id],
    enabled: Boolean(id),
    queryFn: () => ridesGetRequest(id!),
    refetchInterval: (q) => {
      const st = q.state.data?.ride.status;
      if (!st || st === 'completed' || st === 'cancelled') return false;
      return 4000;
    },
  });

  useEffect(() => {
    if (error) toast.error(error instanceof Error ? error.message : 'Failed to load ride');
  }, [error]);

  const ride = data?.ride;

  const cancel = async () => {
    if (!id) return;
    try {
      await ridesCancelRequest(id, 'rider_changed_plans');
      toast.success('Ride cancelled');
      await refetch();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Cancel failed');
    }
  };

  if (!id) return null;

  return (
    <div className="min-h-[100dvh] flex flex-col bg-zinc-100">
      <header className="sticky top-0 z-20 border-b border-zinc-200/90 bg-white/90 backdrop-blur-md safe-t">
        <div className="max-w-lg mx-auto safe-x px-4 py-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="btn-touch inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-3 hover:bg-zinc-50 touch-manipulation active:scale-[0.98]"
            aria-label="Back to home"
          >
            <ArrowLeft className="w-5 h-5 text-zinc-800" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-zinc-900 truncate">Live ride</p>
            <p className="text-xs text-zinc-500 truncate">Updates every few seconds</p>
          </div>
          {isFetching && (
            <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500 shrink-0">
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
              Syncing
            </span>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-lg mx-auto w-full safe-x safe-b px-4 py-6 space-y-5">
        {!ride ? (
          <div className="rounded-3xl bg-white ring-1 ring-zinc-200/90 p-10 flex flex-col items-center gap-4 shadow-lg shadow-zinc-900/5">
            <Loader2 className="w-10 h-10 text-emerald-600 animate-spin" aria-hidden />
            <p className="text-zinc-600 text-base font-medium">Loading your ride…</p>
          </div>
        ) : (
          <>
            <div className="rounded-3xl bg-white border border-zinc-200/90 p-5 sm:p-6 shadow-xl shadow-zinc-900/6 space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Status
                </span>
                {(ride.status === 'matching' || ride.status === 'driver_en_route_pickup') && (
                  <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden />
                )}
              </div>
              <p className="text-xl sm:text-2xl font-semibold text-zinc-900 leading-snug">
                {statusLabel(ride.status)}
              </p>
              <div className="space-y-3 pt-1 border-t border-zinc-100">
                <div>
                  <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1">Pickup</p>
                  <p className="text-base text-zinc-700 leading-relaxed">{ride.pickup_address ?? 'Pickup'}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1">Drop-off</p>
                  <p className="text-base text-zinc-700 leading-relaxed">{ride.dropoff_address ?? 'Drop-off'}</p>
                </div>
              </div>
            </div>

            {(ride.status === 'matching' || ride.status === 'driver_assigned') && (
              <div className="flex flex-col gap-3">
                {ride.status === 'matching' && (
                  <button
                    type="button"
                    onClick={cancel}
                    className="btn-touch w-full rounded-2xl border border-zinc-300 bg-white text-base font-semibold text-zinc-800 hover:bg-zinc-50 touch-manipulation active:scale-[0.99]"
                  >
                    Cancel search
                  </button>
                )}
              </div>
            )}

            {ride.status === 'completed' && (
              <div className="rounded-3xl bg-white border border-emerald-100 p-5 sm:p-6 shadow-xl shadow-emerald-900/10 space-y-4 bg-gradient-to-b from-emerald-50/50 to-white">
                <div className="text-xs font-semibold uppercase tracking-wider text-emerald-800">
                  Receipt
                </div>
                <div className="flex justify-between items-baseline gap-4">
                  <span className="text-base text-zinc-600">Total</span>
                  <span className="text-2xl font-bold tabular-nums text-zinc-900">
                    {formatMoneyMinor(
                      ride.fare_final_minor ?? ride.fare_estimate_minor,
                      ride.currency ?? 'JMD',
                    )}
                  </span>
                </div>
                <Link
                  to="/"
                  className="btn-touch flex items-center justify-center w-full rounded-2xl bg-emerald-600 text-white text-base font-semibold hover:bg-emerald-700 shadow-md shadow-emerald-600/20"
                >
                  Book another ride
                </Link>
              </div>
            )}

            {ride.status === 'cancelled' && (
              <div className="rounded-3xl bg-white border border-zinc-200 p-6 text-center space-y-4 shadow-lg shadow-zinc-900/5">
                <p className="text-zinc-700 text-base leading-relaxed">
                  This ride was cancelled
                  {ride.cancel_reason ? `: ${ride.cancel_reason}` : '.'}
                </p>
                <Link
                  to="/"
                  className="btn-touch inline-flex items-center justify-center w-full rounded-2xl bg-zinc-900 text-white text-base font-semibold hover:bg-zinc-800"
                >
                  Start over
                </Link>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
