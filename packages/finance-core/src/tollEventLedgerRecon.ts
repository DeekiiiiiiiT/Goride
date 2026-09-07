/**
 * Engine vs operational ledger — toll_usage events must resolve to live toll rows.
 * Pass 5 closed statement↔engine; this is the missing rung (toll inflation audit).
 */
import { round2 } from './money.ts';

const EPS = 0.01;

export type TollUsageEventLike = {
  source_id?: string | null;
  amount_minor?: number | null;
  /** When true / set, event is a reversal or already reversed — exclude. */
  reverses_event_id?: string | null;
  reversed_at?: string | null;
};

export type TollLedgerSpendLike = {
  id: string;
  amountMajor: number;
  voided?: boolean;
};

export type TollEventLedgerRecon = {
  orphanCount: number;
  orphanAmountMajor: number;
  orphanSourceIds: string[];
  eventSpendMajor: number;
  ledgerSpendMajor: number;
  /** |eventSpend − ledgerSpend| when orphans are zero; otherwise orphan amount. */
  deltaMajor: number;
};

function minorToMajor(minor: number): number {
  return round2((Number(minor) || 0) / 100);
}

export function filterActiveTollUsageEvents<T extends TollUsageEventLike>(events: T[]): T[] {
  const reversedIds = new Set<string>();
  for (const ev of events) {
    if ((ev as { id?: string }).id && ev.reverses_event_id) {
      reversedIds.add(String(ev.reverses_event_id));
    }
  }
  return events.filter((ev) => {
    const id = (ev as { id?: string }).id;
    if (!id) return false;
    if (ev.reverses_event_id || ev.reversed_at) return false;
    if (reversedIds.has(String(id))) return false;
    return true;
  });
}

/**
 * Compare active toll_usage events to live (non-voided) ledger spend rows.
 * `liveById` should only include rows that still exist and are not voided.
 */
export function reconcileTollUsageEventsVsLedger(
  events: TollUsageEventLike[],
  liveById: Map<string, TollLedgerSpendLike> | Record<string, TollLedgerSpendLike>,
): TollEventLedgerRecon {
  const live =
    liveById instanceof Map
      ? liveById
      : new Map(Object.entries(liveById).map(([k, v]) => [k, v]));

  const active = filterActiveTollUsageEvents(events);
  let eventSpendMajor = 0;
  let orphanCount = 0;
  let orphanAmountMajor = 0;
  const orphanSourceIds: string[] = [];

  for (const ev of active) {
    const amt = Math.abs(minorToMajor(Number(ev.amount_minor) || 0));
    eventSpendMajor = round2(eventSpendMajor + amt);
    const sid = String(ev.source_id || '');
    if (!sid || !live.has(sid)) {
      orphanCount += 1;
      orphanAmountMajor = round2(orphanAmountMajor + amt);
      if (sid) orphanSourceIds.push(sid);
    }
  }

  let ledgerSpendMajor = 0;
  for (const row of live.values()) {
    if (row.voided) continue;
    ledgerSpendMajor = round2(ledgerSpendMajor + Math.abs(Number(row.amountMajor) || 0));
  }

  const deltaMajor =
    orphanCount > 0
      ? orphanAmountMajor
      : round2(Math.abs(eventSpendMajor - ledgerSpendMajor));

  return {
    orphanCount,
    orphanAmountMajor,
    orphanSourceIds: [...new Set(orphanSourceIds)],
    eventSpendMajor,
    ledgerSpendMajor,
    deltaMajor,
  };
}

export function tollEventLedgerHasDrift(recon: TollEventLedgerRecon, eps = EPS): boolean {
  if (recon.orphanCount > 0) return true;
  return Math.abs(recon.eventSpendMajor - recon.ledgerSpendMajor) > eps;
}
