export type DashSummary = {
  totalEarned: number;
  deliveries: number;
  activeTime: string;
  onlineTime: string;
  activePercent: number;
};

export type OrderCancellation = {
  cancelledBy: string;
  reason: string;
  compensation: number;
};

export type IssueCategory = {
  id: string;
  label: string;
};

export const ISSUE_CATEGORIES: IssueCategory[] = [
  { id: 'long_wait', label: 'Order not ready (long wait)' },
  { id: 'restaurant_closed', label: 'Restaurant closed' },
  { id: 'wrong_items', label: 'Wrong or missing items' },
  { id: 'customer_unavailable', label: 'Customer unavailable' },
  { id: 'cant_find_address', label: "Can't find address" },
  { id: 'unsafe_location', label: 'Unsafe delivery location' },
  { id: 'vehicle_problem', label: 'Vehicle problem' },
  { id: 'accident_emergency', label: 'Accident or emergency' },
  { id: 'other', label: 'Other' },
];

export const MOCK_DASH_SUMMARY: DashSummary = {
  totalEarned: 4120,
  deliveries: 8,
  activeTime: '3h 15m',
  onlineTime: '4h 32m',
  activePercent: 72,
};

export const MOCK_ORDER_CANCELLATION: OrderCancellation = {
  cancelledBy: 'Customer',
  reason: 'Customer changed their mind',
  compensation: 75,
};

export const BUSY_ZONES_MAP =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDfmexx03hcO9j_tz-JSaTZSgUv1za7BnjwkAP4LznVTH7RLry16-ULltjRklRSU7wv6M68VbgptG2TZj9cFPSCfaf_ZIoYPOOJp1QnEs-67f0zfz9tRnCTiR_J7A7LwTxeSHt72c7st9cKtxlLsqrh3mpmNVS8m8-_lpxmJQXlkA3UaF82z2lujM6H6msfoMV4IgPU_Mx93UlVxTaTEFPydD11Q3o7OwDOUrZLdophnLd7uMZPS-dgfL02xpjkFN2urGBmhsxtK98';

export type ActivePromotion = {
  id: string;
  title: string;
  emoji?: string;
  amountLabel: string;
  amountSuffix?: string;
  schedule: string;
  endsInSeconds: number;
};

export type WeekendChallenge = {
  goal: string;
  schedule: string;
  bonus: number;
  completed: number;
  total: number;
};

export type UpcomingPeakPay = {
  id: string;
  title: string;
  schedule: string;
  amount: number;
  icon: string;
};

export const MOCK_ACTIVE_PROMOTION: ActivePromotion = {
  id: 'dinner-rush',
  title: 'Dinner Rush',
  emoji: '🔥',
  amountLabel: '+J$75',
  amountSuffix: 'per delivery',
  schedule: '6:00 PM - 9:00 PM',
  endsInSeconds: 5052,
};

export const MOCK_WEEKEND_CHALLENGE: WeekendChallenge = {
  goal: 'Complete 15 deliveries',
  schedule: 'Fri 5PM - Sun 11PM',
  bonus: 2000,
  completed: 8,
  total: 15,
};

export const MOCK_UPCOMING_PEAK_PAY: UpcomingPeakPay[] = [
  {
    id: 'lunch',
    title: 'Tomorrow, Lunch',
    schedule: '11:00 AM - 2:00 PM',
    amount: 50,
    icon: 'wb_sunny',
  },
  {
    id: 'dinner',
    title: 'Tomorrow, Dinner',
    schedule: '5:30 PM - 9:30 PM',
    amount: 80,
    icon: 'nights_stay',
  },
];

export function formatCountdown(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
    .toString()
    .padStart(2, '0');
  const m = Math.floor((totalSeconds % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const s = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export function formatJmd(amount: number): string {
  return amount.toLocaleString('en-JM');
}
