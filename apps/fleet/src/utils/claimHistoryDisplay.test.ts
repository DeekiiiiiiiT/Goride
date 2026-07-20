import { describe, it, expect } from 'vitest';
import {
  extractClaimLinkedTripId,
  getClaimCategoryLabel,
  getClaimLocationDisplay,
  getClaimPlatformDisplay,
} from './claimHistoryDisplay';
import type { Claim, FinancialTransaction, Trip } from '../types/data';

describe('claimHistoryDisplay', () => {
  const uberTrip: Trip = {
    id: 't1',
    platform: 'Uber',
    date: '2026-06-29',
    tollCharges: 275,
    pickupLocation: 'Emerald Cres, Portmore, Jamaica',
  };
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

  it('uses denormalized claim.platform when trip is missing from map', () => {
    const claim: Claim = {
      id: 'c1b',
      type: 'Toll_Refund',
      status: 'Resolved',
      driverId: 'd1',
      tripId: 'missing-trip',
      amount: 10,
      expectedAmount: 285,
      paidAmount: 275,
      subject: 'Toll Refund',
      message: '',
      createdAt: '',
      updatedAt: '',
      resolutionReason: 'Charge Driver',
      platform: 'Uber',
    };
    expect(getClaimPlatformDisplay(claim, null, new Map()).platform).toBe('Uber');
  });

  it('falls back to toll.tripId when claim.tripId is empty', () => {
    const claim: Claim = {
      id: 'c1c',
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
    const toll = { tripId: 't1' } as FinancialTransaction;
    expect(getClaimPlatformDisplay(claim, toll, tripById).platform).toBe('Uber');
  });

  it('reads trip id buried in Unlinked refund subject text', () => {
    const claim: Claim = {
      id: 'c-buried',
      type: 'Toll_Refund',
      status: 'Resolved',
      driverId: 'd1',
      amount: 370,
      expectedAmount: 370,
      paidAmount: 0,
      subject: 'Unlinked refund applied from trip t1',
      message: '',
      createdAt: '',
      updatedAt: '',
      resolutionReason: 'Charge Driver',
      disputeRefundId: 'dr-1',
    };
    // UUID-shaped id for regex path
    const uuid = '9fdfaebb-6a33-4cec-bb65-9d70fd69f381';
    const trip: Trip = {
      id: uuid,
      platform: 'Uber',
      date: '2026-02-23',
      tollCharges: 370,
      pickupLocation: 'Walkway 36, Tuna Ave, Portmore, Jamaica',
    };
    const claimWithUuid: Claim = {
      ...claim,
      subject: `Unlinked refund applied from trip ${uuid}`,
    };
    const map = new Map([[uuid, trip]]);
    expect(extractClaimLinkedTripId(claimWithUuid)).toBe(uuid);
    expect(getClaimPlatformDisplay(claimWithUuid, null, map).platform).toBe('Uber');
    expect(getClaimLocationDisplay(claimWithUuid, null, map)).toBe(
      'Walkway 36, Tuna Ave, Portmore, Jamaica',
    );
  });

  it('falls back to dispute platform when claim/trip links are empty', () => {
    const claim: Claim = {
      id: 'c-dr',
      type: 'Toll_Refund',
      status: 'Resolved',
      driverId: 'd1',
      amount: 370,
      expectedAmount: 370,
      paidAmount: 0,
      subject: 'Toll Underpayment',
      message: '',
      createdAt: '',
      updatedAt: '',
      resolutionReason: 'Charge Driver',
      disputeRefundId: 'dr-1',
    };
    expect(
      getClaimPlatformDisplay(claim, null, new Map(), { disputePlatform: 'Uber' }).platform,
    ).toBe('Uber');
  });

  it('prefers toll plaza over highway vendor / passage receipt', () => {
    const claim: Claim = {
      id: 'c-loc',
      type: 'Toll_Refund',
      status: 'Resolved',
      driverId: 'd1',
      amount: 370,
      expectedAmount: 370,
      paidAmount: 0,
      subject: 'Unlinked refund applied from trip missing',
      message: '',
      createdAt: '',
      updatedAt: '',
      resolutionReason: 'Charge Driver',
    };
    const toll = {
      description: 'Passage receipt',
      vendor: 'TransJamaica Highways',
      metadata: { plaza: 'Portmore West' },
    } as FinancialTransaction;
    expect(getClaimLocationDisplay(claim, toll, new Map())).toBe('Portmore West');
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
