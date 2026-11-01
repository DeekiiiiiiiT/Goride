import React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "../../ui/button";

export function MaintenanceHubLoadingState() {
  return (
    <div className="bg-surface-container-lowest rounded-xl p-6 shadow-sm flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-on-surface">Vehicle Service Ledger</h3>
        <span className="font-mono text-[11px] text-stitch-secondary flex items-center gap-1">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Fetching fleet assets…
        </span>
      </div>
      <div className="space-y-2 animate-pulse">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-10 bg-surface-container-low rounded-lg w-full" />
        ))}
      </div>
    </div>
  );
}

export function MaintenanceHubErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-xl border border-error-container bg-error-container/40 px-4 py-6 flex flex-col gap-3 items-start">
      <div className="flex items-center gap-2 text-on-error-container">
        <span className="material-symbols-outlined text-[20px]">error</span>
        <h3 className="font-semibold">Could not load fleet maintenance</h3>
      </div>
      <p className="text-sm text-on-error-container/90">{message}</p>
      {onRetry ? (
        <Button type="button" variant="outline" size="sm" onClick={onRetry} className="gap-1">
          <span className="material-symbols-outlined text-[16px]">sync</span>
          Retry
        </Button>
      ) : null}
    </div>
  );
}

export function MaintenanceHubEmptyState({ onGoToVehicles }: { onGoToVehicles?: () => void }) {
  return (
    <div className="bg-surface-container-lowest rounded-xl p-10 shadow-sm text-center flex flex-col items-center gap-3">
      <div className="w-12 h-12 rounded-xl bg-surface-container-high flex items-center justify-center">
        <span className="material-symbols-outlined text-[24px] text-stitch-secondary">directions_car</span>
      </div>
      <h3 className="text-lg font-semibold text-on-surface">No vehicles in maintenance yet</h3>
      <p className="text-sm text-stitch-secondary max-w-md">
        Add cars in Vehicles first — they appear here immediately once registered to your fleet.
      </p>
      {onGoToVehicles ? (
        <Button type="button" onClick={onGoToVehicles} className="mt-2">
          Go to Vehicles
        </Button>
      ) : null}
    </div>
  );
}
