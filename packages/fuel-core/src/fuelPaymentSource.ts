/**
 * Single payment-source vocabulary for fuel fills (fuel-core SoT).
 * Ambiguous / missing → RideShare_Cash (business trip/fare cash), never silent Personal.
 */

export type FuelPaymentSourceEnum = 'RideShare_Cash' | 'Gas_Card' | 'Personal' | 'Petty_Cash';

/** UI / transaction metadata dropdown keys. */
export type FuelPaymentSourceMeta =
  | 'rideshare_cash'
  | 'company_card'
  | 'driver_cash'
  | 'petty_cash';

const RAW_TO_ENUM: Record<string, FuelPaymentSourceEnum> = {
  rideshare_cash: 'RideShare_Cash',
  'RideShare Cash': 'RideShare_Cash',
  RideShare_Cash: 'RideShare_Cash',
  company_card: 'Gas_Card',
  'Gas Card': 'Gas_Card',
  Gas_Card: 'Gas_Card',
  'Fuel Card': 'Gas_Card',
  driver_cash: 'Personal',
  Cash: 'Personal',
  Personal: 'Personal',
  petty_cash: 'Petty_Cash',
  Other: 'Petty_Cash',
  Petty_Cash: 'Petty_Cash',
};

const ENUM_TO_META: Record<FuelPaymentSourceEnum, FuelPaymentSourceMeta> = {
  RideShare_Cash: 'rideshare_cash',
  Gas_Card: 'company_card',
  Personal: 'driver_cash',
  Petty_Cash: 'petty_cash',
};

const DEFAULT_ENUM: FuelPaymentSourceEnum = 'RideShare_Cash';

export function normalizeFuelPaymentSourceEnum(
  raw: string | null | undefined,
): FuelPaymentSourceEnum {
  if (raw == null || String(raw).trim() === '') return DEFAULT_ENUM;
  const key = String(raw).trim();
  return RAW_TO_ENUM[key] || DEFAULT_ENUM;
}

export function fuelPaymentSourceToMeta(
  enumVal: FuelPaymentSourceEnum,
): FuelPaymentSourceMeta {
  return ENUM_TO_META[enumVal] || 'rideshare_cash';
}

/** Resolve enum + metadata key from any raw (metadata, paymentMethod, top-level). */
export function resolveFuelPaymentSource(raw: string | null | undefined): {
  enum: FuelPaymentSourceEnum;
  meta: FuelPaymentSourceMeta;
} {
  const enumVal = normalizeFuelPaymentSourceEnum(raw);
  return { enum: enumVal, meta: fuelPaymentSourceToMeta(enumVal) };
}

export function isCashStyleFuelPaymentSource(
  source: FuelPaymentSourceEnum | string | null | undefined,
): boolean {
  const e = normalizeFuelPaymentSourceEnum(source ?? undefined);
  return e === 'RideShare_Cash' || e === 'Personal' || e === 'Petty_Cash';
}

const ENUM_TO_LABEL: Record<FuelPaymentSourceEnum, string> = {
  RideShare_Cash: 'RideShare Cash',
  Gas_Card: 'Gas Card',
  Personal: 'Personal Cash',
  Petty_Cash: 'Petty Cash',
};

/** Human label for UI tables / exception blockers. */
export function fuelPaymentSourceDisplayLabel(
  raw: string | null | undefined,
): string {
  return ENUM_TO_LABEL[normalizeFuelPaymentSourceEnum(raw)] || 'RideShare Cash';
}

/** Raw paymentSource from top-level or metadata (F-6). */
export function resolveEntryPaymentRaw(entry: {
  paymentSource?: string | null;
  type?: string;
  metadata?: unknown;
}): string | undefined {
  const meta = entry.metadata as Record<string, unknown> | undefined;
  const metaPay = meta?.paymentSource;
  return (
    entry.paymentSource ||
    (typeof metaPay === 'string' ? metaPay : undefined) ||
    undefined
  );
}

const OUT_OF_POCKET_TYPES = new Set([
  'Reimbursement',
  'Manual_Entry',
  'Fuel_Manual_Entry',
]);

/**
 * F-6: strict partition — normalize once, then gas-card XOR out-of-pocket.
 * company_card / Fuel Card → gas card; Cash + Card_Transaction → out of pocket.
 */
export function isGasCardFuelEntry(entry: {
  paymentSource?: string | null;
  type?: string;
  metadata?: unknown;
}): boolean {
  const raw = resolveEntryPaymentRaw(entry);
  if (raw) {
    const resolved = resolveFuelPaymentSource(raw).enum;
    if (resolved === 'Gas_Card') return true;
    if (isCashStyleFuelPaymentSource(resolved)) return false;
  }
  // No explicit source — Card_Transaction defaults to company card.
  return entry.type === 'Card_Transaction';
}

export function isOutOfPocketFuelEntry(entry: {
  paymentSource?: string | null;
  type?: string;
  metadata?: unknown;
}): boolean {
  if (isGasCardFuelEntry(entry)) return false;
  const raw = resolveEntryPaymentRaw(entry);
  if (raw) {
    const resolved = resolveFuelPaymentSource(raw).enum;
    if (resolved === 'Gas_Card') return false;
    if (isCashStyleFuelPaymentSource(resolved)) return true;
  }
  return OUT_OF_POCKET_TYPES.has(String(entry.type || ''));
}

/** Partition check — spend-eligible row must land in exactly one tile. */
export function fuelPaymentPartitionKind(
  entry: {
    paymentSource?: string | null;
    type?: string;
    metadata?: unknown;
  },
): 'gas_card' | 'out_of_pocket' | 'unclassified' {
  const gas = isGasCardFuelEntry(entry);
  const oop = isOutOfPocketFuelEntry(entry);
  if (gas && !oop) return 'gas_card';
  if (oop && !gas) return 'out_of_pocket';
  return 'unclassified';
}
