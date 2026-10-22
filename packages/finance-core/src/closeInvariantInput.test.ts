import { describe, expect, it } from 'vitest';
import { checkCloseInvariants, type ClosePeriodRow } from './closeInvariants.ts';
import { assembleCloseInvariantInput } from './closeInvariantInput.ts';

const period: ClosePeriodRow = {
  driver_id: '73e5b1dc-01b4-45ee-a34a-25a3256b9841',
  period_anchor: '2026-10-12',
  fuel_deduction: 1200,
  fuel_fleet_share: 800,
  toll_spend: 5920,
  toll_cash_spend: 640,
  toll_tag_spend: 5280,
  toll_charged_to_driver: 2340,
  cash_collected: 8000,
  driver_share: 25000,
  fleet_share: 4000,
  tips_paid_to_driver: 300,
  earnings_gross: 29300,
  settlement_amount: 0,
  cash_still_held: 0,
  metadata: {
    financeCore: {
      cashSourceMismatch: 3201.27,
      uberCash: 22470.65,
      uberTripCash: 19269.38,
      cashSourceAck: {
        at: '2026-10-21T15:32:06.194Z',
        by: '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823',
        reason: 'Uploaded Uber statement cash is what settlement already uses. The trip file total is lower by this amount.',
        uberCash: 22470.65,
        uberTripCash: 19269.38,
        mismatchAtAck: 3201.27,
      },
    },
  },
};

const statements = {
  fuelStatement: { driverShare: 1200, companyShare: 800, status: 'closed' as const },
  tollStatement: {
    totalSpend: 5920,
    chargedToDriver: 2340,
    reimbursed: 3580,
    netLoss: 0,
    status: 'closed' as const,
  },
  earningsStatement: { passengerCash: 8000, status: 'closed' as const },
};

const engineDrifts = [{
  code: 'FUEL_ENGINE_DRIFT',
  severity: 'block' as const,
  driverId: period.driver_id ?? undefined,
  week: '2026-10-12',
  persisted: 1200,
  expected: 1250,
  delta: -50,
  message: 'Fuel statement does not match the fuel engine',
}];

const tollEventLedger = {
  orphanCount: 1,
  orphanAmountMajor: 40,
  eventSpendMajor: 40,
  ledgerSpendMajor: 0,
  missingEventCount: 0,
  missingEventAmountMajor: 0,
  ineligibleEventCount: 0,
  ineligibleEventAmountMajor: 0,
  amountMismatchCount: 0,
  amountMismatchAmountMajor: 0,
};

function codesOf(input: Parameters<typeof checkCloseInvariants>[0]): string[] {
  return checkCloseInvariants(input).map((b) => b.code).sort();
}

describe('assembleCloseInvariantInput', () => {
  it('worker and close see the same blockers when they share this input', () => {
    const parts = {
      period,
      ...statements,
      engineDrifts,
      tollEventLedger,
      skipSettlementDeskClear: false,
    };
    const workerCodes = codesOf(assembleCloseInvariantInput(parts));
    const closeCodes = codesOf(assembleCloseInvariantInput(parts));
    expect(workerCodes).toEqual(closeCodes);
    expect(workerCodes).not.toContain('CASH_SOURCE_MISMATCH');
    expect(workerCodes).toContain('FUEL_ENGINE_DRIFT');
    expect(workerCodes).toContain('TOLL_EVENT_ORPHANED');
  });

  it('a saved acceptance is ignored when the period is passed without the assembler', () => {
    const blocked = codesOf({
      period,
      ...statements,
    });
    expect(blocked).toContain('CASH_SOURCE_MISMATCH');
  });

  it('blocks cash again when the acceptance is removed', () => {
    const financeCore = {
      ...(period.metadata?.financeCore as Record<string, unknown>),
    };
    delete financeCore.cashSourceAck;
    const codes = codesOf(assembleCloseInvariantInput({
      period: { ...period, metadata: { financeCore } },
      ...statements,
      engineDrifts,
      tollEventLedger,
    }));
    expect(codes).toContain('CASH_SOURCE_MISMATCH');
    expect(codes).toContain('FUEL_ENGINE_DRIFT');
    expect(codes).toContain('TOLL_EVENT_ORPHANED');
  });
});
