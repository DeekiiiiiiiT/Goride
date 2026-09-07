import { describe, expect, it } from 'vitest';
import {
  StatementsNotClosedError,
  assertStatementsClosedForSettlement,
  hashWeekStatement,
  hasPendingRestatementDrafts,
  shadowCompareStatementVsProjection,
  shadowCompareStatementsVsProjection,
  statementAmountMajor,
  type WeekStatement,
} from './weekStatement.ts';
import { buildCloseHash, buildPeriodCloseHashPayload, canonicalStringify } from './closeHash.ts';

function stmt(partial: Partial<WeekStatement>): WeekStatement {
  return {
    kind: 'fuel',
    organizationId: 'org-1',
    driverId: 'drv-1',
    weekKey: '2026-08-31',
    version: 1,
    status: 'closed',
    amountsMinor: {},
    sourceRowIds: [],
    ...partial,
  };
}

describe('assertStatementsClosedForSettlement', () => {
  it('passes when fuel + toll + earnings are all closed', () => {
    expect(() =>
      assertStatementsClosedForSettlement([
        stmt({ kind: 'fuel', status: 'closed' }),
        stmt({ kind: 'toll', status: 'closed' }),
        stmt({ kind: 'earnings', status: 'closed' }),
      ]),
    ).not.toThrow();
  });

  it('detects pending restatement drafts via supersedes', () => {
    expect(hasPendingRestatementDrafts([stmt({ status: 'closed' })])).toBe(false);
    expect(hasPendingRestatementDrafts([stmt({ status: 'draft', supersedes: null })])).toBe(false);
    expect(
      hasPendingRestatementDrafts([stmt({ status: 'draft', supersedes: 'prior-id', version: 2 })]),
    ).toBe(true);
  });

  it('throws listing missing lanes', () => {
    try {
      assertStatementsClosedForSettlement([stmt({ kind: 'fuel', status: 'closed' })]);
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(StatementsNotClosedError);
      expect((e as StatementsNotClosedError).missing.sort()).toEqual(['earnings', 'toll']);
    }
  });

  it('throws listing lanes that exist but are not closed', () => {
    try {
      assertStatementsClosedForSettlement([
        stmt({ kind: 'fuel', status: 'closed' }),
        stmt({ kind: 'toll', status: 'draft' }),
        stmt({ kind: 'earnings', status: 'closed' }),
      ]);
      throw new Error('expected throw');
    } catch (e) {
      expect((e as StatementsNotClosedError).notClosed).toEqual(['toll']);
    }
  });

  it('evaluates the highest version per lane', () => {
    expect(() =>
      assertStatementsClosedForSettlement([
        stmt({ kind: 'fuel', version: 1, status: 'restated' }),
        stmt({ kind: 'fuel', version: 2, status: 'closed' }),
        stmt({ kind: 'toll', status: 'closed' }),
        stmt({ kind: 'earnings', status: 'closed' }),
      ]),
    ).not.toThrow();
  });
});

describe('shadowCompareStatementVsProjection', () => {
  const projection = {
    fuel_deduction: 12,
    fuel_fleet_share: 8,
    toll_spend: 59.2,
    toll_charged_to_driver: 23.4,
    cash_collected: 80,
  };

  it('returns no drift when statement matches the projection', () => {
    const fuel = stmt({ kind: 'fuel', amountsMinor: { driverShare: 1200, companyShare: 800 } });
    expect(shadowCompareStatementVsProjection(fuel, projection)).toEqual([]);
  });

  it('reports each drifting field with signed delta in minor units', () => {
    const fuel = stmt({ kind: 'fuel', amountsMinor: { driverShare: 1500, companyShare: 800 } });
    const drifts = shadowCompareStatementVsProjection(fuel, projection);
    expect(drifts).toHaveLength(1);
    expect(drifts[0]).toMatchObject({
      kind: 'fuel',
      field: 'driverShare',
      statementMinor: 1500,
      projectionMinor: 1200,
      deltaMinor: 300,
    });
  });

  it('tolerates a 1-cent rounding difference', () => {
    const toll = stmt({ kind: 'toll', amountsMinor: { totalSpend: 5921, chargedToDriver: 2340 } });
    expect(shadowCompareStatementVsProjection(toll, projection)).toEqual([]);
  });

  it('aggregates drift across every lane statement', () => {
    const drifts = shadowCompareStatementsVsProjection(
      [
        stmt({ kind: 'fuel', amountsMinor: { driverShare: 1300, companyShare: 800 } }),
        stmt({ kind: 'toll', amountsMinor: { totalSpend: 5920, chargedToDriver: 2340 } }),
        stmt({ kind: 'earnings', amountsMinor: { passengerCash: 8500 } }),
      ],
      projection,
    );
    expect(drifts.map((d) => d.field).sort()).toEqual(['driverShare', 'passengerCash']);
  });
});

describe('statementAmountMajor', () => {
  it('reads a minor amount back into 2dp major units', () => {
    const s = stmt({ amountsMinor: { driverShare: 123456 } });
    expect(statementAmountMajor(s, 'driverShare')).toBe(1234.56);
    expect(statementAmountMajor(s, 'missing')).toBe(0);
  });
});

describe('closeHash (H-4)', () => {
  it('canonicalStringify sorts keys and drops undefined for a stable hash', () => {
    expect(canonicalStringify({ b: 1, a: 2, c: undefined })).toBe('{"a":2,"b":1}');
    expect(canonicalStringify({ a: 2, b: 1 })).toBe('{"a":2,"b":1}');
  });

  it('produces identical hashes regardless of key order', async () => {
    const h1 = await hashWeekStatement(
      stmt({ amountsMinor: { driverShare: 1200, companyShare: 800 }, sourceRowIds: ['b', 'a'] }),
    );
    const h2 = await hashWeekStatement(
      stmt({ amountsMinor: { companyShare: 800, driverShare: 1200 }, sourceRowIds: ['a', 'b'] }),
    );
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes the hash when a previously-omitted field (fleet share) changes', async () => {
    const base = buildPeriodCloseHashPayload({
      row: { fuelDeduction: 1200, fuelFleetShare: 800 },
      sourceRowIds: ['x'],
      engineVersion: 'week-statement@1',
    });
    const changed = buildPeriodCloseHashPayload({
      row: { fuelDeduction: 1200, fuelFleetShare: 950 },
      sourceRowIds: ['x'],
      engineVersion: 'week-statement@1',
    });
    expect(await buildCloseHash(base)).not.toBe(await buildCloseHash(changed));
  });

  it('binds the hash to the engine version', async () => {
    const v1 = buildPeriodCloseHashPayload({
      row: { fuelDeduction: 1200 },
      sourceRowIds: [],
      engineVersion: 'week-statement@1',
    });
    const v2 = buildPeriodCloseHashPayload({
      row: { fuelDeduction: 1200 },
      sourceRowIds: [],
      engineVersion: 'week-statement@2',
    });
    expect(await buildCloseHash(v1)).not.toBe(await buildCloseHash(v2));
  });
});
