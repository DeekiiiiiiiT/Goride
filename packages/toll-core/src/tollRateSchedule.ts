/**
 * Super Admin Toll Info — rate card types (date-versioned).
 * Source of truth for official plaza rates used by reconciliation + rides.
 */

export type TollPaymentMethodRate = 'withTag' | 'withoutTag';

export interface TollRate {
  withTag: number;
  withoutTag: number;
}

export interface TollVehicleClassDef {
  id: string;
  label: string;
  iconName: string;
  description: string;
  examples: string;
  height: string;
  length: string;
  fleetRelevance: string;
  fleetRelevanceColor: string;
}

export interface PlazaRates {
  plazaId?: string;
  plazaName: string;
  rates: Record<string, TollRate>;
}

export interface RouteSegment {
  fromPlazaId?: string;
  fromPlazaName: string;
  toPlazaId?: string;
  toPlazaName: string;
  distanceKm: number;
  rates: Record<string, number>;
}

export interface RouteRateGroup {
  id: string;
  operator: string;
  highway: string;
  effectiveDate: string;
  segments: RouteSegment[];
}

/** One immutable rate card snapshot. */
export interface TollRateScheduleVersion {
  id: string;
  /** ISO date YYYY-MM-DD — rates apply from this day forward until the next version. */
  effectiveFrom: string;
  /** Display string DD/MM/YYYY (legacy UI). */
  effectiveDate: string;
  operator: string;
  currency: string;
  plazas: PlazaRates[];
  vehicleClasses: TollVehicleClassDef[];
  routeRateGroups: RouteRateGroup[];
  createdAt: string;
  createdBy?: string;
}

/** KV document shape for versioned Toll Info. */
export interface TollRateScheduleStore {
  /** Latest / current working schedule (same shape as a version body + id/effectiveFrom). */
  current: TollRateScheduleVersion;
  /** Oldest → newest; includes current. */
  versions: TollRateScheduleVersion[];
}

/** Legacy single-document schedule (pre-versioning). */
export interface TollRateScheduleLegacy {
  effectiveDate?: string;
  operator?: string;
  currency?: string;
  plazas?: PlazaRates[];
  vehicleClasses?: TollVehicleClassDef[];
  routeRateGroups?: RouteRateGroup[];
  /** Already versioned? */
  current?: TollRateScheduleVersion;
  versions?: TollRateScheduleVersion[];
}

export interface OfficialTollRateResult {
  amount: number;
  scheduleVersionId: string;
  plazaId: string | null;
  plazaName: string | null;
  classId: string;
  paymentMethod: TollPaymentMethodRate;
  source: 'flat' | 'route' | 'fallback';
  effectiveFrom: string;
}

export const TOLL_RATE_TOLERANCE = 0.05;
export const KV_TOLL_RATE_SCHEDULE = 'toll:rate_schedule';
