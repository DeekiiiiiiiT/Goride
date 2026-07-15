/**
 * Fleet Financials — Uber bank expected vs ops received confirm.
 * Ops records must NEVER feed Cash Returned / Settlement / Still Held math.
 */

import { payoutBankEventWeekKey, type PayoutBankEventLike } from './ledgerBankSettled';

export type FleetBankConfirmStatus = 'unconfirmed' | 'confirmed';

export type FleetBankConfirmRecord = {
  driverId: string;
  weekStartYmd: string;
  status: FleetBankConfirmStatus;
  amountReceived: number;
  expectedAmount?: number;
  confirmedAt?: string;
  confirmedBy?: string;
};

export type FleetBankReceiveRow = {
  driverId: string;
  driverName: string;
  weekStartYmd: string;
  expected: number;
  amountReceived: number | null;
  variance: number | null;
  status: FleetBankConfirmStatus;
  confirmedAt?: string;
  confirmedBy?: string;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Aggregate ledger payout_bank into driver + Settlement week expected amounts. */
export function aggregateExpectedBankByDriverWeek(
  events: PayoutBankEventLike[] | undefined,
  driverNameById: Record<string, string>,
  timezone?: string,
): Omit<FleetBankReceiveRow, 'amountReceived' | 'variance' | 'status' | 'confirmedAt' | 'confirmedBy'>[] {
  const map = new Map<string, { driverId: string; weekStartYmd: string; expected: number }>();
  for (const raw of events || []) {
    if (!raw || typeof raw !== 'object') continue;
    if (String(raw.eventType || '') !== 'payout_bank') continue;
    const driverId = String(raw.driverId || '').trim();
    if (!driverId) continue;
    const weekStartYmd = payoutBankEventWeekKey(raw, timezone);
    if (!weekStartYmd) continue;
    const key = `${driverId}|${weekStartYmd}`;
    const prev = map.get(key);
    const add = Math.abs(Number(raw.netAmount) || 0);
    if (prev) {
      prev.expected = round2(prev.expected + add);
    } else {
      map.set(key, { driverId, weekStartYmd, expected: round2(add) });
    }
  }
  return [...map.values()]
    .map((r) => ({
      ...r,
      driverName: driverNameById[r.driverId] || r.driverId,
    }))
    .sort((a, b) => {
      if (a.weekStartYmd !== b.weekStartYmd) return b.weekStartYmd.localeCompare(a.weekStartYmd);
      return a.driverName.localeCompare(b.driverName);
    });
}

/** Merge confirms onto expected rows. Missing confirm → unconfirmed. */
export function mergeBankReceiveConfirms(
  expectedRows: ReturnType<typeof aggregateExpectedBankByDriverWeek>,
  confirms: FleetBankConfirmRecord[] | undefined,
): FleetBankReceiveRow[] {
  const byKey = new Map<string, FleetBankConfirmRecord>();
  for (const c of confirms || []) {
    if (!c?.driverId || !c?.weekStartYmd) continue;
    byKey.set(`${c.driverId}|${c.weekStartYmd}`, c);
  }
  return expectedRows.map((row) => {
    const conf = byKey.get(`${row.driverId}|${row.weekStartYmd}`);
    if (!conf || conf.status !== 'confirmed') {
      return {
        ...row,
        amountReceived: null,
        variance: null,
        status: 'unconfirmed' as const,
      };
    }
    const amountReceived = round2(Number(conf.amountReceived) || 0);
    return {
      ...row,
      amountReceived,
      variance: round2(amountReceived - row.expected),
      status: 'confirmed' as const,
      confirmedAt: conf.confirmedAt,
      confirmedBy: conf.confirmedBy,
    };
  });
}

export function fleetBankConfirmKey(driverId: string, weekStartYmd: string): string {
  return `${driverId}|${weekStartYmd}`;
}

/** Lookup map for Settlement display — keyed driverId|weekStartYmd. */
export function buildFleetBankConfirmLookup(
  confirms: FleetBankConfirmRecord[] | undefined,
): Map<string, FleetBankConfirmRecord> {
  const byKey = new Map<string, FleetBankConfirmRecord>();
  for (const c of confirms || []) {
    if (!c?.driverId || !c?.weekStartYmd) continue;
    byKey.set(fleetBankConfirmKey(c.driverId, c.weekStartYmd), c);
  }
  return byKey;
}

export type BankSettledDisplay =
  | { kind: 'none' }
  | { kind: 'pending' }
  | { kind: 'confirmed'; amount: number };

/**
 * Settlement Bank Settled column: Pending until Fleet Financials confirms.
 * Display-only — never feeds Cash Returned / Still Held / Settlement math.
 */
export function resolveBankSettledDisplay(input: {
  driverId: string;
  weekStartYmd: string;
  ledgerBankSettled: number;
  confirmsByKey: Map<string, FleetBankConfirmRecord>;
}): BankSettledDisplay {
  const ledger = Math.abs(Number(input.ledgerBankSettled) || 0);
  const conf = input.confirmsByKey.get(
    fleetBankConfirmKey(input.driverId, input.weekStartYmd),
  );
  if (conf?.status === 'confirmed') {
    const amount = round2(Number(conf.amountReceived) || 0);
    return { kind: 'confirmed', amount };
  }
  // Expected Uber bank on the week but ops has not confirmed receipt yet.
  if (ledger > 0.005) return { kind: 'pending' };
  return { kind: 'none' };
}
