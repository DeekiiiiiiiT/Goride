import { describe, it, expect } from 'vitest';
import { getClaimCategoryLabel, getClaimPlatformDisplay } from './claimHistoryDisplay';
import type { Claim, FinancialTransaction, Trip } from '../types/data';

describe('claimHistoryDisplay', () => {
  const uberTrip: Trip = { id: 't1', platform: 'Uber', date: '2026-06-29', tollCharges: 275 };
  const tripById = new Map([['t1', uberTrip]]);

  it('shows Uber platform from matched trip', () => {
    const claim: Claim = {
      id: 'c1',
      type: 'Toll_Refund',
      status: 'Resolved',
      driverId: 'd1',
      tripId: 't1',
      amount: 10,
      expectedAmount: 285,
      paidAmount: 275,
      subject: 'Toll Refund',
      message: '',
      createdAt: '',
      updatedAt: '',
      resolutionReason: 'Charge Driver',
    };
    expect(getClaimPlatformDisplay(claim, null, tripById).platform).toBe('Uber');
  });

  it('labels Toll_Refund as Underpaid even when workflowStage says personal_use_resolved', () => {
    const claim: Claim = {
      id: 'c2',
      type: 'Toll_Refund',
      status: 'Resolved',
      driverId: 'd1',
      amount: 10,
      expectedAmount: 285,
      paidAmount: 275,
      subject: 'Toll Refund',
      message: '',
      createdAt: '',
      updatedAt: '',
      resolutionReason: 'Charge Driver',
    };
    const toll = { workflowStage: 'personal_use_resolved' } as FinancialTransaction;
    expect(getClaimCategoryLabel(claim, toll)).toBe('Underpaid');
  });

  it('labels personal resolve claims as Personal', () => {
    const claim: Claim = {
      id: 'c3',
      type: 'Toll',
      status: 'Resolved',
      driverId: 'd1',
      amount: 380,
      expectedAmount: 380,
      paidAmount: 0,
      subject: 'Unmatched Toll - Personal Use',
      message: '',
      createdAt: '',
      updatedAt: '',
      resolutionReason: 'Charge Driver',
    };
    expect(getClaimCategoryLabel(claim, null)).toBe('Personal');
  });
});
