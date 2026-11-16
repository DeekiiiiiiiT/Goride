import { Suspense, lazy, useEffect, useState } from 'react';
import { useInventoryPhase2Enabled } from '../../hooks/useInventoryPhase2Flag';
import { InventoryShellProvider } from './InventoryShellContext';
import type { InventoryTabId } from './InventoryTabs';

const InventoryPageBody = lazy(() =>
  import('./InventoryPage').then((m) => ({ default: m.InventoryPageBody })),
);

function tabFromSearch(): InventoryTabId {
  const raw = new URLSearchParams(window.location.search).get('tab');
  const allowed: InventoryTabId[] = [
    'overview',
    'stock',
    'vehicle-kits',
    'assets',
    'movements',
    'alerts',
  ];
  if (raw === 'purchasing' || raw === 'counts') return 'overview';
  return allowed.includes(raw as InventoryTabId) ? (raw as InventoryTabId) : 'overview';
}

export function InventoryPageGate() {
  const enabled = useInventoryPhase2Enabled();
  const [tab, setTab] = useState<InventoryTabId>(() => tabFromSearch());

  useEffect(() => {
    const onPop = () => setTab(tabFromSearch());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const setTabAndUrl = (next: InventoryTabId) => {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', next);
    window.history.replaceState({}, '', url.pathname + url.search);
  };

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
    <InventoryShellProvider tab={tab} setTab={setTabAndUrl}>
      <Suspense fallback={<div className="p-6 text-sm text-slate-500">Loading inventory…</div>}>
        <InventoryPageBody />
      </Suspense>
    </InventoryShellProvider>
  );
}