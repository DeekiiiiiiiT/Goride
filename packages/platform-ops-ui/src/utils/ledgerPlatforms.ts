/**
 * Shared platform options for Ledgers filters (F-28).
 * GoRide is a legacy alias of Roam — not shown as a user-facing option.
 */
export const LEDGER_PLATFORM_OPTIONS = [
  'Uber',
  'Lyft',
  'Bolt',
  'InDrive',
  'Roam',
  'Private',
  'Cash',
  'Other',
] as const;

export type LedgerPlatform = (typeof LEDGER_PLATFORM_OPTIONS)[number];
