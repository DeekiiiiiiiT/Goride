import React, { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import type { RideRequestStatus } from '@roam/types/rides';
import { ridesCancelRequest, ridesGetRequest } from '@/services/ridesEdge';

function fmtUsdMinor(minor: number | null | undefined): string {
  if (minor == null) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(minor / 100);
}

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
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button type="button" onClick={() => navigate('/')} className="p-1 rounded-lg hover:bg-zinc-100">
            <ArrowLeft className="w-5 h-5 text-zinc-700" />
          </button>
          <span className="font-medium text-sm tracking-tight">Live ride</span>
          {isFetching && <span className="text-[10px] text-zinc-400 ml-auto">syncing</span>}
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {!ride ? (
          <div className="text-sm text-zinc-500">Loading…</div>
        ) : (
          <>
            <div className="bg-white border border-zinc-200 rounded-2xl p-5 shadow-sm space-y-3">
              <div className="text-xs uppercase tracking-wide text-zinc-400">Status</div>
              <p className="text-lg font-semibold">{statusLabel(ride.status)}</p>
              <p className="text-sm text-zinc-600">{ride.pickup_address ?? 'Pickup'}</p>
              <p className="text-sm text-zinc-600">{ride.dropoff_address ?? 'Drop-off'}</p>
            </div>

            {(ride.status === 'matching' || ride.status === 'driver_assigned') && (
              <div className="flex gap-2">
                {ride.status === 'matching' && (
                  <button
                    type="button"
                    onClick={cancel}
                    className="flex-1 rounded-xl border border-zinc-300 py-2.5 text-sm font-medium hover:bg-white"
                  >
                    Cancel search
                  </button>
                )}
              </div>
            )}

            {ride.status === 'completed' && (
              <div className="bg-white border border-zinc-200 rounded-2xl p-5 shadow-sm space-y-2">
                <div className="text-xs uppercase tracking-wide text-zinc-400">Receipt</div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-600">Total</span>
                  <span className="font-semibold tabular-nums">{fmtUsdMinor(ride.fare_final_minor ?? ride.fare_estimate_minor)}</span>
                </div>
                <Link to="/" className="block text-center text-sm text-zinc-900 font-medium pt-2">
                  Book another ride
                </Link>
              </div>
            )}

            {ride.status === 'cancelled' && (
              <div className="text-center text-sm text-zinc-600 space-y-3">
                <p>This ride was cancelled{ride.cancel_reason ? `: ${ride.cancel_reason}` : '.'}</p>
                <Link to="/" className="text-zinc-900 font-medium underline">
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
