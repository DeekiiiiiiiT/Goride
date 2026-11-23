/**
 * Week Reconciliation step 5 → "Finalize fuel" (fuel audit Part J screens 10, 11). Pure:
 * the lock check's blockers as plain sentences with the part that fixes each one, and the
 * saved "statement could not be written" error (F-05) as names.
 */
import { dayLabel, km, shortDay, type FuelWeekChecksResponse } from './fuelChecksModel';

export type FinalizePartId = 'checks' | 'disputes' | 'policy' | 'distance';

export const PART_TITLE: Record<FinalizePartId, string> = {
  checks: 'Fuel checks',
  disputes: 'Disputes and adjustments',
  policy: 'Fuel policy',
  distance: 'Distance and who pays',
};

export type StillOpenRow = {
  key: string;
  /** red = must be fixed; amber = needs a review. */
  tone: 'red' | 'amber';
  title: string;
  plate?: string;
  detail?: string;
  /** The part to jump to; none when the fix is elsewhere (another week, a refresh). */
  part: FinalizePartId | null;
};

export type GateBlocker = { code: string; message: string };

const ymdRe = /(\d{4}-\d{2}-\d{2})/g;

function datesIn(message: string): string[] {
  return message.match(ymdRe) || [];
}

const LOAD_PROBLEM_CODES = new Set([
  'disposition_load_failed',
  'counts_unevaluated',
  'degraded_inputs',
  'missing_category_costs',
  'unresolved_coverage_rule',
  'stop_to_stop_trips_truncated',
]);

const STOP_TO_STOP_CODES = new Set([
  'stop_to_stop_volume',
  'stop_to_stop_distance',
  'stop_to_stop_attribution',
  'stop_to_stop_chain',
]);

/**
 * One row per thing to fix. Waiting card fills are one row; each possible missed fill and each
 * unapproved gap charge is its own row with its car and dates.
 */
export function stillOpenRows(
  blockers: GateBlocker[],
  ctx: { checks: FuelWeekChecksResponse | null; plateOf: (vehicleId: string) => string },
): StillOpenRow[] {
  const rows: StillOpenRow[] = [];
  const seen = new Set<string>();
  const push = (row: StillOpenRow) => {
    if (seen.has(row.key)) return;
    seen.add(row.key);
    rows.push(row);
  };

  const awaitingCount = blockers.filter((b) => b.code === 'awaiting_card_statement').length;
  if (awaitingCount > 0) {
    const fills = ctx.checks?.awaiting || [];
    const plates = [...new Set(fills.map((f) => ctx.plateOf(f.vehicleId)))];
    const n = fills.length || awaitingCount;
    push({
      key: 'awaiting',
      tone: 'red',
      title: n === 1 ? '1 gas-card fill waiting for the card statement' : `${n} gas-card fills waiting for the card statement`,
      plate: plates.length === 1 ? plates[0] : undefined,
      detail: fills.length ? fills.map((f) => dayLabel(f.dateYmd)).join(', ') : undefined,
      part: 'checks',
    });
  }

  const openPossible = (ctx.checks?.possibleFills || []).filter((p) => !p.closed);
  let possibleIdx = 0;
  for (const b of blockers) {
    const c = b.code;
    if (c === 'awaiting_card_statement') continue;
    if (c === 'possible_fill_not_scanned') {
      const [from, to] = datesIn(b.message);
      const hit =
        openPossible.find((p) => p.startDate === from && p.endDate === to) || openPossible[possibleIdx];
      possibleIdx += 1;
      push({
        key: `possible:${from || possibleIdx}:${to || ''}`,
        tone: 'red',
        title: 'Possible fill not scanned',
        plate: hit ? ctx.plateOf(hit.vehicleId) : undefined,
        detail: hit
          ? `${dayLabel(hit.startDate)} → ${dayLabel(hit.endDate)} · ${km(hit.stretchKm)} with no fill`
          : from && to
            ? `${dayLabel(from)} → ${dayLabel(to)}`
            : undefined,
        part: 'checks',
      });
      continue;
    }
    if (c === 'gap_charge_recommended') {
      const m = b.message.match(/Gap charge for (.+?) \(/);
      const [from, to] = datesIn(b.message);
      push({
        key: `gap:${from}:${to}:${m?.[1] || ''}`,
        tone: 'red',
        title: 'Gap charge not approved yet',
        plate: m?.[1],
        detail: from && to ? `${shortDay(from)} → ${shortDay(to)}` : undefined,
        part: 'distance',
      });
      continue;
    }
    if (STOP_TO_STOP_CODES.has(c)) {
      push({ key: 'stop_to_stop', tone: 'red', title: "A fill window's km don't add up", part: 'distance' });
      continue;
    }
    if (LOAD_PROBLEM_CODES.has(c)) {
      push({
        key: 'load',
        tone: 'red',
        title: "We couldn't load everything needed to lock this week. Refresh fuel and try again.",
        part: null,
      });
      continue;
    }
    switch (c) {
      case 'undisposed_flags':
      case 'exception_fills':
        push({ key: 'flagged_fill', tone: 'red', title: 'A flagged fill still needs a decision', part: 'checks' });
        break;
      case 'unapproved_fuel_tx':
        push({ key: c, tone: 'red', title: 'A fuel payment still needs approval in the review queue', part: 'checks' });
        break;
      case 'data_quality_unreviewed':
        push({ key: c, tone: 'amber', title: 'A flagged car still needs Mark reviewed', part: 'checks' });
        break;
      case 'odometer_chain_unusable':
        push({ key: c, tone: 'amber', title: 'Odometer readings not reviewed yet', part: 'checks' });
        break;
      case 'open_disputes':
        push({ key: c, tone: 'red', title: 'A driver dispute is still open', part: 'disputes' });
        break;
      case 'under_explained_unreviewed':
        push({ key: c, tone: 'amber', title: 'Distance and who pays not reviewed yet', part: 'distance' });
        break;
      case 'over_explained':
        push({ key: c, tone: 'red', title: 'The kinds of driving cost more than the fuel bought', part: 'distance' });
        break;
      case 'unattributed_unreviewed':
        push({ key: c, tone: 'amber', title: 'Fills with no odometer not reviewed yet', part: 'distance' });
        break;
      case 'implausible_fills_unreviewed':
        push({ key: c, tone: 'red', title: 'A fill has an unusual price or a repeated odometer', detail: 'Accept it below.', part: null });
        break;
      default:
        // prior_weeks_open, nightly_check_failed, card_statement_drift, null_org_fill: the
        // gate's own sentence already says what and where.
        push({ key: `${c}:${b.message}`, tone: 'red', title: b.message, part: null });
    }
  }
  return rows;
}

// ---------------------------------------------------------------- screen 11

export type SealRefusal = { phase: 'statement' | 'lines'; driverIds: string[] };

/** `fuel_statement_failed:id1,id2` / `fuel_lines_failed` (saved on the week by F-05). */
export function parseSealRefusal(fuelSealError: string | null | undefined): SealRefusal | null {
  const s = String(fuelSealError || '').trim();
  const m = s.match(/^fuel_(statement|lines)_failed(?::(.*))?$/);
  if (!m) return null;
  const ids = (m[2] || '').split(',').map((x) => x.trim()).filter(Boolean);
  return { phase: m[1] === 'lines' ? 'lines' : 'statement', driverIds: ids };
}

function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}

export function sealRefusalTitle(refusal: SealRefusal, firstNames: string[]): string {
  if (refusal.phase === 'lines') return "Not locked — this week's fuel lines could not be written";
  if (firstNames.length === 1) return `Not locked — ${possessive(firstNames[0])} fuel statement could not be written`;
  if (firstNames.length > 1) return `Not locked — ${firstNames.length} drivers' fuel statements could not be written`;
  return 'Not locked — a fuel statement could not be written';
}

export function stillOpenText(n: number): string {
  return n === 1 ? '1 thing still open' : `${n} things still open`;
}
