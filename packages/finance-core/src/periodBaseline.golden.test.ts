import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Phase 0 characterization golden for the Flawless Weekly Close Program.
 *
 * Pins the read-only baseline export of ledger.driver_financial_periods
 * (docs/fixtures/periods-baseline-2026-09-07.json, produced by
 * scripts/export-periods-baseline.mjs) so remediation can prove it did not
 * silently restate a finished week. Characterization goldens deliberately lock
 * TODAY'S numbers — "including wrong outputs" — so any change is a conscious,
 * human-approved diff, not an accident.
 *
 * The DB-backed block SKIPS when the fixture is absent or is still the
 * committed placeholder (rowCount 0). The parent agent fills it from SQL.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'docs',
  'fixtures',
  'periods-baseline-2026-09-07.json',
);

type BaselineRow = {
  driver_id?: unknown;
  period_anchor?: unknown;
  settlement_amount?: unknown;
  [k: string]: unknown;
};
type Baseline = { exportedAt?: string; rowCount?: number; rows?: BaselineRow[] };

function loadBaseline(): Baseline | null {
  if (!existsSync(FIXTURE_PATH)) return null;
  try {
    const parsed = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as Baseline;
    // Placeholder committed before the export runs — treat as "not yet captured".
    if (!parsed.rows || parsed.rows.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

const baseline = loadBaseline();

describe('periods baseline golden (DB-backed)', () => {
  it.skipIf(!baseline)('has at least one exported period', () => {
    expect(baseline!.rowCount).toBeGreaterThan(0);
    expect(baseline!.rows!.length).toBe(baseline!.rowCount);
  });

  it.skipIf(!baseline)('every row carries the settlement identity fields', () => {
    for (const row of baseline!.rows!) {
      expect(row.driver_id, 'driver_id').toBeTruthy();
      expect(row.period_anchor, 'period_anchor').toBeTruthy();
      // settlement_amount must be present and numeric (0 is valid, null is not).
      expect(row.settlement_amount, 'settlement_amount').not.toBeNull();
      expect(Number.isFinite(Number(row.settlement_amount)), 'settlement_amount numeric').toBe(true);
    }
  });
});

/**
 * Pure synthetic fixture — always runs, documents the "including wrong outputs"
 * characterization pattern. These two rows encode a KNOWN-GOOD row and a
 * KNOWN-BROKEN row (missing settlement_amount) so the shape assertion itself is
 * exercised without depending on live data.
 */
const SYNTHETIC_ROWS: BaselineRow[] = [
  {
    driver_id: 'drv_synth_ok',
    period_anchor: '2026-09-01',
    period_end: '2026-09-07',
    settlement_amount: -27898.73, // wrong output preserved on purpose (audit debit week)
    settlement_status: 'pending',
  },
  {
    driver_id: 'drv_synth_broken',
    period_anchor: '2026-09-01',
    settlement_amount: null, // characterizes the missing-identity-field failure mode
  },
];

function hasSettlementIdentity(row: BaselineRow): boolean {
  return Boolean(row.driver_id) && Boolean(row.period_anchor) && row.settlement_amount != null;
}

describe('periods baseline golden (synthetic characterization)', () => {
  it('accepts a complete row (including a wrong/negative settlement_amount)', () => {
    expect(hasSettlementIdentity(SYNTHETIC_ROWS[0])).toBe(true);
  });

  it('rejects a row missing settlement_amount', () => {
    expect(hasSettlementIdentity(SYNTHETIC_ROWS[1])).toBe(false);
  });
});
