// Pure recognition engine: expand a recurring FixedExpenseConfig into dated
// occurrences within a window. Each occurrence becomes one canonical
// `fixed_expense` ledger event on its due date (see
// business-finance-recognition-policy.md). No I/O — fully unit-testable.

export interface FixedExpenseLike {
  id?: string;
  vehicleId: string;
  name: string;
  category: string;
  amount: number;
  currency?: string;
  frequency: string;
  startDate: string;
  endDate?: string;
  vendor?: string;
  isActive?: boolean;
}

type CanonicalFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annually' | 'one_time';

function canonicalFrequency(input: string): CanonicalFrequency {
  switch (String(input || '').trim().toLowerCase()) {
    case 'daily': return 'daily';
    case 'weekly': return 'weekly';
    case 'quarterly': return 'quarterly';
    case 'yearly':
    case 'annually': return 'annually';
    case 'one-time':
    case 'one_time':
    case 'onetime': return 'one_time';
    default: return 'monthly';
  }
}

function canonicalCategory(input: string): string {
  switch (String(input || '').trim().toLowerCase()) {
    case 'tracking':
    case 'security': return 'Security';
    case 'license':
    case 'permits':
    case 'registration': return 'Permits';
    case 'insurance': return 'Insurance';
    case 'lease':
    case 'financing': return 'Lease';
    case 'maintenance': return 'Maintenance';
    case 'software': return 'Software';
    case 'equipment': return 'Equipment';
    case 'parking': return 'Parking';
    case 'other': return 'Other';
    default: return String(input || '').trim() || 'Other';
  }
}

export interface FixedExpenseOccurrence {
  configId: string;
  vehicleId: string;
  /** Due date, YYYY-MM-DD. */
  occurrenceYmd: string;
  amount: number;
  /** Canonical category. */
  category: string;
  currency: string;
  name: string;
  vendor?: string;
  /** Content version tag so edits produce fresh idempotency keys. */
  versionTag: string;
  /** Stable idempotency key for the canonical ledger. */
  idempotencyKey: string;
}

/** Defensive cap so a misconfigured daily rule over a huge window can't explode. */
const MAX_OCCURRENCES = 3660;

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseYmd(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function daysInUtcMonth(year: number, monthZeroBased: number): number {
  return new Date(Date.UTC(year, monthZeroBased + 1, 0)).getUTCDate();
}

/** Add calendar months while preserving the original anchor day and clamping month-end. */
function addAnchoredMonths(start: Date, months: number): Date {
  const targetMonth = start.getUTCMonth() + months;
  const targetYear = start.getUTCFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const day = Math.min(start.getUTCDate(), daysInUtcMonth(targetYear, normalizedMonth));
  return new Date(Date.UTC(targetYear, normalizedMonth, day));
}

/**
 * Short deterministic content tag. Changes whenever the money-relevant config
 * changes (amount/frequency/start/end), so re-posting after an edit yields new
 * idempotency keys and the old occurrences can be cleanly voided by source.
 */
export function computeFixedExpenseVersionTag(config: FixedExpenseLike): string {
  const basis = [
    Number(config.amount) || 0,
    canonicalFrequency(config.frequency),
    String(config.startDate || ''),
    String(config.endDate || ''),
    (config.currency || 'JMD').toUpperCase(),
  ].join('|');
  let hash = 0;
  for (let i = 0; i < basis.length; i++) {
    hash = (hash * 31 + basis.charCodeAt(i)) >>> 0;
  }
  return `v${hash.toString(36)}`;
}

function stepDate(start: Date, n: number, freq: CanonicalFrequency): Date {
  switch (freq) {
    case 'daily':
      return new Date(start.getTime() + n * 86_400_000);
    case 'weekly':
      return new Date(start.getTime() + n * 7 * 86_400_000);
    case 'monthly':
      return addAnchoredMonths(start, n);
    case 'quarterly':
      return addAnchoredMonths(start, n * 3);
    case 'annually':
      return addAnchoredMonths(start, n * 12);
    case 'one_time':
      return start;
    default:
      return addAnchoredMonths(start, n);
  }
}

/**
 * Expand a config into occurrences whose due date falls within
 * [windowStartYmd, windowEndYmd] (inclusive). Respects the config's own
 * start/end dates and isActive flag.
 */
export function buildFixedExpenseOccurrences(
  config: FixedExpenseLike,
  windowStartYmd: string,
  windowEndYmd: string,
): FixedExpenseOccurrence[] {
  if (config.isActive === false) return [];
  const amount = Number(config.amount);
  if (!Number.isFinite(amount) || amount <= 0) return [];
  if (!config.startDate || !/^\d{4}-\d{2}-\d{2}$/.test(config.startDate)) return [];

  const start = parseYmd(config.startDate);
  const configEnd = config.endDate && /^\d{4}-\d{2}-\d{2}$/.test(config.endDate)
    ? parseYmd(config.endDate)
    : null;
  const winStart = parseYmd(windowStartYmd);
  const winEnd = parseYmd(windowEndYmd);
  if (winEnd < winStart) return [];

  const freq = canonicalFrequency(config.frequency);
  const versionTag = computeFixedExpenseVersionTag(config);
  const configId = config.id || `${config.vehicleId}:${config.name}`;
  const currency = (config.currency || 'JMD').toUpperCase();
  const category = canonicalCategory(config.category);

  const out: FixedExpenseOccurrence[] = [];

  if (freq === 'one_time') {
    if (start >= winStart && start <= winEnd && (!configEnd || start <= configEnd)) {
      out.push(makeOccurrence(config, configId, ymd(start), amount, category, currency, versionTag));
    }
    return out;
  }

  for (let n = 0; n < MAX_OCCURRENCES; n++) {
    const occ = stepDate(start, n, freq);
    if (occ > winEnd) break;
    if (configEnd && occ > configEnd) break;
    if (occ >= winStart) {
      out.push(makeOccurrence(config, configId, ymd(occ), amount, category, currency, versionTag));
    }
  }
  return out;
}

function makeOccurrence(
  config: FixedExpenseLike,
  configId: string,
  occurrenceYmd: string,
  amount: number,
  category: string,
  currency: string,
  versionTag: string,
): FixedExpenseOccurrence {
  return {
    configId,
    vehicleId: config.vehicleId,
    occurrenceYmd,
    amount,
    category,
    currency,
    name: config.name,
    vendor: config.vendor,
    versionTag,
    idempotencyKey: `fixed_expense:${configId}|${occurrenceYmd}|${versionTag}`,
  };
}
