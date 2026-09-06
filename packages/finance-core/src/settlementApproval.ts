/**
 * Settlement maker-checker threshold — shared by fleet UI + edge commands.
 * Keep Deno mirror in settlement_commands_controller in sync if this moves.
 */
export const SETTLEMENT_APPROVAL_THRESHOLD = 50_000;

export function requiresSettlementApproval(
  amount: number,
  threshold: number = SETTLEMENT_APPROVAL_THRESHOLD,
): boolean {
  return Number(amount) >= Number(threshold) && Number(threshold) > 0;
}
