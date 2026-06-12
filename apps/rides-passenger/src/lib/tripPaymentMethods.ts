import type { RidePaymentMethod } from '@roam/types/rides';

export type TripPaymentMethodId = 'apple_pay' | 'visa_1212' | 'cash';

export type TripPaymentMethodIcon = 'apple' | 'visa' | 'cash' | 'card';

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
}

/** Single source of truth for booking + wallet payment method UI. */
export const TRIP_PAYMENT_METHODS: TripPaymentMethodOption[] = [
  {
    id: 'cash',
    barLabel: 'Cash',
    subtitle: 'Pay your driver in person',
    ridePaymentMethod: 'cash',
    icon: 'cash',
  },
  {
    id: 'apple_pay',
    barLabel: 'Apple Pay',
    subtitle: 'Demo — coming soon',
    ridePaymentMethod: 'card',
    icon: 'apple',
    isDemo: true,
  },
  {
    id: 'visa_1212',
    barLabel: 'Visa ••••1212',
    subtitle: 'Demo — expires 12/26',
    ridePaymentMethod: 'card',
    icon: 'visa',
    isDemo: true,
  },
];

export const PAYMENT_METHOD_STORAGE_KEY = 'roam-default-payment-method-id';
export const PAYMENT_METHOD_CHANGED_EVENT = 'roam-payment-method-changed';

const STORAGE_KEY = PAYMENT_METHOD_STORAGE_KEY;

export function getPaymentMethodById(id: TripPaymentMethodId): TripPaymentMethodOption {
  return TRIP_PAYMENT_METHODS.find((m) => m.id === id) ?? TRIP_PAYMENT_METHODS[0];
}

export function getDefaultPaymentMethodId(): TripPaymentMethodId {
  if (typeof localStorage === 'undefined') {
    return 'cash';
  }
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && TRIP_PAYMENT_METHODS.some((m) => m.id === stored)) {
    return stored as TripPaymentMethodId;
  }
  return 'cash';
}

export function setDefaultPaymentMethodId(id: TripPaymentMethodId): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, id);
  window.dispatchEvent(new CustomEvent(PAYMENT_METHOD_CHANGED_EVENT, { detail: id }));
}

export function isDemoPaymentMethod(id: TripPaymentMethodId): boolean {
  return getPaymentMethodById(id).isDemo === true;
}
