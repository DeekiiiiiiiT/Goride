import type { PromoCode } from './orderPricing';
import { PROMO_CODES } from './orderPricing';

export type PaymentMethodId = 'visa-4521' | 'mastercard-8832' | 'apple_pay' | 'cash';

export type CheckoutPreferences = {
  appliedPromoCode: string | null;
  tip: number;
  deliveryMode: 'standard' | 'scheduled';
  scheduledDateId: string | null;
  scheduledSlotId: string | null;
  handoff: 'hand' | 'door';
  paymentMethodId: PaymentMethodId;
};

const STORAGE_KEY = 'roam-dash-checkout';

const DEFAULTS: CheckoutPreferences = {
  appliedPromoCode: 'WELCOME',
  tip: 100,
  deliveryMode: 'standard',
  scheduledDateId: null,
  scheduledSlotId: null,
  handoff: 'door',
  paymentMethodId: 'visa-4521',
};

export function getCheckoutPreferences(): CheckoutPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveCheckoutPreferences(prefs: Partial<CheckoutPreferences>): void {
  const next = { ...getCheckoutPreferences(), ...prefs };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function getAppliedPromo(): PromoCode | null {
  const code = getCheckoutPreferences().appliedPromoCode;
  return code ? PROMO_CODES[code] ?? null : null;
}

export type SavedCard = {
  id: PaymentMethodId;
  brand: string;
  last4: string;
  expires: string;
  label: string;
};

export const PAYMENT_OPTIONS: Array<
  SavedCard | { id: PaymentMethodId; label: string; icon: string; group: 'other' }
> = [
  { id: 'visa-4521', brand: 'VISA', last4: '4242', expires: '12/24', label: 'Visa •••• 4242' },
  { id: 'mastercard-8832', brand: 'MC', last4: '5555', expires: '08/25', label: 'Mastercard •••• 5555' },
  { id: 'apple_pay', label: 'Apple Pay', icon: 'phone_iphone', group: 'other' },
  { id: 'cash', label: 'Cash on delivery', icon: 'payments', group: 'other' },
];

export function getPaymentLabel(id: PaymentMethodId): string {
  const option = PAYMENT_OPTIONS.find(o => o.id === id);
  if (!option) return 'Visa •••• 4521';
  return 'label' in option && option.label ? option.label : 'Payment';
}

export function getApiPaymentMethod(id: PaymentMethodId): 'cash' | 'wipay' | 'paypal' {
  if (id === 'cash') return 'cash';
  return 'wipay';
}

export type ScheduleDate = {
  id: string;
  label: string;
  day: number;
  month: string;
  date: Date;
};

export type ScheduleSlot = {
  id: string;
  label: string;
  disabled?: boolean;
};

export function buildScheduleDates(count = 4): ScheduleDate[] {
  const dates: ScheduleDate[] = [];
  const now = new Date();
  const labels = ['Today', 'Tomorrow'];
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  for (let i = 0; i < count; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    dates.push({
      id: d.toISOString().slice(0, 10),
      label: i < 2 ? labels[i] : weekdays[d.getDay()],
      day: d.getDate(),
      month: months[d.getMonth()],
      date: d,
    });
  }
  return dates;
}

export const SCHEDULE_SLOTS: ScheduleSlot[] = [
  { id: '11-00', label: '11:00 AM - 11:30 AM', disabled: true },
  { id: '11-30', label: '11:30 AM - 12:00 PM', disabled: true },
  { id: '12-00', label: '12:00 PM - 12:30 PM' },
  { id: '12-30', label: '12:30 PM - 1:00 PM' },
  { id: '13-00', label: '1:00 PM - 1:30 PM' },
  { id: '13-30', label: '1:30 PM - 2:00 PM' },
  { id: '14-00', label: '2:00 PM - 2:30 PM' },
  { id: '14-30', label: '2:30 PM - 3:00 PM' },
];
