import { lazy, Suspense } from 'react';
import { FleetModuleHost } from '@/fleet-bridge/FleetModuleHost';

function BridgeFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
      Loading module…
    </div>
  );
}

function bridge(loader: () => Promise<{ default: React.ComponentType }>) {
  const Lazy = lazy(loader);
  return function BridgedPage() {
    return (
      <FleetModuleHost>
        <Suspense fallback={<BridgeFallback />}>
          <Lazy />
        </Suspense>
      </FleetModuleHost>
    );
  };
}

export const BridgedDriversPage = bridge(() =>
  import('@fleet/components/drivers/DriversPage').then((m) => ({ default: m.DriversPage })),
);

export const BridgedVehiclesPage = bridge(() =>
  import('@fleet/components/vehicles/VehiclesPage').then((m) => ({ default: m.VehiclesPage })),
);

export const BridgedMaintenancePage = bridge(() =>
  import('@fleet/components/vehicles/FleetMaintenanceHub').then((m) => ({
    default: m.FleetMaintenanceHub,
  })),
);

export const BridgedEquipmentPage = bridge(() =>
  import('@fleet/components/fleet/FleetPage').then((m) => ({ default: m.FleetPage })),
);

export const BridgedFuelPage = bridge(() =>
  import('@fleet/pages/FuelManagement').then((m) => ({ default: m.FuelManagement })),
);

export const BridgedTollLogsPage = bridge(() =>
  import('@fleet/pages/TollLogs').then((m) => ({ default: m.TollLogsPage })),
);

export const BridgedTollReconciliationPage = bridge(() =>
  import('@fleet/pages/TollReconciliation').then((m) => {
    const Comp = (m as { default?: React.ComponentType }).default
      || (() => <div>Toll reconciliation</div>);
    return { default: Comp };
  }),
);

export const BridgedTagInventoryPage = bridge(() =>
  import('@fleet/pages/TagInventory').then((m) => {
    const Comp = (m as { default?: React.ComponentType }).default
      || (() => <div>Tag inventory</div>);
    return { default: Comp };
  }),
);

export const BridgedTripsPage = bridge(() =>
  import('@fleet/components/trips/TripLogsPage').then((m) => ({ default: m.TripLogsPage })),
);

export const BridgedDataCenterPage = bridge(() =>
  import('@fleet/components/imports/ImportsPage').then((m) => ({ default: m.ImportsPage })),
);

export const BridgedReportsPage = bridge(() =>
  import('@fleet/components/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })),
);

export const BridgedBusinessFinancePage = bridge(() =>
  import('@fleet/components/business-finance/BusinessFinancePage').then((m) => ({
    default: m.BusinessFinancePage,
  })),
);

export const BridgedUserManagementPage = bridge(() =>
  import('@fleet/components/users/UserManagementPage').then((m) => ({
    default: m.UserManagementPage,
  })),
);

export const BridgedSettingsPage = bridge(() =>
  import('@fleet/components/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);

export { ClaimsBridgePage as BridgedClaimsPage } from '@/fleet-bridge/ClaimsBridgePage';
