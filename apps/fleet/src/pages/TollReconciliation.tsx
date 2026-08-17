import React from 'react';
import { ReconciliationDashboard } from "../components/toll-tags/reconciliation/ReconciliationDashboard";

export function TollReconciliation({
  focusVehicleId,
  focusDriverId,
  focusVehicleLabel,
}: {
  focusVehicleId?: string;
  focusDriverId?: string;
  focusVehicleLabel?: string;
} = {}) {
  return (
    <div className="p-6">
      <ReconciliationDashboard
        initialDriverId={focusDriverId}
        focusVehicleId={focusVehicleId}
        focusVehicleLabel={focusVehicleLabel}
      />
    </div>
  );
}
