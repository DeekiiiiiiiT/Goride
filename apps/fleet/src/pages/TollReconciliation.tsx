import React from 'react';
import { ReconciliationDashboard } from '../components/toll-tags/reconciliation/ReconciliationDashboard';
import { cn } from '../components/ui/utils';

export function TollReconciliation({
  focusVehicleId,
  focusDriverId,
  focusVehicleLabel,
  embedded = false,
}: {
  focusVehicleId?: string;
  focusDriverId?: string;
  focusVehicleLabel?: string;
  /** When true, omit outer page padding — Week Reconciliation hub owns chrome. */
  embedded?: boolean;
} = {}) {
  return (
    <div className={cn(embedded ? undefined : 'p-6')}>
      <ReconciliationDashboard
        initialDriverId={focusDriverId}
        focusVehicleId={focusVehicleId}
        focusVehicleLabel={focusVehicleLabel}
      />
    </div>
  );
}
