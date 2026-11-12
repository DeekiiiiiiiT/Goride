/**
 * Week Reconciliation (Round 4a) — plain-word formatting for the week list and desk.
 * Dates in words ("Week of 2 Nov 2026", "2–8 Nov 2026"), never "2026-11-02".
 */
import { RECON_SOURCES, RECON_STEP_ORDER } from '@roam/finance-core';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parts(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
  return { y, m: m - 1, d };
}

function addDays(ymd: string, days: number): string {
  const { y, m, d } = parts(ymd);
  return new Date(Date.UTC(y, m, d + days)).toISOString().slice(0, 10);
}

export function formatDay(ymd: string): string {
  const { y, m, d } = parts(ymd);
  return `${d} ${MONTHS[m]} ${y}`;
}

export function formatWeekTitle(weekKey: string): string {
  return `Week of ${formatDay(weekKey)}`;
}

/** "2–8 Nov 2026", "29 Sep – 5 Oct 2026", "29 Dec 2025 – 4 Jan 2026". */
export function formatWeekRange(weekKey: string): string {
  const a = parts(weekKey);
  const b = parts(addDays(weekKey, 6));
  if (a.y !== b.y) return `${formatDay(weekKey)} – ${formatDay(addDays(weekKey, 6))}`;
  if (a.m !== b.m) return `${a.d} ${MONTHS[a.m]} – ${b.d} ${MONTHS[b.m]} ${b.y}`;
  return `${a.d}–${b.d} ${MONTHS[a.m]} ${a.y}`;
}

/** "just now", "2 min ago", "3 h ago", "5 days ago". */
export function formatAgo(iso: string | null | undefined, nowMs = Date.now()): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const s = Math.max(0, Math.round((nowMs - t) / 1000));
  if (s < 45) return 'just now';
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

export const SOURCE_LABEL: Record<string, string> = Object.fromEntries(
  RECON_SOURCES.map((s) => [s.id, s.label === 'Roam-issued fuel card statement' ? 'Roam fuel card statement' : s.label]),
);

export type ChipTone = 'done' | 'needed' | 'optional' | 'waiting' | 'blocks';

/** Status chip words for one source (null = do not show, e.g. not applicable). */
export function sourceChip(source: { id: string; status: string; requirement?: string }): {
  text: string;
  tone: ChipTone;
} | null {
  const label = SOURCE_LABEL[source.id] ?? source.id;
  const optional = source.requirement === 'optional';
  switch (source.status) {
    case 'not_applicable':
      return null;
    case 'received':
      return { text: `${label} · Received`, tone: 'done' };
    case 'attested_none':
      return { text: `${label} · No activity`, tone: 'optional' };
    case 'waived':
      return { text: `${label} · Waived`, tone: 'optional' };
    case 'waiting_external':
      return { text: `${label} · Waiting on Roam`, tone: 'waiting' };
    case 'partial':
      return optional ? { text: `${label} · Optional`, tone: 'optional' } : { text: `${label} · Partial`, tone: 'needed' };
    case 'missing':
    default:
      return optional ? { text: `${label} · Optional`, tone: 'optional' } : { text: `${label} · Needed`, tone: 'needed' };
  }
}

/** "Step n of 8" for the week's next action (a missing file is always step 1). */
export function stepNumberFor(nextAction: { kind: string; targetId: string } | null | undefined): number {
  if (!nextAction || nextAction.kind === 'source' || nextAction.kind === 'wait') return 1;
  if (nextAction.kind === 'close') return RECON_STEP_ORDER.length;
  const i = (RECON_STEP_ORDER as readonly string[]).indexOf(nextAction.targetId);
  return i >= 0 ? i + 1 : 1;
}

/** Mon..Sun dots: a day has data when any source covered it or it was marked "no activity". */
export function dayDots(
  weekKey: string,
  sources: Array<{ coverage?: Record<string, string> }>,
): Array<{ day: string; label: string; hasData: boolean }> {
  const letters = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  return letters.map((label, i) => {
    const day = addDays(weekKey, i);
    const hasData = sources.some((s) => {
      const v = s.coverage?.[day];
      return v === 'covered' || v === 'zero_attested';
    });
    return { day, label, hasData };
  });
}
