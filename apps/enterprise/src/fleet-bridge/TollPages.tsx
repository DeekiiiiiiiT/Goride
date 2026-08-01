import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import { FleetModuleHost } from '@/fleet-bridge/FleetModuleHost';

function BridgeFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
      Loading toll…
    </div>
  );
}

const LazyTollLogs = lazy(() =>
  import('@fleet/pages/TollLogs').then((m) => ({ default: m.TollLogsPage })),
);

const LazyTagInventory = lazy(() =>
  import('@fleet/pages/TagInventory').then((m) => ({ default: m.TagInventory })),
);

const LazyTollAnalytics = lazy(() =>
  import('@fleet/components/toll/TollAnalytics').then((m) => ({ default: m.TollAnalytics })),
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

export const BridgedTollLogsPage = wrap(LazyTollLogs);
export const BridgedTagInventoryPage = wrap(LazyTagInventory);
export const BridgedTollAnalyticsPage = wrap(LazyTollAnalytics);
