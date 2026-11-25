/**
 * Fuel log, photos first (docs/fuel-log-offline-first-audit.md, FO-01/FO-05/FO-12/FO-13).
 *
 * A fill is a draft from the first photo until Save. Save turns it into one waiting-list item
 * (the only path to the server, online or not). Numbers are optional: the server reads the
 * photos (S5/S6). Pure — no storage, no network.
 */
import type { OfflineAction } from '../../../types/offline';

export type FuelPhotoPayment = 'rideshare_cash' | 'gas_card' | 'gas_card_and_cash';
export type FuelPhotoStep = 'odometer' | 'pay' | 'pump' | 'gascard';

export interface FuelPhotoLocation {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: string;
  fixAt: string;
  ageS?: number;
  mock?: boolean;
}

export interface FuelPhotoDraft {
  captureId: string;
  /** Time of the first photo (ISO). The fill's date and time come from this. */
  capturedAt: string;
  step: FuelPhotoStep;
  hasOdometerPhoto: boolean;
  hasPumpPhoto: boolean;
  odometerKm?: number;
  /** 'photo' = read from the photo; 'typed' = the driver typed it. */
  odometerSource?: 'photo' | 'typed';
  payment?: FuelPhotoPayment;
  total?: number;
  liters?: number;
  totalSource?: 'photo' | 'typed';
  location?: FuelPhotoLocation;
  /** Why there is no location (shown to Fleet, never blocks). */
  locationMissingReason?: string;
  /** The station the driver tapped in "Where did you fuel?", or the one GPS was inside. */
  stationClaim?: { stationId: string | null; stationName?: string; fromGps?: boolean };
  /** Gas Card + Cash: id of the card half, made once so re-sends reuse it. */
  splitCardEntryId?: string;
  savedAt: number;
}

export interface StationOption {
  id: string;
  name: string;
  distanceM: number;
}

/**
 * Screen 12: after Save, ask "Where did you fuel?" only when the phone has a GPS fix and it is
 * not inside a station. Inside a station = that station, no question. No fix = no question.
 * Returns the nearest verified stations within 5 km (up to 3).
 */
export function stationQuestion(
  location: FuelPhotoLocation | undefined,
  stations: Array<{ id: string; name: string; status?: string; location?: { lat?: number; lng?: number; radius?: number }; geofenceRadius?: number }>,
  distance: (aLat: number, aLng: number, bLat: number, bLng: number) => number,
): { inside: StationOption | null; options: StationOption[] } {
  if (!location) return { inside: null, options: [] };
  const all: StationOption[] = [];
  let inside: StationOption | null = null;
  for (const s of stations) {
    if (s.status && s.status !== 'verified') continue;
    const lat = Number(s.location?.lat);
    const lng = Number(s.location?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const d = Math.round(distance(location.lat, location.lng, lat, lng));
    const radius = Number(s.geofenceRadius ?? s.location?.radius) || 75;
    const opt = { id: s.id, name: s.name, distanceM: d };
    if (d <= radius && (!inside || d < inside.distanceM)) inside = opt;
    if (d <= 5000) all.push(opt);
  }
  if (inside) return { inside, options: [] };
  return { inside: null, options: all.sort((a, b) => a.distanceM - b.distanceM).slice(0, 3) };
}

/** "0.1 km away". */
export function distanceLabel(m: number): string {
  return `${(m / 1000).toFixed(1)} km away`;
}

/** Status chip on a fill in the fuel list (Stitch screen 8). */
export type FuelFillChip = 'on_phone' | 'sent' | 'read' | 'needs_look';

/**
 * Server photo-read state → chip. Fills without the new flow's state show no chip (the list keeps
 * its existing status), so old fills look as they did.
 */
export function fillChipForServerFill(photoReadStatus: unknown): FuelFillChip | null {
  const s = String(photoReadStatus ?? '');
  if (s === 'needs_look') return 'needs_look';
  if (s === 'read') return 'read';
  if (s === 'waiting') return 'sent';
  return null;
}

export function odometerBlobKey(captureId: string): string {
  return `fuel-photo-odo-${captureId}`;
}

export function pumpBlobKey(captureId: string): string {
  return `fuel-photo-pump-${captureId}`;
}

export function newFuelPhotoDraft(captureId: string, nowMs: number): FuelPhotoDraft {
  return {
    captureId,
    capturedAt: new Date(nowMs).toISOString(),
    step: 'odometer',
    hasOdometerPhoto: false,
    hasPumpPhoto: false,
    savedAt: nowMs,
  };
}

function positive(n: unknown): number | undefined {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : undefined;
}

/** "Next" on the odometer step: works once there is a photo (the reading is optional). */
export function canLeaveOdometerStep(d: FuelPhotoDraft): boolean {
  return d.hasOdometerPhoto;
}

/** "Save": Cash needs the pump photo; Gas Card needs nothing more. */
export function canSave(d: FuelPhotoDraft): boolean {
  if (!d.hasOdometerPhoto || !d.payment) return false;
  if (d.payment === 'rideshare_cash') return d.hasPumpPhoto;
  // Gas Card + Cash: the cash part is worked out from the card statement, which needs the
  // pump total and litres (read from the photo or typed). The one fill where numbers are needed.
  if (d.payment === 'gas_card_and_cash') return d.hasPumpPhoto && !!positive(d.total) && !!positive(d.liters);
  return d.payment === 'gas_card';
}

/** J$ a litre, when both numbers are there. */
export function pricePerLitre(total?: number, liters?: number): number | undefined {
  const t = positive(total);
  const l = positive(liters);
  return t && l ? Math.round((t / l) * 100) / 100 : undefined;
}

export interface FuelPhotoContext {
  driverId: string;
  driverName?: string;
  vehicleId?: string;
  vehiclePlate?: string;
  /** Gas Card: the card when the phone knows it. Without it the server attaches the card (FO-12). */
  cardId?: string;
}

function ymd(iso: string): string {
  // Local date of the photo, not UTC.
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function hms(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function shortDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** The fill's GPS, with its age measured against the photo (S7 does the same on the server). */
function locationFor(d: FuelPhotoDraft): FuelPhotoLocation | undefined {
  if (!d.location) return undefined;
  const fix = Date.parse(d.location.fixAt);
  const cap = Date.parse(d.capturedAt);
  const ageS = Number.isFinite(fix) && Number.isFinite(cap) ? Math.max(0, Math.round((cap - fix) / 1000)) : d.location.ageS;
  return { ...d.location, ageS };
}

type NewAction = Omit<OfflineAction, 'id' | 'timestamp' | 'retryCount'>;

/**
 * FO-05: Save → one waiting-list item. The item owns the draft's photos (they are deleted from the
 * phone only after the server confirms the item arrived).
 */
export function buildFuelPhotoQueueAction(d: FuelPhotoDraft, ctx: FuelPhotoContext): NewAction {
  const date = ymd(d.capturedAt);
  const time = hms(d.capturedAt);
  const odometer = positive(d.odometerKm);
  const odometerMethod = odometer == null ? undefined : d.odometerSource === 'photo' ? 'ai_verified' : 'manual_override';
  const common = {
    captureId: d.captureId,
    capturedAt: d.capturedAt,
    photoFirst: true,
    odometerMethod,
    locationMetadata: locationFor(d),
    locationMissingReason: d.location ? undefined : d.locationMissingReason,
    ...(d.stationClaim
      ? {
          driverClaim: {
            stationId: d.stationClaim.stationId,
            stationName: d.stationClaim.stationName,
            leftStation: !d.stationClaim.fromGps,
            minutesAgo: 0,
          },
          ...(d.stationClaim.fromGps && d.stationClaim.stationName ? { nearbyStationChip: d.stationClaim.stationName } : {}),
        }
      : {}),
  };

  if (d.payment === 'gas_card_and_cash') {
    const pumpTotal = positive(d.total) ?? 0;
    const pumpLiters = positive(d.liters) ?? 0;
    const fillGroupId = d.captureId;
    // Same shape as the current Gas Card + Cash screen (buildCashSplitMetadata / buildCardSplitMetadata).
    const cashMeta = { fillGroupId, splitRole: 'cash', splitPumpTotal: pumpTotal, splitVolumeOwner: true, awaitingCashStatement: true };
    const cardMeta = { fillGroupId, splitRole: 'card', splitPumpTotal: pumpTotal, splitVolumeOwner: false };
    return {
      type: 'SUBMIT_SPLIT_FUEL_FILL',
      payload: {
        fillGroupId,
        cashTransaction: {
          id: d.captureId,
          date,
          time,
          category: 'Fuel',
          type: 'Expense',
          status: 'Pending',
          description: 'Fuel (split — cash pending statement)',
          driverId: ctx.driverId,
          driverName: ctx.driverName,
          vehicleId: ctx.vehicleId,
          vehiclePlate: ctx.vehiclePlate,
          amount: 0,
          paymentMethod: 'RideShare Cash',
          odometer,
          metadata: {
            ...common,
            ...cashMeta,
            fuelVolume: pumpLiters,
            pricePerLiter: pricePerLitre(pumpTotal, pumpLiters),
            paymentSource: 'rideshare_cash',
          },
        },
        cardFuelEntry: {
          id: d.splitCardEntryId || `${d.captureId.slice(0, 24)}card00000000`,
          date,
          time,
          ...(ctx.cardId ? { cardId: ctx.cardId } : {}),
          vehicleId: ctx.vehicleId,
          driverId: ctx.driverId,
          driverName: ctx.driverName,
          amount: 0,
          liters: 0,
          odometer,
          type: 'Manual_Entry',
          entryMode: 'Anchor',
          paymentSource: 'Gas_Card',
          entrySource: 'driver-portal',
          reconciliationStatus: 'Pending',
          metadata: {
            ...common,
            ...cardMeta,
            awaitingCardStatement: true,
            paymentSource: 'company_card',
            countsInFuelSpend: false,
            countsInFuelVolume: false,
          },
        },
        odometerBlobKey: d.hasOdometerPhoto ? odometerBlobKey(d.captureId) : undefined,
        receiptBlobKey: d.hasPumpPhoto ? pumpBlobKey(d.captureId) : undefined,
        odometerFileName: 'odometer.jpg',
        receiptFileName: 'pump.jpg',
        odometerMimeType: 'image/jpeg',
        receiptMimeType: 'image/jpeg',
        label: `Fuel · Gas Card + Cash · ${shortDay(d.capturedAt)}`,
      },
    } as NewAction;
  }

  if (d.payment === 'gas_card') {
    const id = d.captureId;
    return {
      type: 'SUBMIT_GAS_CARD_ANCHOR',
      payload: {
        fuelEntry: {
          id,
          date,
          time,
          ...(ctx.cardId ? { cardId: ctx.cardId } : {}),
          vehicleId: ctx.vehicleId,
          driverId: ctx.driverId,
          amount: 0,
          liters: positive(d.liters) ?? 0,
          odometer,
          type: 'Manual_Entry',
          entryMode: 'Anchor',
          paymentSource: 'Gas_Card',
          entrySource: 'driver-portal',
          reconciliationStatus: 'Pending',
          metadata: {
            ...common,
            awaitingCardStatement: true,
            paymentSource: 'company_card',
            countsInFuelSpend: false,
            countsInFuelVolume: false,
          },
        },
        odometerBlobKey: d.hasOdometerPhoto ? odometerBlobKey(d.captureId) : undefined,
        odometerFileName: 'odometer.jpg',
        odometerMimeType: 'image/jpeg',
        label: `Fuel · Gas Card · ${shortDay(d.capturedAt)}`,
      },
    } as NewAction;
  }

  const total = positive(d.total);
  const liters = positive(d.liters);
  return {
    type: 'SUBMIT_FUEL_EXPENSE',
    payload: {
      transaction: {
        id: d.captureId,
        date,
        time,
        type: 'Expense',
        category: 'Fuel',
        status: 'Pending',
        driverId: ctx.driverId,
        driverName: ctx.driverName,
        vehicleId: ctx.vehicleId,
        vehiclePlate: ctx.vehiclePlate,
        description: 'Fuel',
        paymentMethod: 'RideShare Cash',
        // No total yet = the server reads it from the pump photo (S5).
        ...(total ? { amount: -total } : {}),
        odometer,
        metadata: {
          ...common,
          fuelVolume: liters,
          pricePerLiter: pricePerLitre(total, liters),
          paymentSource: 'rideshare_cash',
          numbersFrom: total ? d.totalSource ?? 'typed' : undefined,
          needsLogReview: odometerMethod && odometerMethod !== 'ai_verified' ? true : undefined,
          logReviewReason: odometerMethod === 'manual_override' ? 'Odometer typed by the driver' : undefined,
        },
      },
      odometerBlobKey: d.hasOdometerPhoto ? odometerBlobKey(d.captureId) : undefined,
      receiptBlobKey: d.hasPumpPhoto ? pumpBlobKey(d.captureId) : undefined,
      odometerFileName: 'odometer.jpg',
      receiptFileName: 'pump.jpg',
      odometerMimeType: 'image/jpeg',
      receiptMimeType: 'image/jpeg',
      label: `Fuel · ${shortDay(d.capturedAt)}`,
    },
  } as NewAction;
}
