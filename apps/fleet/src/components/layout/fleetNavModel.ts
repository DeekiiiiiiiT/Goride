import type { BusinessType } from '../../types/data';
import { isSidebarItemVisible } from '../../utils/businessTypes';
import {
  canSeeCourierOps as computeCanSeeCourierOps,
  canSeeEarningsPolicy as computeCanSeeEarningsPolicy,
  hasSharedOps as computeHasSharedOps,
  rushModuleNavEnabled,
} from './sidebarGating';
import type { NavLeaf } from './nav/types';

export const FUEL_PAGE_IDS = [
  'fuel-management',
  'fuel-overview',
  'fuel-reconciliation',
  'fuel-cards',
  'fuel-logs',
  'fuel-configuration',
  'fuel-reimbursements',
] as const;

export const TOLL_PAGE_IDS = [
  'toll-logs',
  'toll-tags',
  'tag-inventory',
  'toll-rate-drift',
  'toll-low-balance',
] as const;

export function fleetOpsActive(page: string) {
  return ([...FUEL_PAGE_IDS, ...TOLL_PAGE_IDS] as string[]).includes(page);
}

export function isNavLeafActive(
  item: Pick<NavLeaf, 'id' | 'activeIds'>,
  currentPage: string,
) {
  if (item.id === currentPage) return true;
  return item.activeIds?.includes(currentPage) ?? false;
}

export type FleetNavLabels = {
  dashboardTitle: string;
  drivers: string;
  vehiclesPageTitle: string;
  sidebarTrips: string;
};

export type BuildFleetNavModelInput = {
  canView: (page: string) => boolean;
  isModuleEnabled: (key: string) => boolean;
  businessType: BusinessType;
  serviceLines: string[];
  rushVisible: boolean;
  rideshareVisible: boolean;
  labels: FleetNavLabels;
};

export type FleetNavDesk = {
  id: string;
  label: string;
  items: NavLeaf[];
};

export type FleetNavModel = {
  dashboard: NavLeaf | null;
  fleetOps: {
    visible: boolean;
    fuel: FleetNavDesk | null;
    toll: FleetNavDesk | null;
  };
  driverOps: { visible: boolean; items: NavLeaf[] };
  money: { visible: boolean; items: NavLeaf[] };
  vehicleOps: { visible: boolean; items: NavLeaf[] };
  courierOps: { visible: boolean; items: NavLeaf[] };
  analytics: { visible: boolean; items: NavLeaf[] };
  reports: NavLeaf | null;
  businessFinance: { visible: boolean; items: NavLeaf[] };
  system: { visible: boolean; items: NavLeaf[] };
};

function leaf(
  condition: boolean,
  item: NavLeaf | false | null | undefined,
): NavLeaf | null {
  return condition && item ? item : null;
}

function compactLeaves(items: Array<NavLeaf | false | null | undefined>): NavLeaf[] {
  return items.filter(Boolean) as NavLeaf[];
}

/** Pure builder — shared by sidebar + desktop top nav. */
export function buildFleetNavModel(input: BuildFleetNavModelInput): FleetNavModel {
  const {
    canView,
    isModuleEnabled,
    businessType,
    serviceLines,
    rushVisible,
    rideshareVisible,
    labels,
  } = input;

  const hasRushDeliveryLine = serviceLines.includes('rush_delivery');
  const hasSharedOps = computeHasSharedOps({ rushVisible, rideshareVisible });

  const canSeeFuelDesk =
    isModuleEnabled('fuelManagement') &&
    (canView('fuel-reimbursements') ||
      canView('fuel-reconciliation') ||
      canView('fuel-cards') ||
      canView('fuel-logs') ||
      canView('fuel-configuration'));
  const canSeeTollDesk =
    isModuleEnabled('tollManagement') &&
    isSidebarItemVisible('toll-management', businessType) &&
    (canView('toll-logs') ||
      canView('toll-tags') ||
      canView('tag-inventory') ||
      canView('toll-rate-drift') ||
      canView('toll-low-balance'));
  const canSeeBusinessFinanceHome =
    isModuleEnabled('businessFinance') && canView('business-finance');
  const canSeeBusinessFinanceNav =
    canSeeBusinessFinanceHome ||
    canView('fleet-financials') ||
    canView('driver-settlements') ||
    canView('driver-payouts') ||
    canView('indrive-wallet') ||
    canView('transaction-list') ||
    canView('fuel-reconciliation') ||
    canView('toll-tags');
  const canSeeWeekReconciliation =
    canView('fuel-reconciliation') || canView('toll-tags');
  const canSeeFleetOps = hasSharedOps && (canSeeFuelDesk || canSeeTollDesk);
  const canSeeDriverOps = rideshareVisible && canView('drivers');
  const canSeeEarningsPolicyNav = computeCanSeeEarningsPolicy({
    hasSharedOps,
    sidebarVisible: isSidebarItemVisible('earnings-policy', businessType),
    canView: canView('earnings-policy'),
  });
  const canSeeVehicleOps =
    hasSharedOps &&
    (canView('vehicles') || canView('maintenance-hub') || canView('fleet'));
  const canSeeCourierOps = computeCanSeeCourierOps({
    hasRushDeliveryLine,
    rushModuleEnabled: rushModuleNavEnabled(isModuleEnabled),
    canViewAnyCourierPage:
      canView('couriers') ||
      canView('deliveries') ||
      canView('courier-settlements') ||
      canView('supply-health'),
  });
  const canSeeAnalytics =
    (hasSharedOps &&
      (canView('fuel-analytics') ||
        canView('fuel-overview') ||
        canView('toll-analytics') ||
        canView('vehicle-analytics'))) ||
    (rideshareVisible &&
      (canView('driver-analytics') || canView('drivers') || canView('trips'))) ||
    (hasRushDeliveryLine &&
      rushModuleNavEnabled(isModuleEnabled) &&
      (canView('courier-analytics') || canView('delivery-analytics')));
  const canSeeSystem =
    canView('user-management') || canView('settings') || canView('imports');

  const fuelItems = compactLeaves([
    leaf(canView('fuel-reimbursements'), {
      id: 'fuel-reimbursements',
      label: 'Review Queue',
    }),
    leaf(canView('fuel-cards'), { id: 'fuel-cards', label: 'Fuel Cards' }),
    leaf(canView('fuel-logs'), { id: 'fuel-logs', label: 'Transaction Logs' }),
    leaf(canView('fuel-configuration'), {
      id: 'fuel-configuration',
      label: 'Configuration',
    }),
  ]);

  const tollItems = compactLeaves([
    leaf(canView('toll-logs'), { id: 'toll-logs', label: 'Toll Logs' }),
    leaf(canView('tag-inventory'), { id: 'tag-inventory', label: 'Tag Inventory' }),
    leaf(canView('toll-low-balance'), {
      id: 'toll-low-balance',
      label: 'Low Balance Queue',
    }),
    leaf(canView('toll-rate-drift'), { id: 'toll-rate-drift', label: 'Rate Drift' }),
  ]);

  const driverItems = compactLeaves([
    leaf(canView('drivers'), { id: 'drivers', label: labels.drivers }),
  ]);

  const vehicleItems = compactLeaves([
    leaf(canView('vehicles'), {
      id: 'vehicles',
      label: labels.vehiclesPageTitle,
    }),
    leaf(canView('maintenance-hub'), {
      id: 'maintenance-hub',
      label: 'Maintenance',
    }),
    leaf(canView('fleet'), {
      id: 'fleet',
      label: 'Inventory & Asset Management',
    }),
  ]);

  const financeItems = compactLeaves([
    leaf(canSeeBusinessFinanceHome, {
      id: 'business-finance',
      label: 'Overview',
    }),
    leaf(canSeeBusinessFinanceHome, { id: 'expense-hub', label: 'Expense Hub' }),
    leaf(canView('fleet-financials'), {
      id: 'fleet-financials',
      label: 'Bank Deposits',
    }),
    leaf(canSeeWeekReconciliation, {
      id: 'week-reconciliation',
      label: 'Week Reconciliation',
    }),
    leaf(canView('driver-settlements') && rideshareVisible, {
      id: 'driver-settlements',
      label: 'Driver Settlements',
    }),
    leaf(
      !(canView('driver-settlements') && rideshareVisible) &&
        (canView('driver-settlements') || canView('fuel-reconciliation')),
      { id: 'close-week', label: 'Close Week' },
    ),
    leaf(
      !(canView('driver-settlements') && rideshareVisible) &&
        (canView('driver-settlements') || canView('fuel-reconciliation')),
      { id: 'restatement-queue', label: 'Restatement Queue' },
    ),
    leaf(
      canView('courier-settlements') &&
        hasRushDeliveryLine &&
        isModuleEnabled('rush_courier_settlements'),
      { id: 'courier-settlements', label: 'Courier Settlements' },
    ),
    leaf(canView('indrive-wallet'), {
      id: 'indrive-wallet',
      label: 'InDrive Wallet',
    }),
    leaf(canView('transaction-list'), {
      id: 'transaction-list',
      label: 'Ledgers',
    }),
  ]);

  const courierItems = compactLeaves([
    leaf(isModuleEnabled('rush_couriers') && canView('couriers'), {
      id: 'couriers',
      label: 'Couriers',
    }),
    leaf(isModuleEnabled('rush_deliveries') && canView('deliveries'), {
      id: 'deliveries',
      label: 'Deliveries',
    }),
    leaf(isModuleEnabled('rush_supply_health') && canView('supply-health'), {
      id: 'supply-health',
      label: 'Supply Health',
    }),
  ]);

  const analyticsItems = compactLeaves([
    leaf(
      hasSharedOps &&
        isModuleEnabled('fuelManagement') &&
        (canView('fuel-analytics') || canView('fuel-overview')),
      {
        id: 'fuel-analytics',
        label: 'Fuel Analytics',
        activeIds: ['fuel-management', 'fuel-overview'],
        showNewBadge: true,
      },
    ),
    leaf(
      hasSharedOps &&
        isModuleEnabled('tollManagement') &&
        isSidebarItemVisible('toll-management', businessType) &&
        canView('toll-analytics'),
      {
        id: 'toll-analytics',
        label: 'Toll Analytics',
        showNewBadge: true,
      },
    ),
    leaf(rideshareVisible && (canView('driver-analytics') || canView('drivers')), {
      id: 'driver-analytics',
      label: 'Driver Analytics',
      showNewBadge: true,
    }),
    leaf(hasSharedOps && canView('vehicle-analytics'), {
      id: 'vehicle-analytics',
      label: 'Vehicle Analytics',
    }),
    leaf(
      hasRushDeliveryLine &&
        isModuleEnabled('rush_couriers') &&
        canView('courier-analytics'),
      {
        id: 'courier-analytics',
        label: 'Courier Analytics',
        showNewBadge: true,
      },
    ),
    leaf(
      hasRushDeliveryLine &&
        isModuleEnabled('rush_deliveries') &&
        canView('delivery-analytics'),
      {
        id: 'delivery-analytics',
        label: 'Delivery Analytics',
      },
    ),
    leaf(rideshareVisible && canView('trips'), {
      id: 'trips',
      label: labels.sidebarTrips,
    }),
  ]);

  const systemItems = compactLeaves([
    leaf(canView('user-management'), {
      id: 'user-management',
      label: 'User Management',
    }),
    leaf(canView('settings'), { id: 'settings', label: 'Settings' }),
    leaf(canView('imports'), { id: 'imports', label: 'Data Center' }),
  ]);

  const moneyItems = compactLeaves([
    leaf(canSeeEarningsPolicyNav, { id: 'earnings', label: 'Earnings' }),
    leaf(canSeeEarningsPolicyNav, {
      id: 'earnings-policy',
      label: 'Earnings Policy',
    }),
    leaf(canSeeEarningsPolicyNav, { id: 'wallet', label: 'Wallet' }),
  ]);

  return {
    dashboard: leaf(canView('dashboard'), {
      id: 'dashboard',
      label: labels.dashboardTitle,
    }),
    fleetOps: {
      visible: canSeeFleetOps,
      fuel:
        canSeeFuelDesk && fuelItems.length > 0
          ? { id: 'fuel', label: 'Fuel Management', items: fuelItems }
          : null,
      toll:
        canSeeTollDesk && tollItems.length > 0
          ? { id: 'toll', label: 'Toll Management', items: tollItems }
          : null,
    },
    driverOps: {
      visible: canSeeDriverOps && driverItems.length > 0,
      items: driverItems,
    },
    money: {
      visible: canSeeEarningsPolicyNav && moneyItems.length > 0,
      items: moneyItems,
    },
    vehicleOps: {
      visible: canSeeVehicleOps && vehicleItems.length > 0,
      items: vehicleItems,
    },
    courierOps: {
      visible: canSeeCourierOps && courierItems.length > 0,
      items: courierItems,
    },
    analytics: {
      visible: canSeeAnalytics && analyticsItems.length > 0,
      items: analyticsItems,
    },
    reports: leaf(canView('reports'), { id: 'reports', label: 'Reports' }),
    businessFinance: {
      visible: canSeeBusinessFinanceNav && financeItems.length > 0,
      items: financeItems,
    },
    system: {
      visible: canSeeSystem && systemItems.length > 0,
      items: systemItems,
    },
  };
}

export function navDeskHasActivePage(
  desk: FleetNavDesk | null | undefined,
  currentPage: string,
) {
  return Boolean(desk?.items.some((item) => isNavLeafActive(item, currentPage)));
}

export function navItemsHaveActivePage(items: NavLeaf[], currentPage: string) {
  return items.some((item) => isNavLeafActive(item, currentPage));
}
