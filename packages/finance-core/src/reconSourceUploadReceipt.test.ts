import { describe, expect, it } from 'vitest';
import {
  formatCoverageRangeShort,
  formatUploadReceiptLine,
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

describe('formatCoverageRangeShort', () => {
  it('collapses same-month ranges', () => {
    expect(formatCoverageRangeShort('2026-11-09', '2026-11-15')).toBe('9–15 Nov');
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