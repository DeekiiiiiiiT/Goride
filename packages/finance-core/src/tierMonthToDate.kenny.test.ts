import { describe, expect, it } from 'vitest';
import { computeWeekCommissionShare } from './periodShareCash.ts';
import { previewTierMonthToDateCorrections } from './tierMonthToDateCorrectionPreview.ts';
import { periodEndForAnchor } from './periodKey.ts';
import type { LedgerFareLike } from './periodShareCash.ts';

/** Live High Performer bands (Kenny Gregory Rattray). */
const KENNY_HIGH_PERFORMER_TIERS = [
  { id: 'bronze', name: 'Bronze', minEarnings: 0, maxEarnings: 75000, sharePercentage: 25 },
  { id: 'silver', name: 'Silver', minEarnings: 75001, maxEarnings: 150000, sharePercentage: 27 },
  { id: 'gold', name: 'Gold', minEarnings: 150001, maxEarnings: 225000, sharePercentage: 29 },
  { id: 'platinum', name: 'Platinum', minEarnings: 225001, maxEarnings: 300000, sharePercentage: 31 },
  { id: 'diamond', name: 'Diamond', minEarnings: 300001, maxEarnings: 375000, sharePercentage: 33 },
  { id: 'boss', name: 'Boss', minEarnings: 375001, maxEarnings: 1000000, sharePercentage: 35 },
];

const OCT_WEEK_GROSS = {
  '2026-10-05': 83765.76,
  '2026-10-12': 54380.77,
  '2026-10-19': 88407.8,
  '2026-10-26': 96828.39,
} as const;

/** Sep 28 week fares on 1–4 Oct that must not count toward October tier MTD. */
const SEP28_STRADDLE_OCT = 61674.55;

function midWeekDay(anchor: string): string {
  const [y, m, d] = anchor.split('-').map(Number);
  const local = new Date(y, m - 1, d, 12, 0, 0);
  local.setDate(local.getDate() + 2);
  const yy = local.getFullYear();
  const mm = String(local.getMonth() + 1).padStart(2, '0');
  const dd = String(local.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function buildKennyOctoberLedger(): LedgerFareLike[] {
  const entries: LedgerFareLike[] = [];
  for (const [anchor, gross] of Object.entries(OCT_WEEK_GROSS)) {
    entries.push({ date: midWeekDay(anchor), eventType: 'fare_earning', grossAmount: gross });
  }
  entries.push({ date: '2026-10-01', eventType: 'fare_earning', grossAmount: SEP28_STRADDLE_OCT });
  return entries;
}

function shareForWeek(anchor: string, fareEntries: LedgerFareLike[]) {
  const periodEnd = periodEndForAnchor(anchor);
  return computeWeekCommissionShare({
    fareEntries,
    periodAnchor: anchor,
    periodEnd,
    tiers: KENNY_HIGH_PERFORMER_TIERS,
    timezone: 'America/Jamaica',
  });
}

describe('WRA-66 Kenny October 2026 tier MTD (live grosses)', () => {
  const ledger = buildKennyOctoberLedger();

  it('5 Oct → 27%', () => {
    const r = shareForWeek('2026-10-05', ledger);
    expect(r.driverSharePercent).toBe(27);
  });

  it('12 Oct → 27%', () => {
    const r = shareForWeek('2026-10-12', ledger);
    expect(r.driverSharePercent).toBe(27);
  });

  it('19 Oct → 31%', () => {
    const r = shareForWeek('2026-10-19', ledger);
    expect(r.driverSharePercent).toBe(31);
  });

  it('26 Oct → 33% and driver share 31,953.37 on 96,828.39 gross', () => {
    const r = shareForWeek('2026-10-26', ledger);
    expect(r.grossRevenue).toBe(96828.39);
    expect(r.driverSharePercent).toBe(33);
    expect(r.driverShare).toBe(31953.37);
  });

  it('Sep 28 anchor week keeps September tier (straddle Oct 1–4 stays in Sep MTD)', () => {
    const sepLedger: LedgerFareLike[] = [
      { date: '2026-09-28', eventType: 'fare_earning', grossAmount: 50000 },
      { date: '2026-10-01', eventType: 'fare_earning', grossAmount: SEP28_STRADDLE_OCT },
    ];
    const r = shareForWeek('2026-09-28', sepLedger);
    expect(r.grossRevenue).toBe(50000 + SEP28_STRADDLE_OCT);
    const oct = shareForWeek('2026-10-05', [...sepLedger, ...ledger]);
    expect(oct.driverSharePercent).toBe(27);
  });
});

describe('WRA-66 tier correction preview', () => {
  const ledger = buildKennyOctoberLedger();

  it('12 Oct closed week: Kenny overpaid 1,087.62 at 29% vs 27%', () => {
    const anchor = '2026-10-12';
    const gross = OCT_WEEK_GROSS[anchor];
    const paidShare = gross * 0.29;
    const rows = previewTierMonthToDateCorrections(
      [
        {
          periodAnchor: anchor,
          periodEnd: periodEndForAnchor(anchor),
          grossRevenue: gross,
          paidDriverSharePercent: 29,
          paidDriverShare: paidShare,
          fareEntries: ledger,
          closed: true,
        },
      ],
      KENNY_HIGH_PERFORMER_TIERS,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].periodAnchor).toBe(anchor);
    expect(rows[0].oldPercent).toBe(29);
    expect(rows[0].newPercent).toBe(27);
    expect(rows[0].overUnderPaid).toBeCloseTo(1087.62, 1);
  });
});