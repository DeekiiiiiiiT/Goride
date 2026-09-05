/**
 * Cash wash SSOT alignment with Overview + Reconciliation.
 */
import { describe, it, expect } from 'vitest';
import { classifyTollLedgerEntry } from './tollDisposition';
import { resolvePeriodTollCashWash } from './periodTollCashSpend';

describe('cash wash classification', () => {
  it('classifies cash paymentMethod as cashWash', () => {
    expect(
      classifyTollLedgerEntry({
        paymentMethod: 'Cash',
        tripId: 't1',
      } as any)
    ).toBe('cashWash');
  });

  it('does not treat tag as cashWash when not cash', () => {
    expect(
      classifyTollLedgerEntry({
        paymentMethod: 'Tag',
        resolution: 'reconciled',
        tripId: 't1',
      } as any)
    ).toBe('fleet');
  });
});

describe('period cash wash resolve', () => {
  it('prefers metadata financeCore.tollCashWashEligible', () => {
    expect(
      resolvePeriodTollCashWash({
        tollCashSpend: 900,
        metadata: { financeCore: { tollCashWashEligible: 500 } },
      })
    ).toBe(500);
  });
});
