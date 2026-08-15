export type PayoutStatus = 'deposited' | 'pending' | 'failed';

/** Format a payout amount for display (no currency symbol). */
export function formatPayoutJmd(amount: number): string {
  return amount.toLocaleString('en-JM');
}

const STATUS_LABELS: Record<PayoutStatus, string> = {
  deposited: 'Deposited',
  pending: 'Pending',
  failed: 'Failed',
};

export function payoutStatusLabel(status: PayoutStatus): string {
  return STATUS_LABELS[status];
}
