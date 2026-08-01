import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import { FleetModuleHost } from '@/fleet-bridge/FleetModuleHost';

function BridgeFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
      Loading fuel…
    </div>
  );
}

type FuelTab = 'logs' | 'reimbursements' | 'cards';

const LazyFuelManagement = lazy(() =>
  import('@fleet/pages/FuelManagement').then((m) => ({ default: m.FuelManagement })),
) as LazyExoticComponent<ComponentType<{ defaultTab?: string }>>;

const LazyFuelAnalytics = lazy(() =>
  import('@fleet/components/fuel/analytics/FuelAnalytics').then((m) => ({
    default: m.FuelAnalytics,
  })),
);

function BridgedFuelTab({ defaultTab }: { defaultTab: FuelTab }) {
  return (
    <FleetModuleHost>
      <Suspense fallback={<BridgeFallback />}>
        <LazyFuelManagement defaultTab={defaultTab} />
      </Suspense>
    </FleetModuleHost>
  );
}

/** Transaction Logs (Fleet fuel-logs). */
export function BridgedFuelLogsPage() {
  return <BridgedFuelTab defaultTab="logs" />;
}

/** Review Queue (Fleet fuel reimbursements). */
export function BridgedFuelReviewQueuePage() {
  return <BridgedFuelTab defaultTab="reimbursements" />;
}

/** Fuel Cards. */
export function BridgedFuelCardsPage() {
  return <BridgedFuelTab defaultTab="cards" />;
}

/** Fuel Analytics dashboard. */
export function BridgedFuelAnalyticsPage() {
  return (
    <FleetModuleHost>
      <Suspense fallback={<BridgeFallback />}>
        <LazyFuelAnalytics />
      </Suspense>
    </FleetModuleHost>
  );
}

/** @deprecated Prefer BridgedFuelLogsPage — kept for old /app/fuel route. */
export const BridgedFuelPage = BridgedFuelLogsPage;
