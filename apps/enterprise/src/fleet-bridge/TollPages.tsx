import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import { FleetModuleHost } from '@/fleet-bridge/FleetModuleHost';

function BridgeFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
      Loading toll…
    </div>
  );
}

const LazyTagInventory = lazy(() =>
  import('@fleet/pages/TagInventory').then((m) => ({ default: m.TagInventory })),
);

function wrap(Lazy: LazyExoticComponent<ComponentType>) {
  return function BridgedTollPage() {
    return (
      <FleetModuleHost>
        <Suspense fallback={<BridgeFallback />}>
          <Lazy />
        </Suspense>
      </FleetModuleHost>
    );
  };
}

export const BridgedTagInventoryPage = wrap(LazyTagInventory);
