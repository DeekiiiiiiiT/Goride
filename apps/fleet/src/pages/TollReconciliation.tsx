import React from 'react';
import { ReconciliationDashboard } from '../components/toll-tags/reconciliation/ReconciliationDashboard';
import { cn } from '../components/ui/utils';

export function TollReconciliation({
  focusVehicleId,
  focusDriverId,
  focusVehicleLabel,
  initialWeekStart,
  embedded = false,
}: {
  focusVehicleId?: string;
  focusDriverId?: string;
  focusVehicleLabel?: string;
  /** Monday week start from Close Week Review / Week Reconciliation hub. */
  initialWeekStart?: string;
  /** When true, omit outer page padding — Week Reconciliation hub owns chrome. */
  embedded?: boolean;
} = {}) {
  return (
    <div className={cn(embedded ? undefined : 'p-6')}>
      <ReconciliationDashboard
        initialDriverId={focusDriverId}
        initialWeekStart={initialWeekStart}
        focusVehicleId={focusVehicleId}
        focusVehicleLabel={focusVehicleLabel}
      />
    </div>
  );
}
