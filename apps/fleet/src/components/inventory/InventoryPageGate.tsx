import { Suspense, lazy } from 'react';
import { useInventoryPhase2Enabled } from '../../hooks/useInventoryPhase2Flag';

const InventoryPage = lazy(() =>
  import('./InventoryPage').then((m) => ({ default: m.InventoryPage })),
);

export function InventoryPageGate() {
  const enabled = useInventoryPhase2Enabled();
  if (!enabled) {
    return (
      <div className="p-space-xl text-body-md text-slate-600">
        Inventory Phase 2 is not enabled for this org yet. Turn on{' '}
        <code className="text-sm">fleet_inventory_phase2_stock</code> or set{' '}
        <code className="text-sm">VITE_FLEET_INVENTORY_PHASE2=1</code> for local testing.
      </div>
    );
  }
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-500">Loading inventory…</div>}>
      <InventoryPage />
    </Suspense>
  );
}
