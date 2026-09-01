/** Driver Settlements desk — overpayment display helpers. */

export const OVERPAID_BADGE_TOOLTIP =
  'Fleet paid more than this week’s gross entitlement. Full exposure is in the Driver owes amount.';

export function overpaidBadgeLabel(amount: number | null | undefined): string {
  const n = Number(amount) || 0;
  if (n <= 0.005) return '';
  const body = n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `Overpaid $${body}`;
}

export function collectKindTooltip(kind: string | null | undefined): string {
  if (kind === 'cash_held') {
    return 'Fuel not finalized or cash still held — collect passenger cash first.';
  }
  return 'Settlement residual — driver owes the fleet after cash, fuel, and toll credits.';
}
