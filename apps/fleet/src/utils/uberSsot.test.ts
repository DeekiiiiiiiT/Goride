import { describe, expect, it } from 'vitest';
import { parseUberDriverStatementSsot } from './uberSsot';

describe('parseUberDriverStatementSsot', () => {
  it('uses explicit Total Earnings : Net Fare when present', () => {
    const row = {
      'Total Earnings': 100,
      'Total Earnings:Tip': 10,
      'Total Earnings : Promotions': 5,
      'Refunds & Expenses': 0,
      'Total Earnings : Net Fare': 81_361.5,
    };
    const s = parseUberDriverStatementSsot(row);
    expect(s.statementNetFare).toBe(81_361.5);
    expect(s.fareComponents).toBe(85); // 100 - 5 - 10
  });

  it('falls back to derived fareComponents when net fare column absent', () => {
    const row = {
      'Total Earnings': 100,
      'Total Earnings:Tip': 10,
      'Total Earnings : Promotions': 5,
      'Refunds & Expenses': 2,
    };
    const s = parseUberDriverStatementSsot(row);
    expect(s.statementNetFare).toBe(85);
    expect(s.fareComponents).toBe(85);
  });
});
