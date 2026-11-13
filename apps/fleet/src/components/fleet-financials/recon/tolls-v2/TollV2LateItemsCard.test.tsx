import { describe, expect, it } from 'vitest';
import { lateItemCopy } from './TollV2LateItemsCard';

describe('lateItemCopy', () => {
  it('a late payback shows the trip day and times, never its reference', () => {
    const c = lateItemCopy({
      kind: 'late_payback',
      id: 'p1',
      version: 1,
      at: '2026-08-27',
      amountMinor: 37000,
      reference: 'trip:5e1f0000-aaaa-4bbb-8ccc-000000000002',
      trip: {
        tripId: '5e1f0000-aaaa-4bbb-8ccc-000000000002',
        requestAt: '2026-08-28T01:50:00+00:00',
        dropoffAt: '2026-08-28T02:28:00+00:00',
        paymentMethod: 'card',
      },
    });
    expect(c.title).toBe('A payback that came in late · J$370.00');
    expect(c.sub).toBe('27 Aug · Uber trip 8:50 PM–9:28 PM · card · paid back J$370.00');
    expect(`${c.title} ${c.sub}`).not.toContain('5e1f0000');
  });

  it('a late cash toll says the driver sent it, with the date', () => {
    const c = lateItemCopy({
      kind: 'late_charge',
      id: 'c1',
      version: 1,
      at: '2026-08-28T12:40:00+00:00',
      amountMinor: 27500,
      paidBy: 'cash',
      plazaName: 'Spanish Town West',
    });
    expect(c.title).toBe('A cash toll the driver sent late · 28 Aug, 7:40 AM · Spanish Town West · J$275.00');
  });

  it('a late tag toll says the provider sent it', () => {
    const c = lateItemCopy({
      kind: 'late_charge', id: 'c2', version: 1, at: '2026-08-28T12:40:00+00:00', amountMinor: 37000, paidBy: 'tag', plazaName: 'Portmore East',
    });
    expect(c.title.startsWith('A toll the provider sent late · 28 Aug, 7:40 AM')).toBe(true);
  });
});
