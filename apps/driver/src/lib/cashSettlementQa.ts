/** Manual QA matrix for driver cash settlement. */
export const CASH_SETTLEMENT_QA = [
  'Driver: Collect payment transitions to awaiting_cash_settlement',
  'Driver: cash entry overlay blocks other UI until submitted',
  'Driver: on_trip cash card hides fare until settlement',
  'Driver: relaunch during awaiting_cash_settlement restores overlay',
  'Driver: card trip Complete trip → completed (no settlement)',
] as const;
