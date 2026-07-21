/**
 * Contract: Expense Hub must never call Fuel/Toll writers or change their event shapes.
 * Golden stubs assert the public writer entrypoints remain the only posting path.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');

function readSrc(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}

describe('Expense Hub Fuel/Toll preservation', () => {
  it('expense hub journal never imports fuel or toll writers', () => {
    const src = readSrc('utils/expenseHubJournal.ts');
    expect(src).not.toMatch(/appendCanonicalFuel|appendCanonicalToll|settleToll|buildCanonicalFuel|buildCanonicalToll/);
    expect(src).not.toMatch(/from ['"].*fuel/i);
    expect(src).not.toMatch(/from ['"].*toll/i);
  });

  it('expense hub types do not redefine fuel/toll event types', () => {
    const src = readSrc('types/expenseHub.ts');
    expect(src).not.toMatch(/fuel_purchase|toll_charge|wallet_credit/);
  });

  it('canonical fuel/toll builders remain in canonical_from_ops', () => {
    const src = readSrc('supabase/functions/server/canonical_from_ops.ts');
    expect(src).toMatch(/buildCanonicalFuelExpenseEvent/);
    expect(src).toMatch(/appendCanonicalFuelExpenseIfEligible/);
    expect(src).toMatch(/buildCanonicalTollEventFromTollLedger/);
    expect(src).toMatch(/appendCanonicalTollIfEligible/);
  });

  it('expense hub architecture ADR forbids rewriting Fuel/Toll', () => {
    const adr = readSrc('docs/expense-hub-architecture.md');
    expect(adr).toMatch(/Fuel, Toll/);
    expect(adr).toMatch(/never called from the Hub/);
    expect(adr).toMatch(/expense_hub_v1/);
  });
});
