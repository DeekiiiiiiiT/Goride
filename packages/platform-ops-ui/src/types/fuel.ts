/** Ledger-facing FuelEntry shape (package-local; full fleet fuel types stay in apps/fleet). */

export type FuelType = 'Gasoline_87' | 'Gasoline_91' | 'Gasoline_93' | 'Diesel' | 'Electric' | 'Hybrid';

export interface FuelEntry {
  id: string;
  date: string;
  time?: string;
  cardId?: string;
  vehicleId?: string;
  driverId?: string;
  organizationId?: string;

  amount: number;
  liters?: number;
  pricePerLiter?: number;
  fuelType?: FuelType | string;

  odometer?: number | null;
  odometerImageUrl?: string;
  location?: string;
  stationAddress?: string;
  vendor?: string;
  notes?: string;

  type: 'Card_Transaction' | 'Manual_Entry' | 'Fuel_Manual_Entry' | 'Reimbursement';
  entryMode: 'Anchor' | 'Floating';
  paymentSource: 'RideShare_Cash' | 'Gas_Card' | 'Personal' | 'Petty_Cash';

  /** N-18: fill usage for Phase 4 server category authority. */
  usageCategory?: string;

  entrySource?: 'driver-portal' | 'admin-manual' | 'admin-edit' | 'bulk-import' | 'fuel-card';

  isFlagged?: boolean;
  isVerified?: boolean;

  status?: 'Draft' | 'Posted' | 'Finalized' | string;
  isLocked?: boolean;
  lockedAt?: string;
  signature?: string;
  signedAt?: string;
  correctionReason?: string;

  transactionId?: string;

  /** Server-resolved service line. Null = unattributed. Do not derive client-side. */
  serviceLine?: 'rideshare' | 'rush_delivery' | null;
  serviceLineSource?:
    | 'program'
    | 'explicit'
    | 'trip'
    | 'vehicle'
    | 'driver'
    | 'unattributed'
    | null;
  serviceLineSetAt?: string | null;
  serviceLineSetBy?: string | null;

  isFullTank?: boolean;
  locationMetadata?: {
    lat?: number;
    lng?: number;
    accuracy?: number;
    timestamp?: string;
    [key: string]: any;
  };
  geofenceMetadata?: {
    isInside?: boolean;
    distanceMeters?: number;
    timestamp?: string;
    radiusAtTrigger?: number;
    [key: string]: any;
  };
  locationStatus?: string;
  matchedStationId?: string;
  deviationReason?: string;

  volumeContributed?: number;
  isCarryover?: boolean;
  carryoverVolume?: number;

  anchorPeriodId?: string;
  reconciliationStatus?: 'Pending' | 'Verified' | 'Flagged' | 'Observing' | 'Archived';
  auditStatus?: 'Clear' | 'Observing' | 'Flagged' | 'Auto-Resolved';

  metadata?: {
    isEdited?: boolean;
    lastEditedAt?: string;
    editReason?: string;
    isDebit?: boolean;
    isCredit?: boolean;
    observationReason?: string;
    observationStartedAt?: string;
    expectedAnchorDate?: string;
    predictedEconomy?: number;
    varianceFromBaseline?: number;
    matchedStationId?: string;
    bridgedStationId?: string;
    bridgeSource?: string;
    [key: string]: any;
  };

  /** Envelope total when API returns shape=envelope (attached on array). */
  totalCount?: number;

  vehiclePlate?: string;
  driverName?: string;
  cardNumber?: string;
}
