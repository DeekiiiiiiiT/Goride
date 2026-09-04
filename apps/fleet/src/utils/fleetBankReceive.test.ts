import { describe, it, expect } from 'vitest';
import {
  aggregateExpectedBankByDriverWeek,
  aggregateExpectedBankByWeek,
  aggregateRoamCardExpectedByWeek,
  mergeFleetBankExpectedRows,
  mergeBankReceiveConfirms,
  resolveBankSettledDisplay,
  isOrgBankEvent,
  fleetBankDisplayStatus,
} from './fleetBankReceive';

describe('fleetBankReceive', () => {
  it('aggregates Expected bank by fleet week (prefers org deposit over driver shares)', () => {
    const rows = aggregateExpectedBankByWeek([
      {
        eventType: 'payout_bank',
        driverId: '73dfc14d-3798-4a00-8d86-b2a3eb632f54',
        date: '2026-07-01',
        periodStart: '2026-06-29',
        periodEnd: '2026-07-05',
        netAmount: 48168.32,
        metadata: { source: 'payments_organization', recipient: 'org' },
      },
      {
        eventType: 'payout_bank',
        driverId: 'kenny',
        date: '2026-07-01',
        periodStart: '2026-06-29',
        periodEnd: '2026-07-05',
        netAmount: 48168.32,
        metadata: { source: 'payments_driver', bankRole: 'driver_share' },
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].weekStartYmd).toBe('2026-06-29');
    // Must not double-count org + share
    expect(rows[0].expected).toBeCloseTo(48168.32, 2);
  });

  it('falls back to summing legacy driver payout_bank when no org deposit event', () => {
    const rows = aggregateExpectedBankByWeek([
      {
        eventType: 'payout_bank',
        driverId: 'kenny',
        date: '2026-07-01',
        periodStart: '2026-06-29',
        periodEnd: '2026-07-05',
        netAmount: 1000,
      },
      {
        eventType: 'payout_bank',
        driverId: 'other',
        date: '2026-07-01',
        periodStart: '2026-06-29',
        periodEnd: '2026-07-05',
        netAmount: 250.5,
      },
    ]);
    expect(rows[0].expected).toBeCloseTo(1250.5, 2);
  });

  it('still aggregates per-driver shares for diagnostics (skips org events)', () => {
    const rows = aggregateExpectedBankByDriverWeek(
      [
        {
          eventType: 'payout_bank',
          driverId: 'kenny',
          date: '2026-07-01',
          periodStart: '2026-06-29',
          periodEnd: '2026-07-05',
          netAmount: 1000,
        },
        {
          eventType: 'payout_bank',
          driverId: 'org',
          date: '2026-07-01',
          periodStart: '2026-06-29',
          periodEnd: '2026-07-05',
          netAmount: 9999,
          metadata: { recipient: 'org' },
        },
      ],
      { kenny: 'Kenny' },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].driverId).toBe('kenny');
    expect(rows[0].expected).toBeCloseTo(1000, 2);
  });

  it('merges org-week confirms; dual-reads legacy driver confirms', () => {
    const expected = aggregateExpectedBankByWeek([
      {
        eventType: 'payout_bank',
        driverId: 'org',
        date: '2026-06-30',
        periodStart: '2026-06-29',
        periodEnd: '2026-07-05',
        netAmount: 500,
        metadata: { recipient: 'org' },
      },
    ]);

    const unconfirmed = mergeBankReceiveConfirms(expected, [], 'roam-org-1');
    expect(unconfirmed[0].status).toBe('unconfirmed');
    expect(unconfirmed[0].platform).toBe('uber');
    expect(unconfirmed[0].confirmMethod).toBeNull();

    const orgConfirmed = mergeBankReceiveConfirms(
      expected,
      [
        {
          organizationId: 'roam-org-1',
          weekStartYmd: '2026-06-29',
          status: 'confirmed',
          amountReceived: 500,
          recipient: 'org',
          confirmMethod: 'statement',
          bankDateYmd: '2026-06-30',
          statementFileName: 'june.PDF',
        },
      ],
      'roam-org-1',
    );
    expect(orgConfirmed[0].status).toBe('confirmed');
    expect(orgConfirmed[0].amountReceived).toBe(500);
    expect(orgConfirmed[0].confirmMethod).toBe('statement');
    expect(orgConfirmed[0].bankDateYmd).toBe('2026-06-30');
    expect(orgConfirmed[0].statementFileName).toBe('june.PDF');
    expect(fleetBankDisplayStatus(orgConfirmed[0])).toBe('statement_matched');

    const legacyConfirmed = mergeBankReceiveConfirms(
      expected,
      [
        {
          driverId: 'kenny-uuid',
          weekStartYmd: '2026-06-29',
          status: 'confirmed',
          amountReceived: 480,
        },
      ],
      'roam-org-1',
    );
    expect(legacyConfirmed[0].status).toBe('confirmed');
    expect(legacyConfirmed[0].amountReceived).toBe(480);
    expect(legacyConfirmed[0].confirmMethod).toBe('manual');
    expect(fleetBankDisplayStatus(legacyConfirmed[0])).toBe('manual_confirmed');
  });

  it('gates Settlement Bank Settled on org-week confirm but shows driver share amount', () => {
    expect(
      resolveBankSettledDisplay({
        driverId: 'kenny',
        weekStartYmd: '2026-06-29',
        ledgerBankSettled: 12000,
        organizationId: 'roam-org-1',
        confirms: [
          {
            organizationId: 'roam-org-1',
            weekStartYmd: '2026-06-29',
            status: 'confirmed',
            amountReceived: 48168.32,
            recipient: 'org',
          },
        ],
      }),
    ).toEqual({ kind: 'confirmed', amount: 12000 });

    expect(
      resolveBankSettledDisplay({
        driverId: 'kenny',
        weekStartYmd: '2026-07-06',
        ledgerBankSettled: 1200,
        organizationId: 'roam-org-1',
        confirms: [],
      }),
    ).toEqual({ kind: 'pending' });
  });

  it('identifies org bank events', () => {
    expect(
      isOrgBankEvent({
        eventType: 'payout_bank',
        metadata: { source: 'payments_organization', recipient: 'org' },
      }),
    ).toBe(true);
    expect(
      isOrgBankEvent({
        eventType: 'payout_bank',
        metadata: { bankRole: 'driver_share' },
      }),
    ).toBe(false);
  });

  it('keeps Uber wire and Roam card as separate Expected rows (no sum)', () => {
    const uber = aggregateExpectedBankByWeek([
      {
        eventType: 'payout_bank',
        date: '2026-06-08',
        netAmount: 13689.21,
        metadata: { source: 'payments_organization', recipient: 'org' },
      },
      {
        eventType: 'payout_bank',
        date: '2026-06-15',
        netAmount: 35957.56,
        metadata: { source: 'payments_organization', recipient: 'org' },
      },
    ]);
    const roam = aggregateRoamCardExpectedByWeek([
      {
        platform: 'Roam',
        paymentMethod: 'Card',
        status: 'Completed',
        date: '2026-06-11',
        amount: 595.32,
        bankTransferred: 595.32,
      },
      {
        platform: 'Roam',
        paymentMethod: 'Card',
        status: 'Completed',
        date: '2026-06-12',
        amount: 653.66,
        bankTransferred: 653.66,
      },
      {
        platform: 'Roam',
        paymentMethod: 'Card',
        status: 'Completed',
        date: '2026-06-15',
        amount: 1953.58,
        bankTransferred: 1953.58,
      },
      {
        platform: 'Roam',
        paymentMethod: 'Card',
        status: 'Completed',
        date: '2026-06-17',
        amount: 2068.09,
        bankTransferred: 2068.09,
      },
    ]);
    const merged = mergeFleetBankExpectedRows(uber, roam);
    expect(
      merged.map((r) => [r.weekStartYmd, r.platform, r.expected]),
    ).toEqual([
      ['2026-06-15', 'roam', 4021.67],
      ['2026-06-15', 'uber', 35957.56],
      ['2026-06-08', 'roam', 1248.98],
      ['2026-06-08', 'uber', 13689.21],
    ]);

    const withConfirms = mergeBankReceiveConfirms(
      merged,
      [
        {
          organizationId: 'roam-org-1',
          weekStartYmd: '2026-06-08',
          status: 'confirmed',
          amountReceived: 13689.21,
          recipient: 'org',
          platform: 'uber',
          confirmMethod: 'statement',
          bankDateYmd: '2026-06-16',
        },
      ],
      'roam-org-1',
    );
    const jun8Uber = withConfirms.find(
      (r) => r.weekStartYmd === '2026-06-08' && r.platform === 'uber',
    );
    const jun8Roam = withConfirms.find(
      (r) => r.weekStartYmd === '2026-06-08' && r.platform === 'roam',
    );
    expect(jun8Uber?.status).toBe('confirmed');
    expect(jun8Uber?.variance).toBeCloseTo(0, 2);
    expect(jun8Roam?.status).toBe('unconfirmed');
  });
});
