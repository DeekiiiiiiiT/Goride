import { describe, expect, it } from 'vitest';
import { countProblems, importRowStatusLabel, resultLineForKind } from './tollV2ImportReportFormat';
import type { TollV2ImportReport } from './tollV2ImportTypes';

const rep = (r: Partial<TollV2ImportReport>): TollV2ImportReport => r as TollV2ImportReport;

describe('normal read outcomes are not problems', () => {
  it('duplicate / after_seal / corrected / correction_pending need no fix; a copy is not counted twice', () => {
    const r = rep({
      rows: 5,
      counts: { new: 1 },
      report: [
        { row: 1, status: 'new', amount_minor: 10000 },
        { row: 2, status: 'duplicate', amount_minor: 10000 },
        { row: 3, status: 'after_seal', amount_minor: 20000 },
        { row: 4, status: 'corrected', amount_minor: 30000 },
        { row: 5, status: 'correction_pending', amount_minor: 40000 },
      ],
    });
    expect(countProblems(r)).toBe(0);
    for (const row of r.report ?? []) expect(importRowStatusLabel(row)).not.toMatch(/^Problem:/);
    expect(resultLineForKind('tag_statement', r)).toBe('1 tolls read · J$100.00 · 0 problems');
  });
});

describe('resultLineForKind', () => {
  it('sums the used tag rows, not the rejected ones', () => {
    const line = resultLineForKind('tag_statement', rep({
      rows: 3,
      counts: { new: 2, rejected: 1 },
      report: [
        { row: 1, status: 'new', amount_minor: 37000 },
        { row: 2, status: 'new', amount_minor: 27500 },
        { row: 3, status: 'rejected', reason: 'bad row', amount_minor: 99900 },
      ],
    }));
    expect(line).toBe('2 tolls read · J$645.00 · 1 problems');
  });

  it('leaves the amount out for a report saved without amounts', () => {
    const line = resultLineForKind('tag_statement', rep({
      rows: 2, counts: { new: 2 }, report: [{ row: 1, status: 'new' }, { row: 2, status: 'new' }],
    }));
    expect(line).toBe('2 tolls read · 0 problems');
    expect(line).not.toContain('J$0.00');
  });

  it('one top-up reads in the singular', () => {
    const line = resultLineForKind('topups', rep({
      rows: 1, counts: { new: 1 }, report: [{ row: 1, status: 'new', amount_minor: 500000 }],
    }));
    expect(line).toBe('1 top-up read · J$5,000.00');
  });

  it('Uber: trips read and only paid-back trips as paybacks', () => {
    const line = resultLineForKind('uber', rep({
      rows: 3,
      counts: { new: 2, trip_only: 1 },
      report: [
        { row: 1, status: 'trip_only', amount_minor: 0 },
        { row: 2, status: 'new', amount_minor: 37000 },
        { row: 3, status: 'new', amount_minor: 27500 },
      ],
    }));
    expect(line).toBe('3 trips read · 2 toll paybacks · J$645.00');
  });
});
