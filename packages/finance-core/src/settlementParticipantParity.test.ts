import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  isSettlementParticipantTransaction,
  isTollChargeTransaction,
  periodKeyFor,
} from './index.ts';
import {
  isSettlementParticipantTransaction as jsParticipant,
  periodKeyFor as jsPeriodKeyFor,
} from '../../../scripts/lib/settlementParticipant.mjs';
import { sqlSettlementParticipantPredicate } from '../../../scripts/lib/settlementParticipantSql.mjs';
import { checkPeriodVsLedgerEvents } from './periodLedgerRecon.ts';

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../scripts/fixtures/settlement_participant_samples.json',
);
const samples = JSON.parse(readFileSync(fixturePath, 'utf8')) as Array<{
  id: string;
  type?: string;
  category?: string;
  amount?: number;
  description?: string;
  paymentMethod?: string;
  expect: boolean;
}>;

describe('isSettlementParticipantTransaction', () => {
  it('includes cash, payout, write-off, and Toll Charge', () => {
    expect(
      isSettlementParticipantTransaction({
        type: 'Payment_Received',
        category: 'Cash Collection',
        amount: 100,
      }),
    ).toBe(true);
    expect(
      isSettlementParticipantTransaction({
        type: 'Payout',
        category: 'Driver Payouts',
        amount: 500,
      }),
    ).toBe(true);
    expect(
      isSettlementParticipantTransaction({
        type: 'Cash_Write_Off',
        category: 'Cash Write Off',
        amount: 50,
      }),
    ).toBe(true);
    expect(
      isSettlementParticipantTransaction({
        category: 'Toll Charge',
        amount: -200,
      }),
    ).toBe(true);
    expect(isTollChargeTransaction({ category: 'Toll Charge' })).toBe(true);
  });

  it('rejects fuel and tag balance', () => {
    expect(
      isSettlementParticipantTransaction({
        type: 'Payment_Received',
        category: 'Fuel Reimbursement',
        amount: 30,
      }),
    ).toBe(false);
    expect(
      isSettlementParticipantTransaction({
        type: 'Payment_Received',
        category: 'Cash Collection',
        amount: 10,
        paymentMethod: 'Tag Balance',
      }),
    ).toBe(false);
  });

  it('stays in lockstep with scripts/lib/settlementParticipant.mjs', () => {
    const coreSamples = [
      { type: 'Payment_Received', category: 'Cash Collection', amount: 1 },
      { type: 'Payout', category: 'Driver Payouts', amount: 1 },
      { type: 'Cash_Write_Off', category: 'Cash Write Off', amount: 1 },
      { category: 'Toll Charge', amount: -1 },
      { type: 'Payment_Received', category: 'Fuel Reimbursement', amount: 1 },
      { type: 'Driver_Payout', category: 'Driver Payout', amount: 1 },
    ];
    for (const s of coreSamples) {
      expect(jsParticipant(s)).toBe(isSettlementParticipantTransaction(s));
    }
    expect(jsPeriodKeyFor('2026-08-31')).toBe(periodKeyFor('2026-08-31'));
  });
});

describe('checkPeriodVsLedgerEvents — fares and tolls (A-5)', () => {
  it('flags fare_earning drift', () => {
    const drifts = checkPeriodVsLedgerEvents(
      { driver_id: 'd1', period_anchor: '2026-08-24', earnings_gross: 1000 },
      [{ event_type: 'fare_earning', amount_minor: 95000 }],
    );
    expect(drifts.some((d) => d.kind === 'ledger_fare_earning')).toBe(true);
  });

  it('flags toll_usage spend drift', () => {
    const drifts = checkPeriodVsLedgerEvents(
      { driver_id: 'd1', period_anchor: '2026-08-24', toll_spend: 500 },
      [{ event_type: 'toll_usage', amount_minor: -45000 }],
    );
    expect(drifts.some((d) => d.kind === 'ledger_toll_usage_spend')).toBe(true);
  });
});

describe('settlement participant triple-lock fixtures', () => {
  for (const sample of samples) {
    it(`${sample.id}: TS / JS / SQL agree`, () => {
      const tx = {
        type: sample.type,
        category: sample.category,
        amount: sample.amount,
        description: sample.description,
        paymentMethod: sample.paymentMethod,
      };
      const ts = isSettlementParticipantTransaction(tx);
      const js = jsParticipant(tx);
      const sql = sqlSettlementParticipantPredicate({
        cat: sample.category,
        typ: sample.type,
        descr: sample.description,
        pm: sample.paymentMethod,
        amt: sample.amount,
      });
      expect(ts).toBe(sample.expect);
      expect(js).toBe(sample.expect);
      expect(sql).toBe(sample.expect);
      expect(ts).toBe(js);
      expect(ts).toBe(sql);
    });
  }
});
