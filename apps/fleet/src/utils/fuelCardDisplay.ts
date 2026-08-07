import type { FuelCard } from '../types/fuel';

/** Customer-facing brand for Roam-managed third-party cards (never show issuer name). */
export const ROAM_FUEL_PROVIDER_LABEL = 'Roam Fuels';

export function getCustomerFacingFuelProvider(
  card: Pick<FuelCard, 'provider'> | null | undefined,
  isRoamManaged: boolean,
): string {
  if (!card) return '';
  if (isRoamManaged) return ROAM_FUEL_PROVIDER_LABEL;
  return card.provider || 'Fuel Card';
}

export function formatCustomerFacingFuelCardLabel(
  card: Pick<FuelCard, 'provider' | 'cardNumber'> | null | undefined,
  isRoamManaged: boolean,
): string {
  if (!card) return '';
  const provider = getCustomerFacingFuelProvider(card, isRoamManaged);
  return `${provider} - ${card.cardNumber}`;
}
