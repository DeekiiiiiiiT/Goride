/** Manual QA matrix for cash settlement rollout (driver app). */
export const CASH_SETTLEMENT_QA = [
  'Flag OFF: Complete trip button goes directly to completed',
  'Flag OFF: Activity / earnings unchanged',
  'Flag ON: Collect payment → mandatory settlement screen',
  'Flag ON: Cannot dismiss settlement until submitted',
  'Flag ON: Cannot go online until settlement submitted',
  'Flag ON: App relaunch shows settlement for pending ride',
  'Flag ON: Offline retry uses same idempotency key',
  'Flag ON: 409 prompts new amount + new key',
  'Flag ON: GET /v1/drivers/me/wallet returns balance after settlement',
] as const;
