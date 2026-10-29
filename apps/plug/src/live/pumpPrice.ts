export type PumpQuote = {
  price: number | null;
  confidence?: string;
  reports?: number;
  outdated?: boolean;
  observedAt?: string | null;
  fleetCount?: number;
  plugCount?: number;
};

type PriceCard = {
  price?: unknown;
  price_per_litre?: unknown;
  confidence?: unknown;
  reports?: unknown;
  report_count?: unknown;
  outdated?: unknown;
  observed_at?: unknown;
  fleet_count?: unknown;
  plug_count?: unknown;
};

const GRADE_ORDER = ['e10_87', 'e10_90', 'diesel', 'ulsd'] as const;

/** Reads a published pump price, whether it is a number or the engine card. */
export function readPumpQuote(prices: Record<string, unknown> | undefined, grade: string): PumpQuote {
  const raw = prices?.[grade];
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const extra = prices?.[`${grade}_card`];
    if (extra && typeof extra === 'object') {
      return { price: raw, ...cardMeta(extra as PriceCard) };
    }
    return { price: raw };
  }
  if (raw && typeof raw === 'object') {
    const card = raw as PriceCard;
    const price = Number(card.price ?? card.price_per_litre);
    return {
      price: Number.isFinite(price) ? price : null,
      ...cardMeta(card),
    };
  }
  return { price: null };
}

function cardMeta(card: PriceCard): Omit<PumpQuote, 'price'> {
  const reports = Number(card.reports ?? card.report_count);
  return {
    confidence: typeof card.confidence === 'string' ? card.confidence : undefined,
    reports: Number.isFinite(reports) ? reports : undefined,
    outdated: Boolean(card.outdated),
    observedAt: typeof card.observed_at === 'string' ? card.observed_at : null,
    fleetCount: Number.isFinite(Number(card.fleet_count)) ? Number(card.fleet_count) : undefined,
    plugCount: Number.isFinite(Number(card.plug_count)) ? Number(card.plug_count) : undefined,
  };
}

export function pumpCaption(quote: PumpQuote): string {
  if (quote.price == null) return '';
  const bits = [];
  if (quote.confidence) bits.push(quote.confidence);
  if (quote.reports) bits.push(quote.reports === 1 ? '1 report' : `${quote.reports} reports`);
  if (quote.outdated) bits.push('May be outdated');
  return bits.join(' · ');
}

export function gradeLabel(grade: string): string {
  switch (grade) {
    case 'e10_87':
      return 'E-10 87';
    case 'e10_90':
      return 'E-10 90';
    case 'diesel':
      return 'Diesel';
    case 'ulsd':
      return 'ULSD';
    default:
      return grade;
  }
}

export function gradeBadgeClass(grade: string): string {
  switch (grade) {
    case 'e10_87':
      return 'bg-emerald-700 text-white';
    case 'e10_90':
      return 'bg-rose-700 text-white';
    case 'diesel':
    case 'ulsd':
      return 'bg-inverse-surface text-inverse-on-surface';
    default:
      return 'bg-surface-container-highest text-on-surface';
  }
}

/** Stitch confidence level for dots / pills. */
export type ConfidenceTone = 'high' | 'medium' | 'low' | 'outdated' | 'none';

export function confidenceTone(quote: PumpQuote): ConfidenceTone {
  if (quote.price == null) return 'none';
  if (quote.outdated) return 'outdated';
  const c = (quote.confidence || '').toLowerCase();
  if (c === 'high') return 'high';
  if (c === 'medium' || c === 'med') return 'medium';
  if (c === 'low') return 'low';
  if ((quote.reports || 0) >= 3) return 'high';
  if ((quote.fleetCount || 0) > 0 && (quote.plugCount || 0) === 0) return 'medium';
  if ((quote.reports || 0) === 1) return 'low';
  return 'medium';
}

export function confidenceDotClass(tone: ConfidenceTone): string {
  switch (tone) {
    case 'high':
      return 'bg-[#16a34a] shadow-[0_0_6px_rgba(22,163,74,0.6)]';
    case 'medium':
      return 'bg-[#d97706]';
    case 'low':
      return 'bg-[#57534e]';
    case 'outdated':
      return 'bg-outline';
    default:
      return 'bg-outline-variant';
  }
}

export function confidencePillClass(tone: ConfidenceTone): string {
  switch (tone) {
    case 'high':
      return 'bg-emerald-100 text-emerald-900';
    case 'medium':
      return 'bg-amber-100 text-amber-900';
    case 'outdated':
      return 'bg-surface-container-highest text-on-surface-variant';
    case 'low':
      return 'bg-surface-container text-on-surface';
    default:
      return 'bg-surface-container text-on-surface-variant';
  }
}

/** Stitch-style confidence line from live quote fields only. */
export function confidenceLabel(quote: PumpQuote): string {
  if (quote.price == null) return '';
  if (quote.outdated) return 'May be outdated';
  const tone = confidenceTone(quote);
  if (tone === 'high' && (quote.reports || 0) > 0) {
    return quote.reports === 1 ? 'Confirmed by 1 driver' : `Confirmed by ${quote.reports} drivers`;
  }
  if ((quote.fleetCount || 0) > 0 && (quote.plugCount || 0) === 0) return 'From a fleet driver';
  if ((quote.reports || 0) === 1) return '1 driver report';
  if ((quote.reports || 0) > 1) return `${quote.reports} driver reports`;
  if (quote.confidence) {
    const c = quote.confidence.toLowerCase();
    if (c === 'high') return 'High confidence';
    if (c === 'medium' || c === 'med') return 'Medium confidence';
    if (c === 'low') return 'Low confidence';
  }
  return 'Community price';
}

export function relativeAge(iso: string | null | undefined): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const h = Math.floor(ms / 3600000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 8) return `${d} days ago`;
  return 'last week';
}

export function moneyJmd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `J$${value.toFixed(2)}`;
}

/** Grades present on a station with a published price, Stitch order. */
export function pricedGrades(prices: Record<string, unknown> | undefined): string[] {
  const keys = new Set<string>();
  Object.keys(prices || {}).forEach((key) => {
    if (key.endsWith('_card')) return;
    const quote = readPumpQuote(prices, key);
    if (quote.price != null) keys.add(key);
  });
  const ordered = GRADE_ORDER.filter((g) => keys.has(g));
  const extra = [...keys].filter((g) => !GRADE_ORDER.includes(g as (typeof GRADE_ORDER)[number]));
  return [...ordered, ...extra];
}
