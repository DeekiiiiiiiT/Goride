export type EarningsPeriod = 'today' | 'week' | 'month';

export type RecentDelivery = {
  id: string;
  time: string;
  restaurant: string;
  dropoff: string;
  amount: number;
  accentOpacity?: number;
};

export type DayEarnings = {
  label: string;
  amount: number;
  heightPercent: number;
  isHighlight?: boolean;
};

export type TodayEarnings = {
  dateLabel: string;
  total: number;
  deliveries: number;
  avgPerDelivery: number;
  activeTime: string;
  dashTime: string;
  tips: number;
  peakPay: number;
  recent: RecentDelivery[];
};

export type WeeklyEarnings = {
  rangeLabel: string;
  total: number;
  deliveries: number;
  activeHours: string;
  avgPerHour: number;
  dailyBreakdown: DayEarnings[];
  deposited: number;
  pending: number;
};

export const MOCK_TODAY_EARNINGS: TodayEarnings = {
  dateLabel: 'Wednesday, Oct 25',
  total: 4280,
  deliveries: 9,
  avgPerDelivery: 476,
  activeTime: '5h 32m',
  dashTime: '6h 15m',
  tips: 890,
  peakPay: 200,
  recent: [
    {
      id: 'del-1',
      time: '2:42 PM',
      restaurant: 'Island Grill',
      dropoff: 'New Kingston',
      amount: 520,
    },
    {
      id: 'del-2',
      time: '1:15 PM',
      restaurant: 'Burger King',
      dropoff: 'Half Way Tree',
      amount: 480,
      accentOpacity: 0.5,
    },
  ],
};

export const MOCK_WEEKLY_EARNINGS: WeeklyEarnings = {
  rangeLabel: 'Oct 22 - Oct 28',
  total: 28450,
  deliveries: 62,
  activeHours: '38h',
  avgPerHour: 748,
  dailyBreakdown: [
    { label: 'M', amount: 3200, heightPercent: 30 },
    { label: 'T', amount: 4100, heightPercent: 45 },
    { label: 'W', amount: 2800, heightPercent: 25 },
    { label: 'T', amount: 5500, heightPercent: 70, isHighlight: true },
    { label: 'F', amount: 6200, heightPercent: 85 },
    { label: 'S', amount: 4800, heightPercent: 60 },
    { label: 'S', amount: 1850, heightPercent: 15 },
  ],
  deposited: 22100,
  pending: 6350,
};

export function formatJmd(amount: number): string {
  return amount.toLocaleString('en-JM');
}
