export type PayoutStatus = 'deposited' | 'pending' | 'failed';

export type PayoutRecord = {
  id: string;
  dateLabel: string;
  timeLabel: string;
  amount: number;
  method: string;
  schedule: string;
  status: PayoutStatus;
};

export type PayoutHistoryGroup = {
  month: string;
  items: PayoutRecord[];
};

export const MOCK_PAYOUT_HISTORY: PayoutHistoryGroup[] = [
  {
    month: 'June 2026',
    items: [
      {
        id: 'p-1',
        dateLabel: 'Jun 18',
        timeLabel: '9:42 AM',
        amount: 4280,
        method: 'Bank ****4521',
        schedule: 'Weekly',
        status: 'pending',
      },
      {
        id: 'p-2',
        dateLabel: 'Jun 11',
        timeLabel: '8:15 AM',
        amount: 28450,
        method: 'Bank ****4521',
        schedule: 'Weekly',
        status: 'deposited',
      },
      {
        id: 'p-3',
        dateLabel: 'Jun 4',
        timeLabel: '8:22 AM',
        amount: 31200,
        method: 'Bank ****4521',
        schedule: 'Weekly',
        status: 'deposited',
      },
    ],
  },
  {
    month: 'May 2026',
    items: [
      {
        id: 'p-4',
        dateLabel: 'May 28',
        timeLabel: '8:05 AM',
        amount: 26800,
        method: 'Bank ****4521',
        schedule: 'Weekly',
        status: 'deposited',
      },
      {
        id: 'p-5',
        dateLabel: 'May 21',
        timeLabel: '2:14 PM',
        amount: 1500,
        method: 'Debit ****8832',
        schedule: 'Instant',
        status: 'deposited',
      },
      {
        id: 'p-6',
        dateLabel: 'May 14',
        timeLabel: '8:18 AM',
        amount: 29550,
        method: 'Bank ****4521',
        schedule: 'Weekly',
        status: 'failed',
      },
    ],
  },
];

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
