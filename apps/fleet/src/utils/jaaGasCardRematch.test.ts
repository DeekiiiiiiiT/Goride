import { describe, expect, it } from 'vitest';
import type { FuelEntry } from '../types/fuel';
import {
  buildRematchApplyPairs,
  hasStaleStatementLink,
  shouldRematchAfterGasCardLogSave,
} from './jaaGasCardRematch';
import {
  WEEK_SEALED_MATCH_CODE,
  countSealedMatchRefusals,
  datesAndOrgForMatchPair,
} from '../../../../packages/roam-shared/src/fuel/jaaMatchSeal';

function stmt(partial: Partial<FuelEntry> & { id: string }): FuelEntry {
  return {
    date: '2026-08-05',
    time: '20:24:00',
    amount: 4500,
    paymentSource: 'Gas_Card',
    type: 'Card_Transaction',
    entrySource: 'fuel-card',
    cardId: 'card-1',
    vehicleId: 'veh-1',
    driverId: 'drv-1',
    metadata: {
      importSource: 'jaa_raw',
      jaaRowKind: 'approved_fuel',
      countsInFuelSpend: true,
    },
    ...partial,
  } as FuelEntry;
}

function log(partial: Partial<FuelEntry> & { id: string }): FuelEntry {
  return {
    date: '2026-08-05',
    time: '20:25:00',
    amount: 0,
    paymentSource: 'Gas_Card',
    type: 'Manual_Entry',
    entrySource: 'driver-portal',
    cardId: 'card-1',
    vehicleId: 'veh-1',
    driverId: 'drv-1',
    odometer: 1000,
    metadata: {
      awaitingCardStatement: true,
      countsInFuelSpend: false,
      paymentSource: 'company_card',
    },
    ...partial,
  } as FuelEntry;
}

describe('jaaGasCardRematch', () => {
  it('shouldRematchAfterGasCardLogSave skips statement rows and already-linked logs', () => {
    expect(shouldRematchAfterGasCardLogSave(stmt({ id: 's1' }))).toBe(false);
    expect(
      shouldRematchAfterGasCardLogSave(
        log({ id: 'd1', metadata: { awaitingCardStatement: true, jaaMatchedStatementId: 's1' } }),
        [stmt({ id: 's1' })],
      ),
    ).toBe(false);
    expect(shouldRematchAfterGasCardLogSave(log({ id: 'd1' }))).toBe(true);
  });

  it('late driver log rematches a prior unmatched statement without re-import', () => {
    const statement = stmt({ id: 's1' });
    const driverLog = log({ id: 'd1' });
    const pairs = buildRematchApplyPairs(driverLog, [statement], [
      { id: 'card-1', assignedVehicleId: 'veh-1' },
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.status).toBe('matched');
    expect(pairs[0]?.statementEntry?.id).toBe('s1');
    expect(pairs[0]?.driverEntry?.id).toBe('d1');
  });

  it('does not auto-apply when no statement exists', () => {
    const driverLog = log({ id: 'd1' });
    expect(buildRematchApplyPairs(driverLog, [driverLog], [])).toHaveLength(0);
  });

  it('heals stale jaaMatchedStatementId after statement re-import (Aug 5 case)', () => {
    const liveStmt = stmt({ id: 'ae5b4982' });
    const orphanLog = log({
      id: 'e8702f82',
      amount: 4500,
      metadata: {
        awaitingCardStatement: false,
        jaaReceiptNumber: 'ZZ0028966858',
        jaaMatchedStatementId: '98995976-dead-statement',
        paymentSource: 'company_card',
      },
    });
    expect(hasStaleStatementLink(orphanLog, [liveStmt])).toBe(true);
    expect(shouldRematchAfterGasCardLogSave(orphanLog, [liveStmt])).toBe(true);
    const pairs = buildRematchApplyPairs(orphanLog, [liveStmt, orphanLog], [
      { id: 'card-1', assignedVehicleId: 'veh-1' },
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.statementEntry?.id).toBe('ae5b4982');
    expect(pairs[0]?.driverEntry?.id).toBe('e8702f82');
  });

  it('datesAndOrgForMatchPair + sealed refusal counting support apply-matches soft outcome', () => {
    expect(
      datesAndOrgForMatchPair(
        {
          statementEntry: {
            date: '2026-08-05T20:24:00Z',
            organizationId: '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823',
          },
          driverEntry: { date: '2026-08-05' },
        },
        '',
      ),
    ).toEqual({
      orgId: '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823',
      datesYmd: ['2026-08-05'],
    });
    expect(
      countSealedMatchRefusals([
        { ok: true },
        { ok: false, code: WEEK_SEALED_MATCH_CODE },
      ]),
    ).toBe(1);
  });
});
