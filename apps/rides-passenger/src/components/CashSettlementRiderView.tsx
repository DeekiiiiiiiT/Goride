import React from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import type { AssignedDriverSummaryDto } from '@roam/types/delegatedRide';
import type { RideRequestRow } from '@roam/types/rides';
import { LiveRideDriverCard } from '@/components/LiveRideDriverCard';
import { CashPaymentCard } from '@/components/CashPaymentCard';
import { vehicleTypeLabel } from '@roam/business-config/ridesVehicleTypes';

type Props = {
  ride: RideRequestRow;
  assignedDriver?: AssignedDriverSummaryDto | null;
  onMinimize: () => void;
  isFetching?: boolean;
};

/** Rider view while driver confirms cash received (flag-gated). */
export function CashSettlementRiderView({
  ride,
  assignedDriver,
  onMinimize,
  isFetching = false,
}: Props) {
  const serviceLabel = vehicleTypeLabel(ride.vehicle_option);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-zinc-100 dark:bg-zinc-950">
      <header className="sticky top-0 z-20 border-b border-zinc-200/90 bg-white/90 backdrop-blur-md safe-t">
        <div className="mx-auto flex max-w-lg items-center gap-2 px-4 py-3 safe-x">
          <button
            type="button"
            onClick={onMinimize}
            className="btn-touch inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-3 hover:bg-zinc-50 touch-manipulation active:scale-[0.98]"
            aria-label="Minimize tracker"
          >
            <ChevronDown className="h-5 w-5 text-zinc-800" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-zinc-900">Pay your driver</p>
            <p className="truncate text-xs text-zinc-500">Waiting for driver to confirm payment</p>
          </div>
          {isFetching ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-zinc-400" aria-hidden />
          ) : null}
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 space-y-5 px-4 py-6 safe-x safe-b">
        <LiveRideDriverCard assignedDriver={assignedDriver} serviceLabel={serviceLabel} />

        <CashPaymentCard ride={ride} />

        <p className="text-center text-sm leading-relaxed text-zinc-500">
          Your driver will enter the amount they received. You do not need to enter anything in the
          app.
        </p>
      </main>
    </div>
  );
}
