/** Scheduled pickup validation — America/Jamaica has no DST; use UTC-5 offset for window checks. */

export const SCHEDULED_MIN_LEAD_MS = 30 * 60_000;
export const SCHEDULED_MAX_LEAD_MS = 7 * 24 * 60 * 60_000;
export const SCHEDULED_DISPATCH_BUFFER_MINUTES = 20;
export const SCHEDULED_QUOTE_TTL_MS = 30 * 60_000;
export const MAX_UPCOMING_SCHEDULED_PER_RIDER = 3;
export const DEFAULT_PICKUP_WINDOW_MINUTES = 10;

export function parseScheduledPickupAt(raw: unknown): Date | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function validateScheduledPickupWindow(pickupAt: Date, now = new Date()): string | null {
  const ms = pickupAt.getTime() - now.getTime();
  if (ms < SCHEDULED_MIN_LEAD_MS) {
    return 'scheduled_too_soon';
  }
  if (ms > SCHEDULED_MAX_LEAD_MS) {
    return 'scheduled_too_far';
  }
  return null;
}

export function clampPickupWindowMinutes(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_PICKUP_WINDOW_MINUTES;
  return Math.min(30, Math.max(5, Math.round(n)));
}

export function pickupWindowBounds(
  scheduledPickupAt: Date,
  windowMinutes: number,
): { start: Date; end: Date } {
  const halfMs = (windowMinutes / 2) * 60_000;
  const center = scheduledPickupAt.getTime();
  return {
    start: new Date(center - halfMs),
    end: new Date(center + halfMs),
  };
}

export function formatCancellationPolicy(): string {
  return 'Free cancellation anytime before your driver is assigned. After dispatch, standard ride cancellation rules apply.';
}
