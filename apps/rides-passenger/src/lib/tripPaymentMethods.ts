import type { RidePaymentMethod } from '@roam/types/rides';

export type TripPaymentMethodId = 'apple_pay' | 'visa_1212' | 'cash' | 'lynk';

export type TripPaymentMethodIcon = 'apple' | 'visa' | 'cash' | 'card' | 'lynk';

export type ArrearsPaymentMethodKind = 'card' | 'lynk';

export interface TripPaymentMethodOption {
  id: TripPaymentMethodId;
  /** Single-line label shown on the home booking bar (Uber-style). */
  barLabel: string;
  /** Secondary line in the payment picker sheet. */
  subtitle?: string;
  ridePaymentMethod: RidePaymentMethod;
  icon: TripPaymentMethodIcon;
  isDefault?: boolean;
  /** Demo / not yet live — still selectable but card rails are stubbed. */
  isDemo?: boolean;
  /** Used for arrears settlement eligibility. */
  arrearsKind?: ArrearsPaymentMethodKind;
  /** When false, method is not shown in trip booking picker (arrears-only). */
  bookable?: boolean;
}

/** Single source of truth for booking + wallet payment method UI. */
export const TRIP_PAYMENT_METHODS: TripPaymentMethodOption[] = [
  {
    id: 'cash',
    barLabel: 'Cash',
    subtitle: 'Pay your driver in person',
    ridePaymentMethod: 'cash',
    icon: 'cash',
    bookable: true,
  },
  {
    id: 'apple_pay',
    barLabel: 'Apple Pay',
    subtitle: 'Demo — coming soon',
    ridePaymentMethod: 'card',
    icon: 'apple',
    isDemo: true,
    arrearsKind: 'card',
    bookable: true,
  },
  {
    id: 'visa_1212',
    barLabel: 'Visa ••••1212',
    subtitle: 'Demo — expires 12/26',
    ridePaymentMethod: 'card',
    icon: 'visa',
    isDemo: true,
    arrearsKind: 'card',
    bookable: true,
  },
  {
    id: 'lynk',
    barLabel: 'Lynk',
    subtitle: 'Demo — Lynk wallet',
    ridePaymentMethod: 'card',
    icon: 'lynk',
    isDemo: true,
    arrearsKind: 'lynk',
    bookable: false,
  },
];

/** Methods shown in the home booking payment picker. */
export const BOOKABLE_PAYMENT_METHODS = TRIP_PAYMENT_METHODS.filter(
  (m) => m.bookable !== false,
);

export const PAYMENT_METHOD_STORAGE_KEY = 'roam-default-payment-method-id';
export const PAYMENT_METHOD_CHANGED_EVENT = 'roam-payment-method-changed';

/** Server allowlist for arrears payment (mirrors client). */
export const ARREARS_PAYMENT_METHOD_IDS = ['apple_pay', 'visa_1212', 'lynk'] as const;

export type ArrearsPaymentMethodId = (typeof ARREARS_PAYMENT_METHOD_IDS)[number];

const STORAGE_KEY = PAYMENT_METHOD_STORAGE_KEY;

export function getPaymentMethodById(id: string): TripPaymentMethodOption {
  return TRIP_PAYMENT_METHODS.find((m) => m.id === id) ?? TRIP_PAYMENT_METHODS[0];
}

export function getDefaultPaymentMethodId(): TripPaymentMethodId {
  if (typeof localStorage === 'undefined') {
    return 'cash';
  }
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && BOOKABLE_PAYMENT_METHODS.some((m) => m.id === stored)) {
    return stored as TripPaymentMethodId;
  }
  return 'cash';
}

export function setDefaultPaymentMethodId(id: TripPaymentMethodId): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, id);
  window.dispatchEvent(new CustomEvent(PAYMENT_METHOD_CHANGED_EVENT, { detail: id }));
}

export function isDemoPaymentMethod(id: string): boolean {
  return getPaymentMethodById(id).isDemo === true;
}

export function canUseMethodForArrears(id: string): boolean {
  const method = getPaymentMethodById(id);
  return method.arrearsKind === 'card' || method.arrearsKind === 'lynk';
}

export function getArrearsEligibleMethods(
  methodIds?: string[],
): TripPaymentMethodOption[] {
  const ids = methodIds ?? TRIP_PAYMENT_METHODS.map((m) => m.id);
  return ids
    .map((id) => getPaymentMethodById(id))
    .filter((m) => canUseMethodForArrears(m.id));
}

export function hasArrearsEligibleMethod(methodIds?: string[]): boolean {
  return getArrearsEligibleMethods(methodIds).length > 0;
}

export function paymentSourceForMethodId(id: string): 'demo_card' | 'demo_lynk' {
  const method = getPaymentMethodById(id);
  return method.arrearsKind === 'lynk' ? 'demo_lynk' : 'demo_card';
}

export function shortfallPaymentMethodForId(id: string): 'card' | 'lynk' {
  return getPaymentMethodById(id).arrearsKind === 'lynk' ? 'lynk' : 'card';
}
