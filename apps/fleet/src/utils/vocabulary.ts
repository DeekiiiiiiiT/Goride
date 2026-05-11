import { BusinessType } from '../types/data';
import { useBusinessConfig } from '../components/auth/BusinessConfigContext';

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
    sidebarTrips: 'Trip Analytics',
    sidebarPerformance: 'Performance',
    dashboardTitle: 'Fleet Analytics Dashboard',
    dashboardSubtitle: "Overview of your fleet's performance and financial health.",
    driversPageTitle: 'Drivers',
    driversPageSubtitle: 'Manage fleet drivers, track performance, and monitor earnings.',
    vehiclesPageTitle: 'Fleet Vehicles',
    vehiclesPageSubtitle: 'Manage and monitor your vehicle assets',
    tripsPageTitle: 'Trip Analytics',
    tripsPageSubtitle: 'Real-time trip analytics, cancellation insights, and fleet performance.',
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
    sidebarTrips: 'Delivery Analytics',
    sidebarPerformance: 'Performance',
    dashboardTitle: 'Fleet Analytics Dashboard',
    dashboardSubtitle: "Overview of your delivery fleet's performance and financial health.",
    driversPageTitle: 'Drivers',
    driversPageSubtitle: 'Manage delivery drivers, track performance, and monitor revenue.',
    vehiclesPageTitle: 'Fleet Vehicles',
    vehiclesPageSubtitle: 'Manage and monitor your delivery vehicle assets',
    tripsPageTitle: 'Delivery Analytics',
    tripsPageSubtitle: 'Real-time delivery analytics, failure insights, and fleet performance.',
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
    sidebarTrips: 'Fare Analytics',
    sidebarPerformance: 'Performance',
    dashboardTitle: 'Fleet Analytics Dashboard',
    dashboardSubtitle: "Overview of your taxi fleet's performance and financial health.",
    driversPageTitle: 'Drivers',
    driversPageSubtitle: 'Manage taxi drivers, track performance, and monitor earnings.',
    vehiclesPageTitle: 'Fleet Vehicles',
    vehiclesPageSubtitle: 'Manage and monitor your taxi fleet assets',
    tripsPageTitle: 'Fare Analytics',
    tripsPageSubtitle: 'Real-time fare analytics, no-show insights, and fleet performance.',
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
    sidebarTrips: 'Haul Analytics',
    sidebarPerformance: 'Compliance',
    dashboardTitle: 'Fleet Analytics Dashboard',
    dashboardSubtitle: "Overview of your trucking fleet's performance and financial health.",
    driversPageTitle: 'Operators',
    driversPageSubtitle: 'Manage truck operators, track compliance, and monitor revenue.',
    vehiclesPageTitle: 'Fleet Vehicles',
    vehiclesPageSubtitle: 'Manage and monitor your trucking fleet assets',
    tripsPageTitle: 'Haul Analytics',
    tripsPageSubtitle: 'Real-time haul analytics, rejection insights, and fleet performance.',
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
    sidebarTrips: 'Shipment Analytics',
    sidebarPerformance: 'Compliance',
    dashboardTitle: 'Fleet Analytics Dashboard',
    dashboardSubtitle: "Overview of your shipping fleet's performance and financial health.",
    driversPageTitle: 'Captains',
    driversPageSubtitle: 'Manage captains, track compliance, and monitor revenue.',
    vehiclesPageTitle: 'Fleet Vessels',
    vehiclesPageSubtitle: 'Manage and monitor your shipping fleet assets',
    tripsPageTitle: 'Shipment Analytics',
    tripsPageSubtitle: 'Real-time shipment analytics, void insights, and fleet performance.',
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
 * React hook — reads the active business type from context and returns
 * a bound `v()` function for convenient use in components.
 *
 * Usage:
 *   const { v } = useVocab();
 *   <h1>{v('tripsPageTitle')}</h1>   // "Trip Logs" | "Delivery Logs" | etc.
 */
export function useVocab() {
  const { businessType } = useBusinessConfig();
  return {
    v: (key: VocabKey) => getVocab(businessType, key),
    businessType,
  };
}