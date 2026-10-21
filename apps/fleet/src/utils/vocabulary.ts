import { BusinessType } from '../types/data';
import { useBusinessConfig } from '../components/auth/BusinessConfigContext';
import { useServiceLineScope } from '../contexts/ServiceLineScopeContext';

/**
 * Vocabulary Mapping System
 *
 * Provides industry-specific terminology across the app.
 * Components call `useVocab()` to get a bound `v(key)` function
 * that returns the correct term for the active business type.
 *
 * Fallback chain: requested type -> rideshare default -> raw key
 * This guarantees the app never displays `undefined`.
 */

// ---------------------------------------------------------------------------
// Vocab Key Union — every term that varies by industry
// ---------------------------------------------------------------------------

export type VocabKey =
  | 'trip' | 'trips'
  | 'rider' | 'riders'
  | 'fare' | 'fares'
  | 'platform' | 'platforms'
  | 'pickup' | 'dropoff'
  | 'driver' | 'drivers'
  | 'dispatch' | 'route'
  | 'cancel' | 'cancelled'
  | 'earnings' | 'payout'
  | 'rating'
  | 'surge'
  | 'onTrip' | 'enroute'
  | 'sidebarTrips' | 'sidebarPerformance'
  | 'dashboardTitle' | 'dashboardSubtitle'
  | 'driversPageTitle' | 'driversPageSubtitle'
  | 'vehiclesPageTitle' | 'vehiclesPageSubtitle'
  | 'tripsPageTitle' | 'tripsPageSubtitle';

// ---------------------------------------------------------------------------
// Vocabulary Mappings — one record per business type
// ---------------------------------------------------------------------------

const VOCABULARY: Record<BusinessType, Record<VocabKey, string>> = {
  rideshare: {
    trip: 'Trip',
    trips: 'Trips',
    rider: 'Rider',
    riders: 'Riders',
    fare: 'Fare',
    fares: 'Fares',
    platform: 'Platform',
    platforms: 'Platforms',
    pickup: 'Pickup',
    dropoff: 'Dropoff',
    driver: 'Driver',
    drivers: 'Drivers',
    dispatch: 'Request',
    route: 'Route',
    cancel: 'Cancel',
    cancelled: 'Cancelled',
    earnings: 'Earnings',
    payout: 'Payout',
    rating: 'Rating',
    surge: 'Surge',
    onTrip: 'On Trip',
    enroute: 'En Route',
    sidebarTrips: 'Trip Logs',
    sidebarPerformance: 'Performance',
    dashboardTitle: 'Dashboard',
    dashboardSubtitle: "Overview of your fleet's performance and financial health.",
    driversPageTitle: 'Drivers',
    driversPageSubtitle: 'Manage fleet drivers, track performance, and monitor earnings.',
    vehiclesPageTitle: 'Fleet Vehicles',
    vehiclesPageSubtitle: 'Manage and monitor your vehicle assets',
    tripsPageTitle: 'Trip Logs',
    tripsPageSubtitle: 'Uber and InDrive imports, plus Roam manual and live trips. Not live tracking.',
  },

  delivery: {
    trip: 'Delivery',
    trips: 'Deliveries',
    rider: 'Customer',
    riders: 'Customers',
    fare: 'Delivery Fee',
    fares: 'Delivery Fees',
    platform: 'Carrier',
    platforms: 'Carriers',
    pickup: 'Collection',
    dropoff: 'Drop-off',
    driver: 'Driver',
    drivers: 'Drivers',
    dispatch: 'Dispatch',
    route: 'Route',
    cancel: 'Cancel',
    cancelled: 'Failed',
    earnings: 'Revenue',
    payout: 'Payout',
    rating: 'Service Rating',
    surge: 'Peak Pricing',
    onTrip: 'In Transit',
    enroute: 'En Route to Pickup',
    sidebarTrips: 'Delivery Logs',
    sidebarPerformance: 'Performance',
    dashboardTitle: 'Dashboard',
    dashboardSubtitle: "Overview of your delivery fleet's performance and financial health.",
    driversPageTitle: 'Drivers',
    driversPageSubtitle: 'Manage delivery drivers, track performance, and monitor revenue.',
    vehiclesPageTitle: 'Fleet Vehicles',
    vehiclesPageSubtitle: 'Manage and monitor your delivery vehicle assets',
    tripsPageTitle: 'Delivery Logs',
    tripsPageSubtitle: 'Imported delivery jobs and manual entries. Not live tracking.',
  },

  taxi: {
    trip: 'Fare',
    trips: 'Fares',
    rider: 'Passenger',
    riders: 'Passengers',
    fare: 'Meter Fare',
    fares: 'Meter Fares',
    platform: 'Dispatch',
    platforms: 'Dispatch Services',
    pickup: 'Pickup',
    dropoff: 'Destination',
    driver: 'Driver',
    drivers: 'Drivers',
    dispatch: 'Dispatch',
    route: 'Route',
    cancel: 'Cancel',
    cancelled: 'No-show',
    earnings: 'Earnings',
    payout: 'Payout',
    rating: 'Rating',
    surge: 'Peak Rate',
    onTrip: 'Metered',
    enroute: 'Dispatched',
    sidebarTrips: 'Fare Logs',
    sidebarPerformance: 'Performance',
    dashboardTitle: 'Dashboard',
    dashboardSubtitle: "Overview of your taxi fleet's performance and financial health.",
    driversPageTitle: 'Drivers',
    driversPageSubtitle: 'Manage taxi drivers, track performance, and monitor earnings.',
    vehiclesPageTitle: 'Fleet Vehicles',
    vehiclesPageSubtitle: 'Manage and monitor your taxi fleet assets',
    tripsPageTitle: 'Fare Logs',
    tripsPageSubtitle: 'Imported fares and manual entries. Not live tracking.',
  },

  trucking: {
    trip: 'Haul',
    trips: 'Hauls',
    rider: 'Shipper',
    riders: 'Shippers',
    fare: 'Freight Rate',
    fares: 'Freight Rates',
    platform: 'Carrier',
    platforms: 'Carriers',
    pickup: 'Origin',
    dropoff: 'Destination',
    driver: 'Operator',
    drivers: 'Operators',
    dispatch: 'Dispatch',
    route: 'Lane',
    cancel: 'Cancel',
    cancelled: 'Rejected',
    earnings: 'Revenue',
    payout: 'Settlement',
    rating: 'Score',
    surge: 'Spot Rate',
    onTrip: 'In Transit',
    enroute: 'En Route to Origin',
    sidebarTrips: 'Haul Logs',
    sidebarPerformance: 'Compliance',
    dashboardTitle: 'Dashboard',
    dashboardSubtitle: "Overview of your trucking fleet's performance and financial health.",
    driversPageTitle: 'Operators',
    driversPageSubtitle: 'Manage truck operators, track compliance, and monitor revenue.',
    vehiclesPageTitle: 'Fleet Vehicles',
    vehiclesPageSubtitle: 'Manage and monitor your trucking fleet assets',
    tripsPageTitle: 'Haul Logs',
    tripsPageSubtitle: 'Imported hauls and manual entries. Not live tracking.',
  },

  shipping: {
    trip: 'Shipment',
    trips: 'Shipments',
    rider: 'Consignee',
    riders: 'Consignees',
    fare: 'Freight Charge',
    fares: 'Freight Charges',
    platform: 'Carrier',
    platforms: 'Carriers',
    pickup: 'Port of Loading',
    dropoff: 'Port of Discharge',
    driver: 'Captain',
    drivers: 'Captains',
    dispatch: 'Booking',
    route: 'Trade Lane',
    cancel: 'Cancel',
    cancelled: 'Voided',
    earnings: 'Revenue',
    payout: 'Settlement',
    rating: 'Score',
    surge: 'Peak Season Rate',
    onTrip: 'In Transit',
    enroute: 'En Route to Port',
    sidebarTrips: 'Shipment Logs',
    sidebarPerformance: 'Compliance',
    dashboardTitle: 'Dashboard',
    dashboardSubtitle: "Overview of your shipping fleet's performance and financial health.",
    driversPageTitle: 'Captains',
    driversPageSubtitle: 'Manage captains, track compliance, and monitor revenue.',
    vehiclesPageTitle: 'Fleet Vessels',
    vehiclesPageSubtitle: 'Manage and monitor your shipping fleet assets',
    tripsPageTitle: 'Shipment Logs',
    tripsPageSubtitle: 'Imported shipments and manual entries. Not live tracking.',
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get the industry-specific term for a given vocab key.
 * Fallback chain: requested type -> rideshare default -> raw key.
 */
export function getVocab(businessType: BusinessType, key: VocabKey): string {
  return VOCABULARY[businessType]?.[key] ?? VOCABULARY.rideshare[key] ?? key;
}

/**
 * Fuel Management service-line UI labels — re-export (audit §6.4).
 * Prefer importing from here or fuelServiceLineLabels.ts; never hardcode enums in UI.
 */
export { fuelServiceLineUiLabel } from './fuelServiceLineLabels';

/**
 * React hook — vocabulary for the active business type.
 * Dual-line orgs use rideshare labels on shared pages (scope is capability-derived 'all').
 * Delivery-only orgs use delivery vocabulary via businessType.
 */
export function useVocab() {
  const { businessType, serviceLines } = useBusinessConfig();
  const { scope } = useServiceLineScope();

  const effectiveType: BusinessType = (() => {
    if (serviceLines.includes('rideshare') && serviceLines.includes('rush_delivery')) {
      // Shared surfaces stay rideshare-labeled; delivery-specific pages have their own copy.
      if (scope === 'rush_delivery') return 'delivery';
      return 'rideshare';
    }
    return businessType;
  })();

  return {
    v: (key: VocabKey) => getVocab(effectiveType, key),
    businessType: effectiveType,
  };
}