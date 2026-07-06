/** Shared trip ledger UI helpers (Phase 11 dedup). */

export function formatPlatformLedgerWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-JM', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

export const PLATFORM_LEDGER_STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'on_trip', label: 'On trip' },
  { value: 'matching', label: 'Matching' },
] as const;

export const PLATFORM_LEDGER_PAYMENT_OPTIONS = [
  { value: '', label: 'All payments' },
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
] as const;

export const PLATFORM_LEDGER_LINE_KIND_OPTIONS = [
  { value: '', label: 'All line kinds' },
  { value: 'fare_earning', label: 'Fare earning' },
  { value: 'tip', label: 'Tip' },
  { value: 'platform_fee', label: 'Platform fee' },
  { value: 'trip_cancelled', label: 'Trip cancelled' },
] as const;
