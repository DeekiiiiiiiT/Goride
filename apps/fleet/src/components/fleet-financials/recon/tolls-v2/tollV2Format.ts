import type { TollV2Confidence, TollV2Decision, TollV2Trip } from './types';

const JAMAICA = 'America/Jamaica';

function upperPeriod(parts: Intl.DateTimeFormatPart[]): string {
  return parts.map((p) => (p.type === 'dayPeriod' ? p.value.toUpperCase() : p.value)).join('');
}

function partsFor(iso: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormatPart[] {
  return new Intl.DateTimeFormat('en-US', { timeZone: JAMAICA, ...opts }).formatToParts(new Date(iso));
}

function partVal(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((p) => p.type === type)?.value ?? '';
}

export function fmtTollMinor(minor: number | null | undefined): string {
  if (minor == null || !Number.isFinite(minor)) return '—';
  const major = minor / 100;
  const abs = Math.abs(major).toLocaleString('en-JM', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${major < 0 ? '−' : ''}J$${abs}`;
}

export function confidenceLabel(c: TollV2Confidence | undefined): string | null {
  if (c === 'sure') return 'Sure match';
  if (c === 'likely') return 'Likely match';
  if (c === 'two_trips') return 'Two trips fit';
  return null;
}

export function confidenceChipClass(c: TollV2Confidence | undefined): string {
  if (c === 'sure') return 'bg-[#ecfdf5] text-[#069669]';
  if (c === 'two_trips') return 'bg-[#fffbeb] text-[#b45309]';
  if (c === 'likely') return 'bg-[#eff6ff] text-[#1d4ed8]';
  return 'bg-[#eff4ff] text-[#47464c]';
}

export function formatTimeJm(iso: string | undefined): string {
  if (!iso) return '—';
  try {
    const parts = partsFor(iso, { hour: 'numeric', minute: '2-digit', hour12: true });
    return upperPeriod(parts).replace(/\s+/g, ' ').trim();
  } catch {
    return '—';
  }
}

export function formatTripWindow(trip: TollV2Trip | null | undefined): string {
  if (!trip) return 'Trip unknown';
  const a = formatTimeJm(trip.requestAt);
  const b = formatTimeJm(trip.dropoffAt || trip.pickupAt);
  const pay = trip.paymentMethod ? String(trip.paymentMethod) : '';
  return `${a}–${b}${pay ? ` · ${pay}` : ''}`;
}

export function formatDecidedAt(at: string | undefined, by: string | undefined): string {
  if (!at) return by || '—';
  try {
    const d = chargeWhen(at);
    return by ? `${by} · ${d}` : d;
  } catch {
    return by || '—';
  }
}

export function decisionChipClass(kind: string | undefined): string {
  switch (kind) {
    case 'matched':
      return 'bg-[#ecfdf5] text-[#069669]';
    case 'driver_pays':
      return 'bg-[#eff4ff] text-[#0b1c30]';
    case 'fleet_pays':
    case 'fleet_absorbs':
      return 'bg-[#eff4ff] text-[#0b1c30]';
    case 'receipt_rejected':
      return 'bg-[#ffdad6] text-[#ba1a1a]';
    default:
      return 'bg-[#eff4ff] text-[#0b1c30]';
  }
}

export function formatTripChoiceLabel(trip: TollV2Trip | null | undefined): string {
  const a = formatTimeJm(trip?.requestAt);
  const b = formatTimeJm(trip?.dropoffAt || trip?.pickupAt);
  const pay = trip?.paymentMethod ? String(trip.paymentMethod).toLowerCase() : '';
  return `${a}–${b}${pay ? ` · ${pay} trip` : ''}`;
}

export function paidByChipLabel(paidBy: string | undefined): string {
  if (paidBy?.toLowerCase() === 'cash') return 'Cash';
  return 'Tag';
}

export function decisionKindLabel(kind: string | undefined): string {
  switch (kind) {
    case 'matched':
      return 'Matched';
    case 'driver_pays':
      return 'Driver pays';
    case 'fleet_pays':
    case 'fleet_absorbs':
      return 'Fleet pays';
    case 'receipt_rejected':
      return 'Receipt rejected';
    case 'duplicate':
      return 'Duplicate';
    case 'kept_unlinked':
      return 'Kept with no toll';
    default:
      return kind ? kind.replace(/_/g, ' ') : 'Decided';
  }
}

export function rejectReasonLabel(code: string | undefined): string {
  switch (code) {
    case 'photo_unreadable':
      return 'Photo unreadable';
    case 'not_a_toll_receipt':
      return 'Not a toll receipt';
    case 'already_claimed':
      return 'Already claimed';
    case 'other':
      return 'Other';
    default:
      return code || '';
  }
}

export function chargeWhen(iso: string | undefined): string {
  if (!iso) return '—';
  try {
    const parts = partsFor(iso, {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    const day = partVal(parts, 'day');
    const month = partVal(parts, 'month');
    const time = `${partVal(parts, 'hour')}:${partVal(parts, 'minute')} ${partVal(parts, 'dayPeriod').toUpperCase()}`;
    return `${day} ${month}, ${time}`;
  } catch {
    return '—';
  }
}

/** "29 Aug · Uber trip 7:58 PM–8:40 PM · card · paid back J$275.00" — a payback row's first line. */
export function paybackLine(
  trip: TollV2Trip | null | undefined,
  paidOn: string | undefined,
  paidBackMinor?: number,
): string {
  const when = trip?.dropoffAt || trip?.requestAt;
  const day = when ? chargeWhen(when).split(',')[0] : paidOn ? chargeWhen(`${paidOn}T12:00:00-05:00`).split(',')[0] : '';
  const body = trip ? `Uber trip ${tripPill(trip, paidBackMinor)}` : `Uber payback${paidBackMinor ? ` ${fmtTollMinor(paidBackMinor)}` : ''}`;
  return day && day !== '—' ? `${day} · ${body}` : body;
}

/** Green chip copy for pick-trip radio cards. */
export function uberPaidBackLabel(minor: number | null | undefined): string {
  return `Uber paid back ${fmtTollMinor(minor ?? 0)}`;
}

export function tripPill(trip: TollV2Trip | null | undefined, paidBackMinor?: number): string {
  const window = formatTripWindow(trip);
  if (paidBackMinor != null && paidBackMinor > 0) {
    return `${window} · paid back ${fmtTollMinor(paidBackMinor)}`;
  }
  return window;
}

export function minutesBetween(a: string | undefined, b: string | undefined): number | null {
  if (!a || !b) return null;
  const ms = new Date(a).getTime() - new Date(b).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.round(ms / 60_000);
}

export function decisionUndoPayload(decision: TollV2Decision | null | undefined): Record<string, unknown> | null {
  const u = decision?.undo;
  if (!u) return null;
  const decisionId = u.decision_id || u.decisionId;
  if (!decisionId) return null;
  return {
    decision_id: decisionId,
    expected_versions: u.expected_versions ?? {},
  };
}
