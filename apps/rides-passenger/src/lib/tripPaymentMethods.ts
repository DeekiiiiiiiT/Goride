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
}

export const TRIP_PAYMENT_METHODS: TripPaymentMethodOption[] = [
  {
    id: 'apple_pay',
    barLabel: 'Apple Pay',
    subtitle: 'Linked to Wallet',
    ridePaymentMethod: 'card',
    icon: 'apple',
    isDefault: true,
  },
  {
    id: 'visa_1212',
    barLabel: 'Visa ••••1212',
    subtitle: 'Expires 12/26',
    ridePaymentMethod: 'card',
    icon: 'visa',
  },
  {
    id: 'cash',
    barLabel: 'Cash',
    subtitle: 'Pay your driver in person',
    ridePaymentMethod: 'cash',
    icon: 'cash',
  },
];

const STORAGE_KEY = 'roam-default-payment-method-id';

export function getPaymentMethodById(id: TripPaymentMethodId): TripPaymentMethodOption {
  return TRIP_PAYMENT_METHODS.find((m) => m.id === id) ?? TRIP_PAYMENT_METHODS[0];
}

export function getDefaultPaymentMethodId(): TripPaymentMethodId {
  if (typeof localStorage === 'undefined') {
    return TRIP_PAYMENT_METHODS.find((m) => m.isDefault)?.id ?? 'apple_pay';
  }
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && TRIP_PAYMENT_METHODS.some((m) => m.id === stored)) {
    return stored as TripPaymentMethodId;
  }
  return TRIP_PAYMENT_METHODS.find((m) => m.isDefault)?.id ?? TRIP_PAYMENT_METHODS[0].id;
}

export function setDefaultPaymentMethodId(id: TripPaymentMethodId): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, id);
}
