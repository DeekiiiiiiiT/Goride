import { describe, expect, it } from 'vitest';
import { weeksStillOff } from './payoutBackfillCheck';

describe('weeksStillOff', () => {
  it('treats the June 15 gap as a missing payment, and ignores a collect reversal', () => {
    const off = weeksStillOff({
      weeks: [
        { week: '2026-06-15', settlementPaid: 7020.5 },
        { week: '2026-08-31', settlementPaid: 8650.32 },
      ],
      movements: [
        { week: '2026-06-15', kind: 'pay', status: 'posted', amount: 7020.5 },
        {
          week: '2026-06-15',
          kind: 'reverse',
          status: 'posted',
          amount: 2565.44,
          reversedKind: 'legacy_tx',
        },
        { week: '2026-08-31', kind: 'pay', status: 'posted', amount: 8650.32 },
        {
          week: '2026-08-31',
          kind: 'reverse',
          status: 'posted',
          amount: 1300,
          reversedKind: 'collect',
        },
      ],
      extraPays: [
        { week: '2026-06-15', amount: 2565.44, idempotencyKey: 'backfill-payout:d:2026-06-15:2565.44' },
      ],
    });
    expect(off).toEqual([]);
  });

  it('stays off if June 15 is given another reversal instead of the payment', () => {
    const off = weeksStillOff({
      weeks: [{ week: '2026-06-15', settlementPaid: 7020.5 }],
      movements: [
        { week: '2026-06-15', kind: 'pay', status: 'posted', amount: 7020.5 },
        {
          week: '2026-06-15',
          kind: 'reverse',
          status: 'posted',
          amount: 2565.44,
          reversedKind: 'legacy_tx',
        },
      ],
      extraPays: [],
    });
    expect(off[0]?.gap).toBeCloseTo(-2565.44, 2);
  });
});
