import type { FuelCard, JaaCardType } from '../types/fuel';

/** Normalize JAA CARD_CODE / inventory cardNumber for comparison (alnum only). */
export function normalizeFuelCardCode(raw: string | undefined | null): string {
  return String(raw || '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
}

/** Build inventory CARD_CODE = company number + Reg# (plate or RNxxxx). */
export function buildJaaCardCode(
  companyNumber: string | undefined | null,
  regNumber: string | undefined | null,
): string {
  return `${normalizeFuelCardCode(companyNumber)}${normalizeFuelCardCode(regNumber)}`;
}

/** Rental Reg# looks like RN2783; otherwise treat as vehicle plate (driver card). */
export function hintJaaTypeFromReg(regNumber: string | undefined | null): JaaCardType {
  return /^RN\d+/i.test(normalizeFuelCardCode(regNumber)) ? 'rental' : 'driver_tied';
}

/** Split a stored CARD_CODE into company + Reg for the physical-card form. */
export function splitJaaCardCode(
  cardNumber: string | undefined | null,
  preferredCompany?: string | null,
): { companyNumber: string; regNumber: string } {
  const norm = normalizeFuelCardCode(cardNumber);
  const preferred = String(preferredCompany || '').replace(/\D/g, '');
  if (preferred && norm.startsWith(preferred)) {
    return { companyNumber: preferred, regNumber: norm.slice(preferred.length) };
  }
  // Typical JAA company codes are 8 digits (e.g. 00002920)
  if (norm.length > 8 && /^\d{8}/.test(norm)) {
    return { companyNumber: norm.slice(0, 8), regNumber: norm.slice(8) };
  }
  return { companyNumber: preferred || '', regNumber: norm };
}

/** Match inventory card by CARD_CODE (alphanumeric endsWith either way). */
export function findFuelCardByCode(
  fuelCards: FuelCard[] | undefined,
  cardCode: string | undefined | null,
): FuelCard | undefined {
  const needle = normalizeFuelCardCode(cardCode);
  if (!needle || !fuelCards?.length) return undefined;
  return fuelCards.find((c) => {
    const stored = normalizeFuelCardCode(c.cardNumber);
    if (!stored) return false;
    return stored === needle || stored.endsWith(needle) || needle.endsWith(stored);
  });
}

/** Active card assigned to a Roam vehicle (preferred Gas Card path). */
export function findActiveFuelCardForVehicle(
  fuelCards: FuelCard[] | undefined,
  vehicleId: string | undefined | null,
): FuelCard | undefined {
  if (!vehicleId || !fuelCards?.length) return undefined;
  return fuelCards.find(
    (c) => c.status === 'Active' && c.assignedVehicleId === vehicleId,
  );
}

/** Active card assigned to a Roam driver (rental / driver-tied cards). */
export function findActiveFuelCardForDriver(
  fuelCards: FuelCard[] | undefined,
  driverId: string | undefined | null,
): FuelCard | undefined {
  if (!driverId || !fuelCards?.length) return undefined;
  return fuelCards.find(
    (c) => c.status === 'Active' && c.assignedDriverId === driverId,
  );
}

/**
 * Resolve the Active inventory card for a fueling session.
 * Prefers vehicle assignment; falls back to driver (rental / driver-tied).
 */
export function findActiveFuelCardForSession(
  fuelCards: FuelCard[] | undefined,
  opts: { vehicleId?: string | null; driverId?: string | null },
): FuelCard | undefined {
  return (
    findActiveFuelCardForVehicle(fuelCards, opts.vehicleId) ||
    findActiveFuelCardForDriver(fuelCards, opts.driverId)
  );
}
