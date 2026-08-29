/** Jamaica GCT supply classes (GCT Act schedules). */
export type GctSupplyClass =
  | 'standard'
  | 'tourism'
  | 'telephone'
  | 'zero_rated'
  | 'exempt'
  | 'out_of_scope';

export type GctRateRow = {
  supplyClass: GctSupplyClass;
  ratePercent: number;
  effectiveFrom: string; // YYYY-MM-DD
  effectiveTo: string | null; // YYYY-MM-DD inclusive, null = open
};

export type TaxPointInput = {
  invoiceAt?: string | Date | null;
  paymentAt?: string | Date | null;
  deliveryAt?: string | Date | null;
};

/** Reg. 14 style input-tax credit restrictions. */
export type InputTaxCreditRestriction =
  | 'none'
  | 'entertainment'
  | 'motor_vehicle'
  | 'capital_24m'
  | 'apportioned'
  | 'de_minimis';

export const GCT_THRESHOLD_JMD = 15_000_000;

/** Seed statutory rates — public sources; accountant confirms before customer cutover. */
export const SEED_STANDARD_RATE_PERCENT = 15;
