import { describe, expect, it } from 'vitest';
import { createEmptyStatementSummary } from '../types/statementSummary';
import { buildEarningsOverlayModel } from './buildEarningsOverlayModel';

describe('buildEarningsOverlayModel', () => {
  it('aggregates All and builds platform expand lines', () => {
    const roam = createEmptyStatementSummary('Roam', '2026-09-01', '2026-09-07');
    roam.totalEarnings = 100;
    roam.netFare = 90;
    roam.tips = 10;
    roam.cashCollected = 40;
    roam.bankTransfer = 50;
    roam.totalPayout = 90;
    roam.tripCount = 2;

    const uber = createEmptyStatementSummary('Uber', '2026-09-01', '2026-09-07');
    uber.totalEarnings = 200;
    uber.netFare = 180;
    uber.promotions = 10;
    uber.tips = 10;
    uber.totalRefundsExpenses = 5;
    uber.uberTollCredits = 3;
    uber.platformTollCredits = 3;
    uber.bankTransfer = 150;
    uber.totalPayout = 150;
    uber.tripCount = 4;

    const model = buildEarningsOverlayModel([roam, uber], 'all');
    expect(model.summary?.totalEarnings).toBe(300);
    expect(model.earningsLines.some((l) => l.label === 'Net fare' && l.value === 270)).toBe(true);
    expect(model.earningsLines.some((l) => l.label === 'Roam total')).toBe(true);
    expect(model.earningsLines.some((l) => l.label === 'Uber total')).toBe(true);
    expect(model.platformStrip.map((p) => p.platform)).toEqual(['Roam', 'Uber']);
    expect(model.refundsLines.some((l) => l.muted && l.label.includes('credits'))).toBe(true);
    expect(model.payoutLines.some((l) => l.label === 'Cash collected' && l.value === 40)).toBe(true);
  });

  it('filters to a single platform', () => {
    const roam = createEmptyStatementSummary('Roam', '2026-09-01', '2026-09-07');
    roam.totalEarnings = 100;
    roam.netFare = 100;
    const uber = createEmptyStatementSummary('Uber', '2026-09-01', '2026-09-07');
    uber.totalEarnings = 200;
    uber.netFare = 200;

    const model = buildEarningsOverlayModel([roam, uber], 'Uber');
    expect(model.isAll).toBe(false);
    expect(model.summary?.totalEarnings).toBe(200);
    expect(model.platformStrip).toEqual([]);
    expect(model.earningsLines.some((l) => l.label === 'Roam total')).toBe(false);
  });
});
