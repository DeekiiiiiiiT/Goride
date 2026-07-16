/**
 * Fleet Financials — org-week Uber bank expected vs ops received confirm.
 * Bank deposits belong to the fleet org, not a driver.
 * Ops records must NEVER feed Cash Returned / Settlement / Still Held math.
 */

import { payoutBankEventWeekKey, type PayoutBankEventLike } from './ledgerBankSettled';

export type FleetBankConfirmStatus = 'unconfirmed' | 'confirmed';

/** How ops verified the bank receive (Fleet Financials only). */
export type FleetBankConfirmMethod = 'statement' | 'manual';

/** Platform that produced the expected fleet bank deposit. */
export type FleetBankPlatform = 'uber' | 'indrive' | 'roam';

/** Ops-facing status (richer than raw confirmed/unconfirmed). */
export type FleetBankDisplayStatus =
  | 'needs_statement'
  | 'statement_matched'
  | 'manual_confirmed';

/** New writes are org-keyed; driverId remains for legacy dual-read. */
export type FleetBankConfirmRecord = {
  organizationId?: string;
  /** Legacy driver-keyed confirms only. */
  driverId?: string;
  weekStartYmd: string;
  status: FleetBankConfirmStatus;
  amountReceived: number;
  expectedAmount?: number;
  confirmedAt?: string;
  confirmedBy?: string;
  /** Explicit org recipient on new confirms. */
  recipient?: 'org' | 'driver';
  /** statement = PDF/CSV Accept; manual = Confirm / Enter amount. Legacy = treat as manual. */
  confirmMethod?: FleetBankConfirmMethod;
  /** Posted date from bank statement line when matched. */
  bankDateYmd?: string;
  /** Source statement file name when matched from upload. */
  statementFileName?: string;
  platform?: FleetBankPlatform;
};

export type FleetBankReceiveRow = {
  weekStartYmd: string;
  expected: number;
  amountReceived: number | null;
  variance: number | null;
  status: FleetBankConfirmStatus;
  confirmedAt?: string;
  confirmedBy?: string;
  platform: FleetBankPlatform;
  confirmMethod: FleetBankConfirmMethod | null;
  bankDateYmd: string | null;
  statementFileName: string | null;
};

export function fleetBankDisplayStatus(row: FleetBankReceiveRow): FleetBankDisplayStatus {
  if (row.status !== 'confirmed') return 'needs_statement';
  if (row.confirmMethod === 'statement') return 'statement_matched';
  return 'manual_confirmed';
}

export function fleetBankDisplayStatusLabel(status: FleetBankDisplayStatus): string {
  switch (status) {
    case 'needs_statement':
      return 'Needs statement';
    case 'statement_matched':
      return 'Statement matched';
    case 'manual_confirmed':
      return 'Manual confirm';
  }
}

export function fleetBankPlatformLabel(platform: FleetBankPlatform): string {
  switch (platform) {
    case 'uber':
      return 'Uber';
    case 'indrive':
      return 'InDrive';
    case 'roam':
      return 'Roam';
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function eventMeta(raw: PayoutBankEventLike): Record<string, unknown> {
  const m = (raw as { metadata?: Record<string, unknown> }).metadata;
  return m && typeof m === 'object' ? m : {};
}

/** Org-owned bank deposit event (payments_organization), not driver share. */
export function isOrgBankEvent(raw: PayoutBankEventLike): boolean {
  if (String(raw.eventType || '') !== 'payout_bank') return false;
  const meta = eventMeta(raw);
  if (meta.recipient === 'org') return true;
  if (String(meta.source || '') === 'payments_organization') return true;
  if (String(meta.bankRole || '') === 'org_deposit') return true;
  return false;
}

export function isDriverBankShareEvent(raw: PayoutBankEventLike): boolean {
  if (String(raw.eventType || '') !== 'payout_bank') return false;
  if (isOrgBankEvent(raw)) return false;
  const meta = eventMeta(raw);
  if (String(meta.bankRole || '') === 'driver_share') return true;
  if (String(meta.source || '') === 'payments_driver') return true;
  // Legacy payout_bank rows without tags — treat as driver share for Settlement.
  return true;
}

export function fleetBankOrgConfirmKey(organizationId: string, weekStartYmd: string): string {
  return `org|${organizationId}|${weekStartYmd}`;
}

/** @deprecated Prefer fleetBankOrgConfirmKey — kept for dual-read of legacy driver confirms. */
export function fleetBankConfirmKey(driverId: string, weekStartYmd: string): string {
  return `${driverId}|${weekStartYmd}`;
}

/**
 * Aggregate Expected Uber bank by Settlement week (fleet deposit).
 * Prefer org-recipient payout_bank when present for a week; else sum all payout_bank (legacy).
 * Platform defaults to Uber (payments_organization wire) unless metadata says otherwise.
 */
export function inferFleetBankPlatform(raw: PayoutBankEventLike): FleetBankPlatform {
  const meta = eventMeta(raw);
  const platform = String(meta.platform || meta.sourcePlatform || '').toLowerCase();
  if (platform.includes('indrive') || platform.includes('in_drive')) return 'indrive';
  if (platform.includes('roam')) return 'roam';
  return 'uber';
}

export function aggregateExpectedBankByWeek(
  events: PayoutBankEventLike[] | undefined,
  timezone?: string,
): Omit<
  FleetBankReceiveRow,
  | 'amountReceived'
  | 'variance'
  | 'status'
  | 'confirmedAt'
  | 'confirmedBy'
  | 'confirmMethod'
  | 'bankDateYmd'
  | 'statementFileName'
>[] {
  const orgByWeek = new Map<string, number>();
  const allByWeek = new Map<string, number>();
  const platformByWeek = new Map<string, FleetBankPlatform>();

  for (const raw of events || []) {
    if (!raw || typeof raw !== 'object') continue;
    if (String(raw.eventType || '') !== 'payout_bank') continue;
    const weekStartYmd = payoutBankEventWeekKey(raw, timezone);
    if (!weekStartYmd) continue;
    const add = Math.abs(Number(raw.netAmount) || 0);
    if (add < 1e-9) continue;
    allByWeek.set(weekStartYmd, round2((allByWeek.get(weekStartYmd) || 0) + add));
    if (!platformByWeek.has(weekStartYmd) || isOrgBankEvent(raw)) {
      platformByWeek.set(weekStartYmd, inferFleetBankPlatform(raw));
    }
    if (isOrgBankEvent(raw)) {
      orgByWeek.set(weekStartYmd, round2((orgByWeek.get(weekStartYmd) || 0) + add));
    }
  }

  const weeks = new Set<string>([...allByWeek.keys(), ...orgByWeek.keys()]);
  return [...weeks]
    .map((weekStartYmd) => {
      const orgAmt = orgByWeek.get(weekStartYmd);
      // Prefer org deposit when present so driver shares are not double-counted.
      const expected =
        orgAmt != null && orgAmt > 0.005 ? orgAmt : allByWeek.get(weekStartYmd) || 0;
      return {
        weekStartYmd,
        expected: round2(expected),
        platform: platformByWeek.get(weekStartYmd) || 'uber',
      };
    })
    .filter((r) => r.expected > 0.005)
    .sort((a, b) => b.weekStartYmd.localeCompare(a.weekStartYmd));
}

/**
 * Legacy per-driver aggregate — retained for tests / migration diagnostics only.
 * Fleet Financials UI uses aggregateExpectedBankByWeek.
 */
export function aggregateExpectedBankByDriverWeek(
  events: PayoutBankEventLike[] | undefined,
  driverNameById: Record<string, string>,
  timezone?: string,
): Array<{
  driverId: string;
  driverName: string;
  weekStartYmd: string;
  expected: number;
}> {
  const map = new Map<string, { driverId: string; weekStartYmd: string; expected: number }>();
  for (const raw of events || []) {
    if (!raw || typeof raw !== 'object') continue;
    if (String(raw.eventType || '') !== 'payout_bank') continue;
    if (isOrgBankEvent(raw)) continue;
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

/** Resolve confirmed receive for a week: prefer org confirm, else any legacy driver confirm. */
export function resolveWeekBankConfirm(
  weekStartYmd: string,
  confirms: FleetBankConfirmRecord[] | undefined,
  organizationId?: string | null,
): FleetBankConfirmRecord | null {
  const list = confirms || [];
  const orgId = String(organizationId || '').trim();

  if (orgId) {
    const orgHit = list.find(
      (c) =>
        c?.weekStartYmd === weekStartYmd &&
        c.status === 'confirmed' &&
        (c.recipient === 'org' ||
          String(c.organizationId || '') === orgId ||
          // New KV key uses orgId in the former driverId slot when recipient=org
          (c.recipient === 'org' && String(c.driverId || '') === orgId)),
    );
    if (orgHit) return orgHit;
  }

  // Dual-read: any confirmed driver-keyed row for this week counts as fleet week confirmed.
  const legacy = list.filter(
    (c) =>
      c?.weekStartYmd === weekStartYmd &&
      c.status === 'confirmed' &&
      c.recipient !== 'org' &&
      String(c.driverId || '').trim() !== '' &&
      (!orgId || String(c.organizationId || orgId) === orgId || !c.organizationId),
  );
  if (legacy.length === 0) return null;
  if (legacy.length === 1) return legacy[0];
  const amountReceived = round2(
    legacy.reduce((s, c) => s + (Number(c.amountReceived) || 0), 0),
  );
  return {
    ...legacy[0],
    recipient: 'org',
    organizationId: orgId || legacy[0].organizationId,
    amountReceived,
    weekStartYmd,
    status: 'confirmed',
  };
}

export function isFleetWeekBankConfirmed(
  weekStartYmd: string,
  confirms: FleetBankConfirmRecord[] | undefined,
  organizationId?: string | null,
): boolean {
  return resolveWeekBankConfirm(weekStartYmd, confirms, organizationId)?.status === 'confirmed';
}

/** Merge confirms onto org-week expected rows. */
export function mergeBankReceiveConfirms(
  expectedRows: ReturnType<typeof aggregateExpectedBankByWeek>,
  confirms: FleetBankConfirmRecord[] | undefined,
  organizationId?: string | null,
): FleetBankReceiveRow[] {
  return expectedRows.map((row) => {
    const conf = resolveWeekBankConfirm(row.weekStartYmd, confirms, organizationId);
    if (!conf || conf.status !== 'confirmed') {
      return {
        ...row,
        amountReceived: null,
        variance: null,
        status: 'unconfirmed' as const,
        confirmMethod: null,
        bankDateYmd: null,
        statementFileName: null,
      };
    }
    const amountReceived = round2(Number(conf.amountReceived) || 0);
    const method: FleetBankConfirmMethod =
      conf.confirmMethod === 'statement' ? 'statement' : 'manual';
    return {
      ...row,
      platform: conf.platform || row.platform,
      amountReceived,
      variance: round2(amountReceived - row.expected),
      status: 'confirmed' as const,
      confirmedAt: conf.confirmedAt,
      confirmedBy: conf.confirmedBy,
      confirmMethod: method,
      bankDateYmd: conf.bankDateYmd || null,
      statementFileName: conf.statementFileName || null,
    };
  });
}

/** Week → confirmed record (org preferred, legacy dual-read). */
export function buildFleetWeekConfirmLookup(
  confirms: FleetBankConfirmRecord[] | undefined,
  organizationId?: string | null,
): Map<string, FleetBankConfirmRecord> {
  const weeks = new Set<string>();
  for (const c of confirms || []) {
    if (c?.weekStartYmd) weeks.add(c.weekStartYmd);
  }
  const map = new Map<string, FleetBankConfirmRecord>();
  for (const week of weeks) {
    const conf = resolveWeekBankConfirm(week, confirms, organizationId);
    if (conf) map.set(week, conf);
  }
  return map;
}

/** @deprecated Use buildFleetWeekConfirmLookup for Settlement. */
export function buildFleetBankConfirmLookup(
  confirms: FleetBankConfirmRecord[] | undefined,
): Map<string, FleetBankConfirmRecord> {
  const byKey = new Map<string, FleetBankConfirmRecord>();
  for (const c of confirms || []) {
    if (!c?.weekStartYmd) continue;
    if (c.recipient === 'org' && c.organizationId) {
      byKey.set(fleetBankOrgConfirmKey(c.organizationId, c.weekStartYmd), c);
    }
    if (c.driverId) {
      byKey.set(fleetBankConfirmKey(c.driverId, c.weekStartYmd), c);
    }
  }
  return byKey;
}

export type BankSettledDisplay =
  | { kind: 'none' }
  | { kind: 'pending' }
  | { kind: 'confirmed'; amount: number };

/**
 * Settlement Bank Settled: Pending until fleet org week is confirmed.
 * Amount shown = driver statement share (ledger), not the org wire total.
 */
export function resolveBankSettledDisplay(input: {
  driverId: string;
  driverIds?: string[];
  weekStartYmd: string;
  ledgerBankSettled: number;
  organizationId?: string | null;
  confirms?: FleetBankConfirmRecord[];
  /** @deprecated Prefer `confirms` + organizationId. */
  confirmsByKey?: Map<string, FleetBankConfirmRecord>;
}): BankSettledDisplay {
  const ledger = Math.abs(Number(input.ledgerBankSettled) || 0);

  let weekConfirmed = false;
  if (input.confirms) {
    weekConfirmed = isFleetWeekBankConfirmed(
      input.weekStartYmd,
      input.confirms,
      input.organizationId,
    );
  } else if (input.confirmsByKey) {
    // Legacy path: any linked driver confirm OR org key
    const ids = new Set<string>();
    for (const raw of [input.driverId, ...(input.driverIds || [])]) {
      const id = String(raw || '').trim();
      if (id) ids.add(id);
    }
    const orgId = String(input.organizationId || '').trim();
    if (orgId) {
      const orgConf = input.confirmsByKey.get(
        fleetBankOrgConfirmKey(orgId, input.weekStartYmd),
      );
      if (orgConf?.status === 'confirmed') weekConfirmed = true;
    }
    if (!weekConfirmed) {
      for (const id of ids) {
        const conf = input.confirmsByKey.get(
          fleetBankConfirmKey(id, input.weekStartYmd),
        );
        if (conf?.status === 'confirmed') {
          weekConfirmed = true;
          break;
        }
      }
    }
  }

  if (weekConfirmed && ledger > 0.005) {
    return { kind: 'confirmed', amount: round2(ledger) };
  }
  if (weekConfirmed && ledger <= 0.005) {
    return { kind: 'none' };
  }
  if (ledger > 0.005) return { kind: 'pending' };
  return { kind: 'none' };
}
