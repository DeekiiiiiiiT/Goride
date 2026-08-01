import { lazy, Suspense } from 'react';
import { FleetModuleHost } from '@/fleet-bridge/FleetModuleHost';

const TollReconciliation = lazy(() =>
  import('@fleet/pages/TollReconciliation').then((m) => ({
    default: m.TollReconciliation,
  })),
);

/** Claims surface — Fleet underpaid/claimable-loss flow via toll reconciliation. */
export function ClaimsBridgePage() {
  return (
    <FleetModuleHost>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Claims</h1>
          <p className="text-sm text-slate-500">
            Resolve underpaid toll claims and related losses for your organization.
          </p>
        </div>
        <Suspense
          fallback={
            <div className="py-12 text-center text-sm text-slate-500">Loading claims…</div>
          }
        >
          <TollReconciliation />
        </Suspense>
      </div>
    </FleetModuleHost>
  );
}
