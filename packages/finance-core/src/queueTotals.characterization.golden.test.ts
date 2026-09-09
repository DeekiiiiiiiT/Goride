/**
 * After Phase 2 C-4 — documents that page sum ≠ query total; live endpoint must use aggregates.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(
  __dirname,
  '..',
  '..',
  '..',
  'docs',
  'fixtures',
  'queue-totals-characterization.json',
);

type QueueFixture = {
  pageRowsAmountOwedMinor: number[];
  expectedBuggyTotalsAmountOwedMinor: number;
  expectedCorrectTotalsAmountOwedMinor: number;
  status?: string;
};

describe('queue totals (C-4)', () => {
  it('page sum differs from full-query total; fixture marks fix', () => {
    expect(existsSync(FIXTURE)).toBe(true);
    const f = JSON.parse(readFileSync(FIXTURE, 'utf8')) as QueueFixture;
    const pageSum = f.pageRowsAmountOwedMinor.reduce((a, b) => a + b, 0);
    expect(pageSum).toBe(f.expectedBuggyTotalsAmountOwedMinor);
    expect(f.expectedCorrectTotalsAmountOwedMinor).toBeGreaterThan(pageSum);
    expect(f.status).toBe('fixed');
  });
});
