/** Client flag for cash settlement rollout (`VITE_CASH_SETTLEMENT=1`). Default OFF. */
export const CASH_SETTLEMENT_ENABLED = import.meta.env.VITE_CASH_SETTLEMENT === '1';

/** Multi-wallet cash settlement UI (`VITE_CASH_SETTLEMENT_V2=1`). Requires V1 client flag. */
export const CASH_SETTLEMENT_V2_ENABLED =
  CASH_SETTLEMENT_ENABLED && import.meta.env.VITE_CASH_SETTLEMENT_V2 === '1';
