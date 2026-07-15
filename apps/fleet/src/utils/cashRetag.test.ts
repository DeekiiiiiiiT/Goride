import { describe, it, expect } from 'vitest';
import {
  suggestWeekFromPaymentDate,
  listCashRetagCandidates,
  buildCashRetagPreview,
  buildCashRetagSavePayload,
} from './cashRetag';
import type { FinancialTransaction } from '../types/data';

const baseTx = (over: Partial<FinancialTransaction>): FinancialTransaction =>
  ({
    id: 'tx1',
    driverId: 'd1',
    amount: 100,
    date: '2026-07-02',
    category: 'Cash Collection',
    type: 'Payment_Received',
    paymentMethod: 'Cash',
    status: 'Completed',
    description: 'Cash Payment from Driver',
    ...over,
  }) as FinancialTransaction;

describe('cashRetag', () => {
  it('suggests Settlement Week Monday from payment date', () => {
    expect(suggestWeekFromPaymentDate('2026-07-02')).toBe('2026-06-29');
  });

  it('lists untagged cleared cash only by default', () => {
    const rows = listCashRetagCandidates(
      [
        baseTx({ id: 'u1' }),
        baseTx({
          id: 't1',
          metadata: {
            workPeriodStart: '2026-06-29T12:00:00.000Z',
            workPeriodEnd: '2026-07-05T12:00:00.000Z',
          },
        }),
      ],
      { d1: 'Driver One' },
    );
    expect(rows.map((r) => r.id)).toEqual(['u1']);
    expect(rows[0].suggestedWeekYmd).toBe('2026-06-29');
  });

  it('blocks replace of existing tags unless allowReplaceTagged', () => {
    const tagged = listCashRetagCandidates(
      [
        baseTx({
          id: 't1',
          metadata: {
            workPeriodStart: '2026-06-22T12:00:00.000Z',
            workPeriodEnd: '2026-06-28T12:00:00.000Z',
          },
        }),
      ],
      { d1: 'D' },
      { includeTagged: true },
    );
    const blocked = buildCashRetagPreview(tagged, { t1: '2026-06-29' }, false);
    expect(blocked.preview).toHaveLength(0);
    expect(blocked.blocked).toHaveLength(1);

    const ok = buildCashRetagPreview(tagged, { t1: '2026-06-29' }, true);
    expect(ok.preview).toHaveLength(1);
    expect(ok.preview[0].willReplaceExistingTag).toBe(true);
  });

  it('buildCashRetagSavePayload sets week metadata and audit without changing amount', () => {
    const original = baseTx({ amount: 250 });
    const payload = buildCashRetagSavePayload(original, '2026-06-29', 'ops-user');
    expect(payload.amount).toBe(250);
    expect(payload.metadata?.workPeriodStart).toBe('2026-06-29T12:00:00.000Z');
    expect(payload.metadata?.workPeriodEnd).toBe('2026-07-05T12:00:00.000Z');
    expect((payload.metadata as any).cashRetag.newWeekYmd).toBe('2026-06-29');
    expect((payload.metadata as any).cashRetag.retaggedBy).toBe('ops-user');
  });
});
