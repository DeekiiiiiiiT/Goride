import React from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import type { StackedRouteStop } from '@/lib/mockStackedRoute';

type StackedLegCompletePageProps = {
  stop: StackedRouteStop;
  nextCustomerName?: string;
  onContinue: () => void;
};

export function StackedLegCompletePage({
  stop,
  nextCustomerName,
  onContinue,
}: StackedLegCompletePageProps) {
  const customer = stop.customerName ?? 'Customer';

  return (
    <div className="fixed inset-0 z-[70] bg-background flex flex-col overflow-hidden">
      <div className="absolute inset-0 pointer-events-none flex justify-center items-center opacity-10">
        <div className="w-[500px] h-[500px] rounded-full bg-success blur-[100px]" />
      </div>

      <main className="flex-1 flex flex-col items-center justify-center px-[var(--spacing-edge)] text-center relative z-10">
        <div className="w-32 h-32 bg-success/10 rounded-full flex items-center justify-center shadow-[0_12px_40px_rgba(34,197,94,0.15)] mb-6 courier-scale-in">
          <MaterialIcon name="check_circle" className="text-[72px] text-success" filled />
        </div>

        <h1 className="text-[28px] font-bold text-on-background mb-4">
          Delivery to {customer} Complete!
        </h1>

        <div className="inline-flex items-center gap-2 bg-surface-container-high px-4 py-2 rounded-full border border-surface-dim shadow-soft mb-2">
          <MaterialIcon name="payments" className="text-success" filled />
          <span className="text-xl font-bold text-success">J${stop.earnings} earned</span>
        </div>

        <p className="text-sm text-on-surface-variant">Earnings added to this batch</p>
      </main>

      <div className="fixed bottom-0 w-full px-[var(--spacing-edge)] pb-safe pt-6 bg-gradient-to-t from-background via-background to-transparent z-20">
        {stop.distanceToNextKm != null && nextCustomerName && (
          <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant flex items-center justify-center gap-1 mb-4">
            <MaterialIcon name="location_on" className="text-base" />
            {nextCustomerName} is {stop.distanceToNextKm} km away
          </p>
        )}
        <button
          type="button"
          onClick={onContinue}
          className="w-full min-h-14 bg-primary text-on-primary text-xl font-semibold rounded-xl shadow-[0_6px_24px_rgba(0,108,73,0.2)] active:scale-95 transition-all flex items-center justify-center gap-2"
        >
          Continue to Next Stop
          <MaterialIcon name="arrow_forward" />
        </button>
      </div>
    </div>
  );
}
