import { describe, expect, it } from 'vitest';
import {
  coverageHasAttestDataConflict,
  formatCashTollsDriverWeekLine,
  formatCoverageRangeShort,
  formatIndriveLoggedDayLine,
  formatUploadReceiptLine,
  reconAttestDataConflictLine,
  sourceCardSubtitle,
} from './reconSourceUploadReceipt.ts';

describe('formatUploadReceiptLine', () => {
  it('formats time, name, rows and date range', () => {
    const line = formatUploadReceiptLine(
      {
        uploadedAt: '2026-11-17T19:36:44.000Z',
        fileName: 'kenny-timeline.csv',
        rowCount: 550,
        coverageStart: '2026-11-09',
        coverageEnd: '2026-11-15',
      },
      'America/Jamaica',
    );
    expect(line).toContain('Uploaded');
    expect(line).toContain('kenny-timeline.csv');
    expect(line).toContain('550 rows');
    expect(line).toContain('9–15 Nov');
  });
});

describe('formatIndriveLoggedDayLine', () => {
  it('formats weekday, trip count and J$ total (WRA-71)', () => {
    expect(
      formatIndriveLoggedDayLine({ day: '2026-11-15', tripCount: 8, amountMajor: 10650 }),
    ).toBe('Sun 15 · 8 trips logged · J$10,650');
  });
});

describe('formatCoverageRangeShort', () => {
  it('collapses same-month ranges', () => {
    expect(formatCoverageRangeShort('2026-11-09', '2026-11-15')).toBe('9–15 Nov');
  });
});

describe('formatCashTollsDriverWeekLine', () => {
  it('shows none when no tolls', () => {
    expect(formatCashTollsDriverWeekLine(0, 0)).toBe('None logged by the driver');
  });

  it('shows count and J$ total', () => {
    expect(formatCashTollsDriverWeekLine(2, 55000)).toBe('2 cash tolls logged by driver · J$550');
  });
});

describe('attest vs data conflict', () => {
  it('detects covered_over_attest', () => {
    expect(coverageHasAttestDataConflict({ week: 'covered_over_attest' })).toBe(true);
    expect(coverageHasAttestDataConflict({ '2026-11-09': 'covered' })).toBe(false);
  });

  it('has stable copy', () => {
    expect(reconAttestDataConflictLine()).toBe('Marked no activity, but data arrived');
  });
});

describe('sourceCardSubtitle', () => {
  const receipt = {
    uploadedAt: '2026-11-17T19:36:44.000Z',
    fileName: 'f.csv',
    rowCount: 0,
    coverageStart: '2026-11-09',
    coverageEnd: '2026-11-15',
  };

  it('shows checking while calculator pending', () => {
    expect(
      sourceCardSubtitle({
        status: 'missing',
        lastUpload: receipt,
        pendingUnits: 2,
      }),
    ).toBe('Uploaded — checking…');
  });

  it('shows missing days after publish', () => {
    expect(
      sourceCardSubtitle({
        status: 'missing',
        lastUpload: receipt,
        pendingUnits: 0,
        uncoveredDayLabels: 'Mon, Tue',
      }),
    ).toBe('Uploaded, but nothing for Mon, Tue');
  });
});