import type { FuelCard } from '../types/fuel';

/** Normalize JAA CARD_CODE / inventory cardNumber for comparison (alnum only). */
export function normalizeFuelCardCode(raw: string | undefined | null): string {
  return String(raw || '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
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
