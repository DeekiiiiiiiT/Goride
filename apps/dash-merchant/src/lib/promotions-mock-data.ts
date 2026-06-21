import { DailyRedemption, Promotion } from '../types/promotions';

function daysFromNow(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export const DEFAULT_PROMOTIONS: Promotion[] = [
  {
    id: 'promo-1',
    type: 'percent_off',
    title: '20% off first order',
    discountPercent: 20,
    dateStart: daysFromNow(-20),
    dateEnd: daysFromNow(5),
    redemptions: 45,
    status: 'active',
  },
  {
    id: 'promo-2',
    type: 'free_delivery',
    title: 'Free delivery over J$2000',
    minOrder: 2000,
    dateStart: daysFromNow(-30),
    redemptions: 23,
    status: 'active',
  },
];

export const WEEKLY_REDEMPTIONS: DailyRedemption[] = [
  { day: 'Mon', redemptions: 12, sales: 8 },
  { day: 'Tue', redemptions: 18, sales: 12 },
  { day: 'Wed', redemptions: 24, sales: 15 },
  { day: 'Thu', redemptions: 19, sales: 11 },
  { day: 'Fri', redemptions: 14, sales: 9 },
  { day: 'Sat', redemptions: 21, sales: 13 },
  { day: 'Sun', redemptions: 32, sales: 18 },
];
