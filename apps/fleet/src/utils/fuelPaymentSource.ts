/**
 * Single payment-source vocabulary for fuel fills.
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
  raw: string | null | undefined
): FuelPaymentSourceEnum {
  if (raw == null || String(raw).trim() === '') return DEFAULT_ENUM;
  const key = String(raw).trim();
  return RAW_TO_ENUM[key] || DEFAULT_ENUM;
}

export function fuelPaymentSourceToMeta(
  enumVal: FuelPaymentSourceEnum
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
  source: FuelPaymentSourceEnum | string | null | undefined
): boolean {
  const e = normalizeFuelPaymentSourceEnum(source ?? undefined);
  return e === 'RideShare_Cash' || e === 'Personal' || e === 'Petty_Cash';
}
