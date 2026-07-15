/**
 * Wallet week cards must stay cash-collection only (no Bank Settled / Settlement UI).
 * Settlement math remains on Financials; Fleet Financials owns bank receive confirms.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const dir = join(__dirname);

describe('Cash Wallet UI — cash desk only', () => {
  it('WeeklySettlementView does not render Bank Settled or Settlement amount UI', () => {
    const src = readFileSync(join(dir, 'WeeklySettlementView.tsx'), 'utf8');
    expect(src).not.toMatch(/Bank Settled/);
    expect(src).not.toMatch(/SettlementPeriodDetail/);
    expect(src).not.toMatch(/Cash Still Held/);
    expect(src).not.toMatch(/Awaiting Cash/);
    expect(src).toMatch(/Passenger Cash|passenger cash|Collection/i);
  });

  it('CashWalletWeekDetail does not render Bank Settled or Settlement still-held block', () => {
    const src = readFileSync(join(dir, 'CashWalletWeekDetail.tsx'), 'utf8');
    expect(src).not.toMatch(/Bank Settled/);
    expect(src).not.toMatch(/Still Held/);
    expect(src).not.toMatch(/Settlement \(Financials\)/);
  });
});
