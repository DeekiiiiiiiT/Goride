export type PlacesReviewItem = {
  id: string;
  place_id: string;
  kind: string;
  suggestion: string | null;
  distinct_users: number;
  best_accuracy_m: number | null;
  payload: {
    name?: string;
    kind?: string;
    pcode?: string;
    lat?: number;
    lng?: number;
    phone?: string | null;
    hours?: string | null;
    services?: string[];
    brand?: string | null;
    accuracyM?: number;
    photoUrl?: string | null;
  };
  created_at: string;
};

/** @deprecated Prefer PlacesReviewItem — kept as Item for call-site brevity */
export type Item = PlacesReviewItem;

export type Coverage = { pcode: string; kind: string; verified_count: number; pending_count: number };
export type PlugChip = { chip: string; mapLabel: string; sort: number };
export type PlacesReviewView = 'queue' | 'item' | 'coverage' | 'parishes';

export function strong(item: PlacesReviewItem): boolean {
  if (/strong/i.test(item.suggestion || '')) return true;
  return item.distinct_users >= 3 && item.best_accuracy_m != null && item.best_accuracy_m <= 25;
}

export function pill(item: PlacesReviewItem): { label: string; color: string } {
  const text = item.suggestion || 'Pending verification';
  if (/duplicate|merge/i.test(text)) return { label: text, color: '#ea580c' };
  if (strong(item)) return { label: text, color: '#16a34a' };
  if (/weak|check/i.test(text)) return { label: text, color: '#d97706' };
  return { label: text, color: '#57534e' };
}

export function ageDays(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

export function kindLabel(item: PlacesReviewItem, chips: PlugChip[]): string {
  const chip = item.payload?.kind || item.kind;
  return chips.find((row) => row.chip === chip)?.mapLabel || chip || 'Place';
}

export function gradeFromItem(item: PlacesReviewItem): 'strong' | 'duplicate' | 'weak' | 'pending' {
  const text = item.suggestion || '';
  if (/duplicate|merge/i.test(text)) return 'duplicate';
  if (strong(item)) return 'strong';
  if (/weak|check/i.test(text)) return 'weak';
  return 'pending';
}

export function queuedAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) {
    const rem = mins % 60;
    return rem === 0 ? `${hours}h ago` : `${hours}h ${String(rem).padStart(2, '0')}m ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function accuracyBadgeClass(meters: number | null | undefined): string {
  if (meters == null) return 'font-code-sm text-code-sm font-semibold text-on-surface bg-surface-container px-1 rounded';
  if (meters <= 10) {
    return 'font-code-sm text-code-sm font-semibold text-[#16a34a] bg-[#f0fdf4] px-1 rounded border border-[#bbf7d0]';
  }
  if (meters > 25) {
    return 'font-code-sm text-code-sm font-semibold text-[#dc2626] bg-[#fef2f2] px-1 rounded border border-[#fecaca]';
  }
  return 'font-code-sm text-code-sm font-semibold text-on-surface bg-surface-container px-1 rounded';
}

export function osmEmbedSrc(lat: number, lng: number, delta = 0.02): string {
  const west = lng - delta;
  const south = lat - delta;
  const east = lng + delta;
  const north = lat + delta;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${west}%2C${south}%2C${east}%2C${north}&layer=mapnik&marker=${lat}%2C${lng}`;
}
