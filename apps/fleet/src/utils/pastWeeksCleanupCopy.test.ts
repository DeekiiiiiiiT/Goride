import { describe, expect, it } from 'vitest';
import { formatMoney } from '../components/business-finance/money';
import {
  bannerLabel,
  cleanupProgress,
  openCloseWeeksFromStatus,
  correctionHistoryNote,
  correctionLineReason,
  fuelSummaryRows,
  keptRepairCopy,
  landingWeekBlock,
  legacyFooter,
  outlookSentence,
  owesPhrase,
  payoutSummary,
  plainCorrectionBlock,
  writeOffReasonOk,
} from './pastWeeksCleanupCopy';

describe('past weeks cleanup wording', () => {
  it('says who owes whom without a bare minus', () => {
    expect(owesPhrase(-13623.48, 'Kenny')).toBe(`Kenny owes ${formatMoney(13623.48)}`);
    expect(owesPhrase(5586.73, 'Kenny')).toBe(`You owe Kenny ${formatMoney(5586.73)}`);
    expect(owesPhrase(-13623.48, 'Kenny')).not.toMatch(/-/);
    expect(owesPhrase(5586.73, 'Kenny')).toBe(`You owe Kenny ${formatMoney(5586.73)}`);
  });

  it('summarises the audited correction buckets and the open-week outlook', () => {
    const lines = [
      ...Array.from({ length: 24 }, (_, index) => {
        const day = new Date(Date.UTC(2026, 0, 19) + index * 7 * 86400000);
        return { sourceWeek: day.toISOString().slice(0, 10), amount: 5000 };
      }),
      { sourceWeek: '2026-07-27', amount: 24113.96 },
      { sourceWeek: '2026-08-03', amount: -7040.65 },
      { sourceWeek: '2026-08-10', amount: -19810.51 },
      { sourceWeek: '2026-08-17', amount: -12116.67 },
      { sourceWeek: '2026-08-24', amount: -28731.46 },
      { sourceWeek: '2026-08-31', amount: -9399.52 },
    ];
    const summary = fuelSummaryRows(lines, -13191.88, 'Kenny');
    expect(summary.buckets.early).toBe(144113.96);
    expect(summary.buckets.august).toBe(-77098.81);
    expect(summary.buckets.net).toBe(53823.27);
    expect(summary.rows[0].phrase).toBe(`You owe Kenny ${formatMoney(144113.96)}`);
    expect(summary.rows[1].phrase).toBe(`Kenny owes ${formatMoney(77098.81)}`);
    expect(summary.rows[2].phrase).toBe(`Kenny owes ${formatMoney(13191.88)}`);
    expect(summary.rows[3].phrase).toBe(`You owe Kenny ${formatMoney(53823.27)}`);
    expect(summary.rows.map((row) => row.phrase).join(' ')).not.toMatch(/-/);

    expect(outlookSentence({
      weeks: [
        { week: '2025-12-08', amount: -66646.59 },
        { week: '2025-12-15', amount: 0 },
        { week: '2025-12-22', amount: 0 },
        { week: '2025-12-29', amount: 0 },
        { week: '2026-01-05', amount: 0 },
        { week: '2026-01-12', amount: 0 },
      ],
      actions: ['carry', 'carry', 'carry', 'carry', 'carry', 'carry'],
      correctionHistoryNet: 67015.15,
      driverName: 'Kenny',
    })).toBe(
      `If you keep all six older weeks, they roughly cancel the fuel corrections. The open week moves by about ${formatMoney(368.56)} that you owe Kenny.`,
    );
    expect(legacyFooter({
      weeks: [{ amount: -66646.59 }],
      actions: ['carry'],
      driverName: 'Kenny',
    })).toBe(`Keeping: Kenny owes ${formatMoney(66646.59)} → added to this week. Writing off: ${formatMoney(0)}.`);
  });

  it('uses the driver name instead of he or his', () => {
    expect(plainCorrectionBlock(
      'The Oct 12 amount he owes is not on the open week yet.',
      'Kenny',
    )).toBe('The Oct 12 amount Kenny owes is not on the open week yet, so corrections cannot be posted.');
    expect(correctionLineReason(-10, 'Kenny')).toBe("Credited gas-card fuel Kenny didn't pay");
    expect(correctionLineReason(10, 'Kenny')).toBe('Fuel charged twice');
    expect(correctionHistoryNote()).toContain(formatMoney(67015.15));
    expect(correctionHistoryNote()).not.toMatch(/\bhe\b|\bhis\b/i);
    expect(landingWeekBlock('2026-10-26')).toMatch(/Oct 19/);
    expect(landingWeekBlock('2026-10-26')).toMatch(/Oct 26/);
    expect(landingWeekBlock('2026-10-19')).toBeNull();
    expect(bannerLabel('Kenny', 1)).toBe('Past-week clean-up for Kenny · Step 1 of 4: Older weeks');
    expect(payoutSummary(8, 15715.16, 'Kenny')).toContain(formatMoney(15715.16));
    expect(writeOffReasonOk('no')).toBe(false);
    expect(writeOffReasonOk('done')).toBe(true);
    expect(writeOffReasonOk('before the books')).toBe(true);
    expect(keptRepairCopy('Kenny', [
      { week: '2025-12-29', keep: -11714.75 },
      { week: '2026-01-12', keep: 2601.61 },
    ], -9113.14)).toContain(`Together, Kenny owes ${formatMoney(9113.14)} on the open week.`);
  });

  it('follows the server step and the server list of weeks still open', () => {
    expect(cleanupProgress(1, false)).toBe(1);
    expect(cleanupProgress(2, false)).toBe(2);
    expect(cleanupProgress('done', false)).toBe(5);
    expect(cleanupProgress(4, true)).toBe(5);
    expect(openCloseWeeksFromStatus({
      openCloseWeeks: ['2026-09-07', '2026-09-21'],
      nextCloseWeek: '2026-09-07',
    })).toEqual(['2026-09-07', '2026-09-21']);
    expect(openCloseWeeksFromStatus({ openCloseWeeks: [], nextCloseWeek: '2026-09-07' })).toEqual([]);
    expect(openCloseWeeksFromStatus({ nextCloseWeek: '2026-09-14' })).toEqual([
      '2026-09-14',
      '2026-09-21',
      '2026-09-28',
      '2026-10-05',
    ]);
  });
});
