import type { TripPaymentMethodIcon } from '@/lib/tripPaymentMethods';
import {
  TRIP_PAYMENT_METHODS,
  canUseMethodForArrears,
  type ArrearsPaymentMethodKind,
} from '@/lib/tripPaymentMethods';

export interface SavedPaymentMethod {
  id: string;
  kind: ArrearsPaymentMethodKind;
  barLabel: string;
  subtitle?: string;
  icon: TripPaymentMethodIcon;
  cardholderName?: string;
  lynkHandle?: string;
  isDemo?: boolean;
}

const STORAGE_KEY = 'roam-saved-payment-methods-v1';
export const SAVED_PAYMENT_METHODS_CHANGED_EVENT = 'roam-saved-payment-methods-changed';

function seedFromTripMethods(): SavedPaymentMethod[] {
  return TRIP_PAYMENT_METHODS.filter((m) => canUseMethodForArrears(m.id)).map((m) => ({
    id: m.id,
    kind: m.arrearsKind!,
    barLabel: m.barLabel,
    subtitle: m.subtitle,
    icon: m.icon,
    isDemo: m.isDemo,
  }));
}

function readRaw(): SavedPaymentMethod[] | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SavedPaymentMethod[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeRaw(methods: SavedPaymentMethod[]): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(methods));
  window.dispatchEvent(new CustomEvent(SAVED_PAYMENT_METHODS_CHANGED_EVENT));
}

export function listSavedMethods(): SavedPaymentMethod[] {
  const stored = readRaw();
  if (stored && stored.length > 0) {
    return stored.filter((m) => m.kind === 'card' || m.kind === 'lynk');
  }
  const seeded = seedFromTripMethods();
  writeRaw(seeded);
  return seeded;
}

export function getSavedMethodById(id: string): SavedPaymentMethod | undefined {
  return listSavedMethods().find((m) => m.id === id);
}

export function listArrearsEligibleSavedMethods(): SavedPaymentMethod[] {
  return listSavedMethods().filter((m) => m.kind === 'card' || m.kind === 'lynk');
}

export function hasArrearsEligibleSavedMethod(): boolean {
  return listArrearsEligibleSavedMethods().length > 0;
}

export interface AddSavedCardInput {
  brand: string;
  last4: string;
  expiry: string;
  cardholderName: string;
}

export interface AddSavedLynkInput {
  lynkHandle: string;
}

export function addSavedCard(input: AddSavedCardInput): SavedPaymentMethod {
  const name = input.cardholderName.trim();
  if (!name) {
    throw new Error('Cardholder name is required and must match the account holder.');
  }
  const last4 = input.last4.replace(/\D/g, '').slice(-4);
  if (last4.length !== 4) {
    throw new Error('Enter the last 4 digits of your card.');
  }

  const method: SavedPaymentMethod = {
    id: `saved_card_${Date.now()}`,
    kind: 'card',
    barLabel: `${input.brand.trim() || 'Card'} ••••${last4}`,
    subtitle: `Expires ${input.expiry.trim() || '—'} · ${name}`,
    icon: 'visa',
    cardholderName: name,
  };

  const next = [...listSavedMethods(), method];
  writeRaw(next);
  return method;
}

export function addSavedLynk(input: AddSavedLynkInput): SavedPaymentMethod {
  const handle = input.lynkHandle.trim();
  if (!handle) {
    throw new Error('Enter your Lynk phone number or username.');
  }

  const method: SavedPaymentMethod = {
    id: `saved_lynk_${Date.now()}`,
    kind: 'lynk',
    barLabel: 'Lynk',
    subtitle: `Demo — ${handle}`,
    icon: 'lynk',
    lynkHandle: handle,
    isDemo: true,
  };

  const next = [...listSavedMethods(), method];
  writeRaw(next);
  return method;
}

export function removeSavedMethod(id: string): void {
  const next = listSavedMethods().filter((m) => m.id !== id);
  writeRaw(next.length > 0 ? next : seedFromTripMethods());
}
