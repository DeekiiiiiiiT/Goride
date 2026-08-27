import type { PromoCode } from './orderPricing';
import { PROMO_CODES } from './orderPricing';

/** Soft-launch: WiPay card rail + cash (coming soon). PayPal permanently removed. */
export type PaymentMethodId = 'wipay' | 'cash';

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
  appliedPromoCode: null,
  tip: 100,
  deliveryMode: 'standard',
  scheduledDateId: null,
  scheduledSlotId: null,
  handoff: 'door',
  paymentMethodId: 'wipay',
};

/** Map legacy paypal prefs → wipay so old localStorage/profiles keep working. */
export function normalizePaymentMethodId(id: unknown): PaymentMethodId {
  if (id === 'wipay') return 'wipay';
  if (id === 'cash') return 'wipay'; // cash not selectable until DASH_ALLOW_CASH_ORDERS
  // paypal and anything else → wipay
  return 'wipay';
}

export function getCheckoutPreferences(): CheckoutPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<CheckoutPreferences>;
    return {
      ...DEFAULTS,
      ...parsed,
      paymentMethodId: normalizePaymentMethodId(parsed.paymentMethodId),
      appliedPromoCode:
        typeof parsed.appliedPromoCode === 'string' && parsed.appliedPromoCode.trim()
          ? parsed.appliedPromoCode.trim().toUpperCase()
          : null,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveCheckoutPreferences(prefs: Partial<CheckoutPreferences>): void {
  const current = getCheckoutPreferences();
  const next: CheckoutPreferences = {
    ...current,
    ...prefs,
  };
  if (prefs.paymentMethodId) {
    next.paymentMethodId = normalizePaymentMethodId(prefs.paymentMethodId);
  }
  if ('appliedPromoCode' in prefs) {
    next.appliedPromoCode = prefs.appliedPromoCode
      ? String(prefs.appliedPromoCode).trim().toUpperCase()
      : null;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function getAppliedPromo(): PromoCode | null {
  const code = getCheckoutPreferences().appliedPromoCode;
  return code ? PROMO_CODES[code] ?? null : null;
}

export type LivePaymentOption = {
  id: PaymentMethodId;
  label: string;
  icon: string;
  description: string;
  comingSoon?: boolean;
};

export const LIVE_PAYMENT_OPTIONS: LivePaymentOption[] = [
  { id: 'wipay', label: 'WiPay', icon: 'credit_card', description: 'Pay securely with WiPay' },
];

export const COMING_SOON_PAYMENT_OPTIONS: LivePaymentOption[] = [
  {
    id: 'cash',
    label: 'Cash on delivery',
    icon: 'payments',
    description: 'Pay the courier in cash',
    comingSoon: true,
  },
];

/** All rails shown in payment UI (selectable + coming soon). */
export const PAYMENT_OPTIONS: LivePaymentOption[] = [
  ...LIVE_PAYMENT_OPTIONS,
  ...COMING_SOON_PAYMENT_OPTIONS,
];

export function getSelectablePaymentOptions(): LivePaymentOption[] {
  return LIVE_PAYMENT_OPTIONS;
}

export function isSelectablePaymentMethod(id: PaymentMethodId): boolean {
  return id === 'wipay';
}

export function getPaymentLabel(id: PaymentMethodId): string {
  return PAYMENT_OPTIONS.find((o) => o.id === id)?.label ?? 'WiPay';
}

export function getApiPaymentMethod(id: PaymentMethodId): 'wipay' {
  return 'wipay';
}

/** Apply a server-saved default rail to local checkout prefs. */
export function hydratePreferredPaymentMethod(id: unknown): PaymentMethodId {
  const paymentMethodId = normalizePaymentMethodId(id);
  saveCheckoutPreferences({ paymentMethodId });
  return paymentMethodId;
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

/** @deprecated use buildScheduleDates */
export function getScheduleDates(): ScheduleDate[] {
  return buildScheduleDates();
}

/** @deprecated use SCHEDULE_SLOTS */
export function getScheduleSlots(): ScheduleSlot[] {
  return SCHEDULE_SLOTS;
}
