/**
 * UI1 — the six-part Tolls step (audit C3). Pure helpers: every figure comes from the server's week desk
 * (`parts`, `disputes`, `results`, `sumLine`, `earlierResults`, `blockers[].part`); nothing is worked out here
 * except labels and grouping.
 */
import type {
  TollV2Blocker,
  TollV2Charge,
  TollV2Desk,
  TollV2DisputeResult,
  TollV2DisputeRow,
  TollV2PartNo,
  TollV2PartPill,
  TollV2Payback,
  TollV2RefundCandidate,
  TollV2Suggestion,
  TollV2SumLine,
} from './types';
import { chargeWhen, fmtTollMinor, formatTimeJm } from './tollV2Format';

export const PART_NOS: TollV2PartNo[] = [1, 2, 3, 4, 5, 6];

export const PART_META: Record<TollV2PartNo, { pill: string; title: string; subtitle: string }> = {
  1: {
    pill: 'Matches',
    title: 'Matches',
    subtitle: 'Tolls that happened during a trip. Roam lined them up for you.',
  },
  2: {
    pill: 'Pick a trip',
    title: 'Pick the right trip',
    subtitle: 'Two trips fit this toll. Choose the one it belongs to.',
  },
  3: {
    pill: 'Disputes',
    title: 'Disputes with Uber',
    subtitle: 'Uber paid less than the toll. The driver asks Uber for the rest from the driver app.',
  },
  4: {
    pill: 'No trip',
    title: 'Tolls with no trip',
    subtitle: 'No trip at this time. Who pays?',
  },
  5: {
    pill: 'Other checks',
    title: 'Other checks',
    subtitle: "Things to check that aren't about which trip a toll belongs to.",
  },
  6: {
    pill: 'Seal',
    title: 'Seal tolls',
    subtitle: "Lock this week's tolls so the tag account and pay can be worked out.",
  },
};

const PILL_NOUN: Record<number, string> = {
  1: 'to confirm',
  2: 'to pick',
  3: 'to send',
  4: 'to decide',
  5: 'to check',
};

/** The small status text on a pill and on the part card's chip. */
export function pillStatusLabel(pill: TollV2PartPill | undefined, disputes?: TollV2Desk['disputes']): string {
  if (!pill) return 'Nothing to do';
  if (pill.part === 6) {
    if (pill.status === 'sealed') return 'Sealed';
    if (pill.status === 'ready') return 'Ready';
    return 'Not ready';
  }
  if (pill.status === 'todo') return `${pill.count} ${PILL_NOUN[pill.part] ?? 'to do'}`;
  if (pill.part === 3 && pill.status === 'waiting') {
    const n = disputes?.tiles.sent.count ?? 0;
    return `${n} waiting on Uber`;
  }
  return 'Nothing to do';
}

export function pillFor(desk: Pick<TollV2Desk, 'parts'>, part: TollV2PartNo): TollV2PartPill | undefined {
  return desk.parts?.find((p) => p.part === part);
}

/** The part to open on: the first one with work, else Seal. A sealed week opens on Seal. */
export function firstPartWithWork(desk: Pick<TollV2Desk, 'parts' | 'sealed'>): TollV2PartNo {
  if (desk.sealed) return 6;
  const todo = (desk.parts ?? []).find((p) => p.part !== 6 && p.status === 'todo');
  return (todo?.part as TollV2PartNo | undefined) ?? 6;
}

export function chargesInPart(charges: TollV2Charge[], part: TollV2PartNo): TollV2Charge[] {
  return charges.filter((c) => c.part === part);
}

export function topSuggestion(charge: TollV2Charge): TollV2Suggestion | undefined {
  return charge.suggestions?.find((x) => x.top !== false) ?? charge.suggestions?.[0];
}

export function isRiderPaysDriver(s: TollV2Suggestion | undefined): boolean {
  return s?.kind === 'rider_pays_driver';
}

/** Part 1 has two kinds of row: Uber paid it back (payback) and InDrive rider-pays-driver (no payback, no score). */
export function splitMatches(charges: TollV2Charge[]): { payback: TollV2Charge[]; rider: TollV2Charge[] } {
  const payback: TollV2Charge[] = [];
  const rider: TollV2Charge[] = [];
  for (const c of chargesInPart(charges, 1)) {
    if (isRiderPaysDriver(topSuggestion(c))) rider.push(c);
    else payback.push(c);
  }
  return { payback, rider };
}

/** Paybacks whose blocker sits in part 3 have a dispute refund waiting: they are linked with Refund received. */
export function part5Paybacks(paybacks: TollV2Payback[], blockers: TollV2Blocker[]): TollV2Payback[] {
  const inPart3 = new Set(blockers.filter((b) => b.kind === 'payback' && b.part === 3).map((b) => b.id));
  return paybacks.filter((p) => !inPart3.has(p.id));
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export type StillOpenLine = { part: TollV2PartNo; text: string; goLabel: string };

/** "Still open" on part 6: one line per part with work, from the server's `part` on each blocker (AE4). */
export function stillOpenLines(blockers: TollV2Blocker[]): StillOpenLine[] {
  const byPart = new Map<number, TollV2Blocker[]>();
  for (const b of blockers) {
    const p = b.part ?? 5;
    byPart.set(p, [...(byPart.get(p) ?? []), b]);
  }
  const out: StillOpenLine[] = [];
  for (const part of PART_NOS) {
    const rows = byPart.get(part);
    if (!rows?.length) continue;
    let text: string;
    if (part === 1) text = plural(rows.length, 'match', 'matches') + ' to confirm';
    else if (part === 2) text = plural(rows.length, 'toll') + ' to pick a trip for';
    else if (part === 3) text = plural(rows.length, 'Uber refund') + ' to link to a dispute';
    else if (part === 4) text = plural(rows.length, 'toll') + ' with no trip';
    else {
      const bits: string[] = [];
      const receipts = rows.filter((b) => b.kind === 'charge' && b.reason === 'unverified').length;
      const partPaid = rows.filter((b) => b.kind === 'charge' && b.reason === 'short_paid').length;
      const pairs = rows.filter((b) => b.kind === 'review_pair').length;
      const paybacks = rows.filter((b) => b.kind === 'payback' || b.kind === 'carried').length;
      if (receipts) bits.push(plural(receipts, 'cash receipt') + ' to check');
      if (pairs) bits.push(plural(pairs, 'possible duplicate'));
      if (partPaid) bits.push(plural(partPaid, 'part-paid toll'));
      if (paybacks) bits.push(plural(paybacks, 'Uber payback') + ' with no toll');
      if (!bits.length) bits.push(plural(rows.length, 'item') + ' to check');
      text = bits.join(' · ');
    }
    out.push({ part, text: `Part ${part}: ${text}`, goLabel: `Go to ${PART_META[part].title}` });
  }
  return out;
}

/** AE5: "Spend J$5,410.00 = Paid back J$5,170.00 + Driver pays J$0.00 + Fleet pays J$0.00 + Waiting on Uber J$240.00".
 *  "Still open" is added only while something is undecided, so the line always adds up. */
export function sumLineText(s: TollV2SumLine): string {
  const parts = [
    `Paid back ${fmtTollMinor(s.paidBackMinor)}`,
    `Driver pays ${fmtTollMinor(s.driverMinor)}`,
    `Fleet pays ${fmtTollMinor(s.fleetMinor)}`,
    `Waiting on Uber ${fmtTollMinor(s.waitingOnUberMinor)}`,
  ];
  if (s.stillOpenMinor !== 0) parts.push(`Still open ${fmtTollMinor(s.stillOpenMinor)}`);
  return `Spend ${fmtTollMinor(s.spendMinor)} = ${parts.join(' + ')}`;
}

/** The line under the sum line: earlier weeks' disputes whose money landed this week. Null when there is none. */
export function earlierResultsText(e: TollV2Desk['earlierResults']): string | null {
  if (!e || (e.refundedMinor === 0 && e.toDriverMinor === 0 && e.toFleetMinor === 0)) return null;
  return `Earlier weeks' disputes settled this week: Uber refunded ${fmtTollMinor(e.refundedMinor)} · driver pays ${fmtTollMinor(
    e.toDriverMinor,
  )} · fleet pays ${fmtTollMinor(e.toFleetMinor)}`;
}

/** AE3: the one sentence in the blue box on Disputes. */
export function waitingSentence(waitingMinor: number): string {
  return `${fmtTollMinor(waitingMinor)} is waiting on Uber. It doesn't stop you sealing this week. Refunds usually arrive in the next pay period or the one after.`;
}

/** "9 Nov, 7:15 AM · Portmore" */
export function disputeTitle(d: Pick<TollV2DisputeRow, 'occurredAt' | 'plazaName'>): string {
  return `${chargeWhen(d.occurredAt)} · ${d.plazaName || 'Toll'}`;
}

/** "Toll J$390.00 · Uber paid J$370.00" (the amount to dispute is its own chip). */
export function disputeMoneyLine(d: Pick<TollV2DisputeRow, 'tollMinor' | 'paidMinor'>): string {
  return `Toll ${fmtTollMinor(d.tollMinor)} · Uber paid ${fmtTollMinor(d.paidMinor)}`;
}

export function disputeOwedChip(d: Pick<TollV2DisputeRow, 'leftMinor' | 'state'>): string {
  return d.state === 'sent' ? `${fmtTollMinor(d.leftMinor)} disputed` : `${fmtTollMinor(d.leftMinor)} to dispute`;
}

export function disputeTripPill(d: Pick<TollV2DisputeRow, 'trip' | 'platform'>): string | null {
  const t = d.trip;
  if (!t) return null;
  const start = t.pickupAt || t.requestAt;
  const end = t.dropoffAt;
  const name = d.platform === 'indrive' ? 'InDrive' : 'Uber';
  if (!start && !end) return `${name} trip`;
  return `${name} trip ${formatTimeJm(start)}–${formatTimeJm(end)}`;
}

/** "6 of 9 days left" — to_send only. */
export function daysLeftText(d: Pick<TollV2DisputeRow, 'daysLeft' | 'windowDays' | 'state'>): string | null {
  if (d.state !== 'to_send' || d.daysLeft == null) return null;
  if (d.windowDays) return `${d.daysLeft} of ${d.windowDays} days left`;
  return `${d.daysLeft} day${d.daysLeft === 1 ? '' : 's'} left`;
}

export type DisputeChip = { text: string; tone: 'amber' | 'blue' | 'red' | 'green' | 'grey' };

/** The state chip of an active dispute row. */
export function disputeStateChip(d: TollV2DisputeRow): DisputeChip {
  if (d.windowClosed) return { text: 'Window closed — expires tonight', tone: 'red' };
  if (d.state === 'to_send') return { text: 'Not sent yet', tone: d.red ? 'red' : 'amber' };
  if (d.state === 'sent') {
    // AE2: a sent dispute one refund period in with nothing back is Late (a warning, not a loss).
    if (d.late) return { text: 'No refund yet after 1 pay period', tone: 'red' };
    return { text: 'Sent, waiting on Uber', tone: 'blue' };
  }
  return { text: d.state, tone: 'grey' };
}

function bearerWord(b: string | null | undefined): string {
  return b === 'driver' ? 'driver pays' : b === 'fleet' ? 'fleet pays' : 'decided';
}

/** "Results this week" chip: Won · Uber paid J$20.00 / Part won · J$10.00 back, fleet pays J$10.00 / Lost · driver pays. */
export function resultChip(r: TollV2DisputeResult): DisputeChip {
  const back = r.recoveredMinor ?? 0;
  if (r.outcome === 'won') return { text: `Won · Uber paid ${fmtTollMinor(back)}`, tone: 'green' };
  if (r.outcome === 'part_won') {
    return {
      text: `Part won · Uber paid ${fmtTollMinor(back)}, ${bearerWord(r.bearer)} ${fmtTollMinor(r.borneMinor)}`,
      tone: 'amber',
    };
  }
  if (r.outcome === 'lost') return { text: `Lost · ${bearerWord(r.bearer)} ${fmtTollMinor(r.borneMinor)}`, tone: 'red' };
  if (r.outcome === 'expired') {
    return { text: `Expired · ${bearerWord(r.bearer)} ${fmtTollMinor(r.borneMinor)}`, tone: 'red' };
  }
  return { text: r.outcome, tone: 'grey' };
}

/** "From week of 2 Nov" for an active dispute whose charge sits in another week (AD2). */
export function fromWeekChip(weekKey: string | null | undefined): string | null {
  if (!weekKey) return null;
  const d = new Date(`${weekKey}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const label = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d);
  return `From week of ${label}`;
}

export function refundKindLabel(kind: string): string {
  if (kind === 'adjustment') return 'Uber adjustment';
  if (kind === 'trip_line') return 'Uber trip payback';
  return 'Uber payback';
}

/** The body for Refund received (settle_dispute): the dispute, the payback, and both versions. */
export function settleDisputeBody(d: Pick<TollV2DisputeRow, 'id' | 'version'>, c: Pick<TollV2RefundCandidate, 'paybackId' | 'version'>) {
  return {
    dispute_id: d.id,
    expected_dispute_version: d.version,
    payback_id: c.paybackId,
    expected_payback_version: c.version,
  };
}

/** True when the desk carries the UI1 keys (S3 server). */
export function deskHasParts(desk: Pick<TollV2Desk, 'parts'> | null | undefined): boolean {
  return Array.isArray(desk?.parts) && desk!.parts!.length === 6;
}
