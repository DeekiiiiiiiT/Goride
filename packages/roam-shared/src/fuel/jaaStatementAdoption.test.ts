import { describe, expect, it } from 'vitest';
import {
  buildAdoptedOpsEntry,
  planStatementPurge,
  unlinkOpsFromDeletedStatement,
  validateAdoptPreconditions,
} from './jaaStatementAdoption';
import { applyFuelMatchLinks, type FuelEntryLike } from './jaaFuelStatementMatcher';
import { isJaaStatementLedgerRow } from './jaaStatementLedger';
import {
  computeGasCardStatementDriftSummary,
  gasCardStatementDriftBlocks,
  isUnlinkedCardCharge,
} from './jaaUnlinkedCardCharge';

function statement(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'stmt-4000',
    date: '2026-09-16',
    time: '20:41:45',
    amount: 4000,
    liters: 17.29,
    cardId: 'card-2783',
    vehicleId: 'veh-1',
    driverId: 'drv-kenny',
    organizationId: 'org-1',
    type: 'Card_Transaction',
    entryMode: 'Floating',
    paymentSource: 'Gas_Card',
    entrySource: 'fuel-card',
    usageCategory: 'ride',
    reconciliationStatus: 'Pending',
    metadata: {
      importSource: 'jaa_raw',
      jaaImportId: 'import-1',
      jaaRowKind: 'approved_fuel',
      jaaReceiptNumber: 'ZZ0029119109',
      jaaCardCode: '00002920RN2783',
      countsInFuelSpend: true,
    },
    ...overrides,
  };
}

function adopt(stmt = statement(), odometer: number | null = null) {
  return buildAdoptedOpsEntry({
    statement: stmt,
    driverId: 'drv-kenny',
    vehicleId: 'veh-1',
    odometer,
    reason: 'Driver confirmed fill, forgot to log',
    adoptedBy: 'user-ops',
    organizationId: 'org-1',
    id: 'adopted-1',
    nowIso: '2026-09-25T12:00:00.000Z',
  });
}

function linkPair(stmt: Record<string, unknown>, ops: Record<string, unknown>) {
  return applyFuelMatchLinks({
    status: 'matched',
    statementEntry: stmt as unknown as FuelEntryLike,
    driverEntry: ops as unknown as FuelEntryLike,
  });
}

describe('planStatementPurge (F4 rollback safety)', () => {
  it('refuses with 409 when an adopted child references a purged statement', () => {
    const stmt = statement();
    const { statement: linkedStmt, driver: linkedOps } = linkPair(stmt, adopt(stmt));
    const plan = planStatementPurge(
      [linkedStmt as unknown as Record<string, unknown>, linkedOps as unknown as Record<string, unknown>],
      ['stmt-4000'],
    );
    expect(plan.refuse).toBe(true);
    if (plan.refuse) {
      expect(plan.status).toBe(409);
      expect(plan.adoptedChildIds).toEqual(['adopted-1']);
    }
  });

  it('unlinks matched driver logs and reverses the copied money', () => {
    const stmt = statement({ id: 'stmt-m' });
    const driverLog = {
      id: 'log-driver',
      date: '2026-09-15',
      amount: 0,
      liters: undefined,
      cardId: 'card-2783',
      vehicleId: 'veh-1',
      driverId: 'drv-kenny',
      type: 'Manual_Entry',
      entryMode: 'Anchor',
      odometer: 120500,
      paymentSource: 'Gas_Card',
      entrySource: 'driver-portal',
      metadata: { awaitingCardStatement: true, countsInFuelSpend: false },
    };
    const { statement: linkedStmt, driver: linkedOps } = linkPair(stmt, driverLog);
    expect((linkedOps as FuelEntryLike).amount).toBe(4000);

    const plan = planStatementPurge(
      [linkedStmt as unknown as Record<string, unknown>, linkedOps as unknown as Record<string, unknown>],
      ['stmt-m'],
    );
    expect(plan.refuse).toBe(false);
    if (!plan.refuse) {
      expect(plan.opsToUnlink).toHaveLength(1);
      const reversed = plan.opsToUnlink[0];
      const meta = reversed.metadata as Record<string, unknown>;
      expect(reversed.id).toBe('log-driver');
      expect(reversed.amount).toBe(0);
      expect(meta.jaaMatchedStatementId).toBeUndefined();
      expect(meta.jaaReceiptNumber).toBeUndefined();
      expect(meta.awaitingCardStatement).toBe(true);
      expect(meta.countsInFuelSpend).toBe(false);
    }
  });

  it('leaves no surviving row holding money from a deleted statement', () => {
    const stmt = statement({ id: 'stmt-x' });
    const driverLog = {
      id: 'log-x',
      date: '2026-09-16',
      amount: 0,
      paymentSource: 'Gas_Card',
      entrySource: 'driver-portal',
      metadata: { awaitingCardStatement: true, countsInFuelSpend: false },
    };
    const { statement: linkedStmt, driver: linkedOps } = linkPair(stmt, driverLog);
    const unrelated = { id: 'other', amount: 3000, paymentSource: 'Cash', metadata: {} };
    const all = [
      linkedStmt as unknown as Record<string, unknown>,
      linkedOps as unknown as Record<string, unknown>,
      unrelated,
    ];
    const plan = planStatementPurge(all, ['stmt-x']);
    if (plan.refuse) throw new Error('unexpected refuse');

    const byId = new Map(all.map((e) => [String(e.id), e]));
    for (const u of plan.opsToUnlink) byId.set(String(u.id), u);
    byId.delete('stmt-x');
    const survivors = [...byId.values()];
    const orphanedMoney = survivors.filter((e) => {
      const m = (e.metadata || {}) as Record<string, unknown>;
      return m.jaaMatchedStatementId === 'stmt-x' || (Number(e.amount) > 0 && m.jaaReceiptNumber);
    });
    expect(orphanedMoney).toEqual([]);
    expect(byId.get('other')?.amount).toBe(3000);
  });

  it('ignores rows linked to statements outside the purge set', () => {
    const plan = planStatementPurge(
      [{ id: 'log-y', amount: 500, metadata: { jaaMatchedStatementId: 'stmt-kept' } }],
      ['stmt-purged'],
    );
    expect(plan).toEqual({ refuse: false, opsToUnlink: [] });
  });

  it('unlinkOpsFromDeletedStatement restores the pre-match amount', () => {
    const out = unlinkOpsFromDeletedStatement({
      id: 'log-z',
      amount: 4000,
      metadata: { jaaMatchedStatementId: 's', priorDriverAmount: 0, priorDriverLiters: undefined },
    });
    expect(out.amount).toBe(0);
  });
});

describe('validateAdoptPreconditions', () => {
  it('accepts an unmatched approved_fuel statement with a reason', () => {
    expect(validateAdoptPreconditions(statement(), { reason: 'confirmed' })).toEqual({ ok: true });
  });

  it('refuses a second adopt (already linked) with 409', () => {
    const linked = statement({
      metadata: { ...(statement().metadata as object), jaaMatchedDriverEntryId: 'adopted-1' },
    });
    const r = validateAdoptPreconditions(linked, { reason: 'again' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(409);
  });

  it('refuses a dismissed statement with 409', () => {
    const dismissed = statement({
      metadata: { ...(statement().metadata as object), adoptionDismissedAt: '2026-09-24T00:00:00Z' },
    });
    const r = validateAdoptPreconditions(dismissed, { reason: 'x' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(409);
  });

  it('refuses without a reason', () => {
    const r = validateAdoptPreconditions(statement(), { reason: '   ' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  it.each(['fee', 'declined'])('refuses a %s row', (kind) => {
    const r = validateAdoptPreconditions(
      statement({ metadata: { ...(statement().metadata as object), jaaRowKind: kind } }),
      { reason: 'x' },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  it('refuses a missing statement with 404', () => {
    const r = validateAdoptPreconditions(null, { reason: 'x' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(404);
  });
});

describe('buildAdoptedOpsEntry', () => {
  it('with odometer → Anchor, odometerMissing false', () => {
    const row = adopt(statement(), 120750);
    expect(row.entryMode).toBe('Anchor');
    expect(row.odometer).toBe(120750);
    expect((row.metadata as Record<string, unknown>).odometerMissing).toBe(false);
  });

  it('without odometer → Floating, odometerMissing true', () => {
    const row = adopt(statement(), null);
    expect(row.entryMode).toBe('Floating');
    expect(row.odometer).toBeNull();
    expect((row.metadata as Record<string, unknown>).odometerMissing).toBe(true);
  });

  it('is admin-manual, has no usageCategory, and never carries import keys', () => {
    const row = adopt();
    const meta = row.metadata as Record<string, unknown>;
    expect(row.id).not.toBe('stmt-4000');
    expect(row.entrySource).toBe('admin-manual');
    expect(meta.entrySource).toBe('admin-manual');
    expect(row.usageCategory).toBeUndefined();
    expect(row.amount).toBe(0);
    expect(meta.importSource).toBeUndefined();
    expect(meta.jaaImportId).toBeUndefined();
    expect(meta.jaaRowKind).toBeUndefined();
    expect(meta.fillOrigin).toBe('statement_adopted');
    expect(meta.adoptedFromStatementId).toBe('stmt-4000');
    expect(meta.driverAttested).toBe(false);
  });

  it('PIN: after applyFuelMatchLinks the adopted row is still not a statement row', () => {
    const stmt = statement();
    const adopted = adopt(stmt);
    expect(isJaaStatementLedgerRow(adopted)).toBe(false);

    const { statement: linkedStmt, driver: linkedOps } = linkPair(stmt, adopted);
    expect(linkedOps).toBeDefined();
    expect(isJaaStatementLedgerRow(linkedOps as FuelEntryLike)).toBe(false);
    expect(isJaaStatementLedgerRow(linkedStmt as FuelEntryLike)).toBe(true);

    const opsMeta = (linkedOps as FuelEntryLike).metadata as Record<string, unknown>;
    expect((linkedOps as FuelEntryLike).amount).toBe(4000);
    expect(opsMeta.countsInFuelSpend).toBe(true);
    expect(opsMeta.awaitingCardStatement).toBe(false);
    expect(opsMeta.jaaMatchedStatementId).toBe('stmt-4000');
  });

  it('adopt then link: statement leaves the queue and drift clears', () => {
    const stmt = statement();
    expect(isUnlinkedCardCharge(stmt)).toBe(true);
    const { statement: linkedStmt, driver: linkedOps } = linkPair(stmt, adopt(stmt));
    expect(isUnlinkedCardCharge(linkedStmt as FuelEntryLike)).toBe(false);

    const summary = computeGasCardStatementDriftSummary([
      linkedStmt as unknown as Record<string, unknown>,
      linkedOps as unknown as Record<string, unknown>,
    ]);
    expect(summary.drift).toBe(0);
    expect(summary.statementFuelTotal).toBeCloseTo(4000, 5);
    expect(summary.opsGasCardTotal).toBeCloseTo(4000, 5);
    expect(gasCardStatementDriftBlocks(summary)).toBe(false);
  });
});
