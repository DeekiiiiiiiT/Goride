import type { FuelEntry } from '../types/fuel';

export type GasCardAnchorEntrySource = 'driver-portal' | 'admin-manual';

export type BuildGasCardOdometerAnchorInput = {
  id?: string;
  date: string; // YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss
  time?: string; // HH:mm:ss
  cardId: string;
  vehicleId: string;
  driverId: string;
  odometer: number;
  odometerImageUrl?: string;
  location?: string;
  stationAddress?: string;
  matchedStationId?: string;
  entrySource: GasCardAnchorEntrySource;
  odometerMethod?: string;
  driverName?: string;
  locationMetadata?: FuelEntry['locationMetadata'];
  parentCompany?: string;
};

/**
 * Shared Gas Card claim shape — odometer + card (+ station for admin).
 * Money/liters come from JAA CSV match later (awaitingCardStatement).
 */
export function buildGasCardOdometerAnchor(
  input: BuildGasCardOdometerAnchorInput,
): FuelEntry {
  const odo = Number(input.odometer);
  const entrySource = input.entrySource;
  const odometerImageUrl = input.odometerImageUrl || undefined;

  return {
    id: input.id || crypto.randomUUID(),
    date: input.date,
    time: input.time,
    cardId: input.cardId,
    vehicleId: input.vehicleId,
    driverId: input.driverId,
    amount: 0,
    odometer: odo,
    odometerImageUrl,
    location: input.location,
    stationAddress: input.stationAddress,
    matchedStationId: input.matchedStationId,
    type: 'Manual_Entry',
    entryMode: 'Anchor',
    paymentSource: 'Gas_Card',
    usageCategory: 'ride',
    entrySource,
    reconciliationStatus: 'Pending',
    locationMetadata: input.locationMetadata,
    metadata: {
      awaitingCardStatement: true,
      paymentSource: 'company_card',
      countsInFuelSpend: false,
      countsInFuelVolume: false,
      odometerMethod:
        input.odometerMethod ||
        (odometerImageUrl
          ? entrySource === 'driver-portal'
            ? 'Driver Photo'
            : 'Admin Photo Upload'
          : 'Direct Entry'),
      odometerProofUrl: odometerImageUrl,
      matchedStationId: input.matchedStationId,
      stationLocation: input.stationAddress || input.location,
      driverName: input.driverName,
      locationMetadata: input.locationMetadata,
      parentCompany: input.parentCompany,
      source: entrySource === 'admin-manual' ? 'Manual' : undefined,
      isManual: entrySource === 'admin-manual' ? true : undefined,
      entrySource,
    },
  } as FuelEntry;
}

/** Known-fill / admin save wrapper — skip settlement / reimbursement TX path. */
export function asGasCardAnchorSavePayload(fuelEntry: FuelEntry) {
  return { _saveAsGasCardAnchor: true as const, fuelEntry };
}
