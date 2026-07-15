/**
 * Cash Wallet: cash owed + Cash Returned only — no fake “unlogged” passenger−returned debt.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const dir = join(__dirname);

describe('Cash Wallet UI — cash owed only', () => {
  it('WeeklySettlementView shows cash still owed and never Not yet logged', () => {
    const src = readFileSync(join(dir, 'WeeklySettlementView.tsx'), 'utf8');
    expect(src).not.toMatch(/from ['\"].*SettlementPeriodDetail/);
    expect(src).not.toMatch(/Not yet logged/);
    expect(src).not.toMatch(/currency:\s*['\"]USD['\"]/);
    expect(src).toMatch(/Cash still owed/);
    expect(src).toMatch(/callOutstandingByMonday/);
  });

  it('CashWalletWeekDetail shows add/subtract cash breakdown', () => {
    const src = readFileSync(join(dir, 'CashWalletWeekDetail.tsx'), 'utf8');
    expect(src).not.toMatch(/Not yet logged/);
    expect(src).not.toMatch(/from ['\"].*SettlementPeriodDetail/);
    expect(src).toMatch(/Why this cash is owed/);
    expect(src).toMatch(/Passenger cash/);
    expect(src).toMatch(/Fleet fuel credit/);
    expect(src).toMatch(/Cash toll credit/);
    expect(src).toMatch(/Cash still held/);
    expect(src).toMatch(/Net payout/);
    expect(src).toMatch(/Cash still owed/);
  });
});

