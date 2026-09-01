import { describe, expect, it } from 'vitest';
import { checkPeriodVsLedgerEvents } from './periodLedgerRecon.ts';

describe('periodLedgerRecon', () => {
  it('flags fuel_deduction drift vs events', () => {
    const drifts = checkPeriodVsLedgerEvents(
      {
        driver_id: 'd1',
        period_anchor: '2026-08-04',
        fuel_deduction: 500,
      },
      [{ event_type: 'fuel_deduction', amount_minor: 30000 }],
    );
    expect(drifts.some((d) => d.kind === 'ledger_fuel_deduction')).toBe(true);
  });
});
