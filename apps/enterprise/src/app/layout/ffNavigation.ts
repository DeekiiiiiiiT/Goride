import { FREIGHT_FORWARDER_PATH } from '@/app/productDoor';
import { useSafeBack as useSafeBackBase } from '@/app/layout/useSafeBack';

export const FF_HOME = FREIGHT_FORWARDER_PATH;
export const FF_SETUP = `${FREIGHT_FORWARDER_PATH}/setup`;

export const FF_SCREENS: { to: string; label: string; end?: boolean }[] = [
  { to: FREIGHT_FORWARDER_PATH, label: 'Inbound', end: true },
  { to: `${FREIGHT_FORWARDER_PATH}/receive`, label: 'Receive Station' },
  { to: `${FREIGHT_FORWARDER_PATH}/facilities`, label: 'Facilities' },
  { to: `${FREIGHT_FORWARDER_PATH}/partners`, label: 'Courier partners' },
  { to: `${FREIGHT_FORWARDER_PATH}/billing`, label: 'Billing' },
  { to: FF_SETUP, label: 'Setup' },
  { to: `${FREIGHT_FORWARDER_PATH}/team`, label: 'Team' },
];

export function ffScreenLabel(path: string): string {
  const normalized = path.replace(/\/$/, '') || path;
  if (normalized === FREIGHT_FORWARDER_PATH) return 'Inbound';
  const hit = [...FF_SCREENS]
    .filter((s) => s.to !== FREIGHT_FORWARDER_PATH)
    .sort((a, b) => b.to.length - a.to.length)
    .find((s) => normalized === s.to || normalized.startsWith(`${s.to}/`));
  return hit?.label ?? 'Back';
}

export function isFfHome(path: string): boolean {
  const normalized = path.replace(/\/$/, '') || path;
  return normalized === FREIGHT_FORWARDER_PATH;
}

export function useSafeBack(fallback = FF_HOME) {
  return useSafeBackBase({ homePath: fallback, labelFor: ffScreenLabel });
}
