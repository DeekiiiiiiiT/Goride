/**
 * InDrive wallet — Phase 1 contract.
 * Ledger mapping: `generateTransactionLedgerEntry` maps categories whose lowercase name
 * includes both `wallet` and `credit` → `wallet_credit` (inflow when amount is positive
 * and type is not Expense/Payout).
 *
 * @see src/solution.md — Phase 1 ADR & Phase 2 `periodFees` implementation
 */

/** Exact transaction category for fleet top-ups (must not change without updating ledger mapper expectations). */
export const INDRIVE_WALLET_LOAD_CATEGORY = 'InDrive Wallet Credit' as const;

export type IndriveWalletLoadCategory = typeof INDRIVE_WALLET_LOAD_CATEGORY;

/** Ledger and UI platform tag for InDrive-only aggregation. */
export const INDRIVE_WALLET_PLATFORM = 'InDrive' as const;

export type IndriveWalletPlatform = typeof INDRIVE_WALLET_PLATFORM;

/**
 * Use `Adjustment` with a **positive** `amount` so the transaction is not classified as
 * `Expense` / `Payout` outflow-only in `generateTransactionLedgerEntry`.
 */
export const INDRIVE_WALLET_LOAD_TRANSACTION_TYPE = 'Adjustment' as const;

export type IndriveWalletLoadTransactionType = typeof INDRIVE_WALLET_LOAD_TRANSACTION_TYPE;
