import { describe, expect, it } from 'vitest';
import { getDriverPortalTripEarnings, getTripGrossRevenue } from './tripEarnings';
import type { Trip } from '../types/data';

describe('getTripGrossRevenue', () => {
  it('Uber: uses fare components only (excludes tips/promos/refunds)', () => {
    const trip = {
      platform: 'Uber',
      amount: 1000,
      uberFareComponents: 800,
      uberTips: 50,
      uberPromotionsAmount: 20,
      uberRefundExpenseAmount: 10,
    } as Trip;
    expect(getTripGrossRevenue(trip)).toBe(800);
    // Portal includes tips+promos−refunds → different from gross
    expect(getDriverPortalTripEarnings(trip)).toBe(860);
  });

  it('Uber without fare components: amount minus tips and prior adj', () => {
    const trip = {
      platform: 'Uber',
      amount: 1000,
      uberFareComponents: 0,
      uberTips: 100,
      uberPriorPeriodAdjustment: 50,
    } as Trip;
    expect(getTripGrossRevenue(trip)).toBe(850);
  });

  it('InDrive: amount as gross (bumped to net if net higher)', () => {
    expect(
      getTripGrossRevenue({
        platform: 'InDrive',
        amount: 500,
        indriveNetIncome: 450,
      } as Trip),
    ).toBe(500);
    expect(
      getTripGrossRevenue({
        platform: 'InDrive',
        amount: 400,
        indriveNetIncome: 450,
      } as Trip),
    ).toBe(450);
  });

  it('Roam: trip.amount', () => {
    expect(getTripGrossRevenue({ platform: 'Roam', amount: 1200 } as Trip)).toBe(1200);
  });
});
