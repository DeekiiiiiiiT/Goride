import { describe, expect, it } from 'vitest';
import { evaluateDeliveryReconReadiness } from './deliveryReconReadiness.ts';

const allReady = {
  rushTripProjectionOn: true,
  rushDeliveryTripCount: 12,
  courierWeekStatementExists: true,
  courierVehicleBridgeExists: true,
  rushSettlementSignedOff: true,
};

describe('evaluateDeliveryReconReadiness', () => {
  it('ready when all four prerequisites pass', () => {
    const r = evaluateDeliveryReconReadiness(allReady);
    expect(r.ready).toBe(true);
    expect(r.items).toHaveLength(4);
    expect(r.items.every((i) => i.ok)).toBe(true);
  });

  it('not ready when projection off or zero trips', () => {
    expect(
      evaluateDeliveryReconReadiness({ ...allReady, rushTripProjectionOn: false }).ready,
    ).toBe(false);
    expect(
      evaluateDeliveryReconReadiness({ ...allReady, rushDeliveryTripCount: 0 }).ready,
    ).toBe(false);
  });

  it('not ready when courier statement or bridge or sign-off missing', () => {
    expect(
      evaluateDeliveryReconReadiness({ ...allReady, courierWeekStatementExists: false }).ready,
    ).toBe(false);
    expect(
      evaluateDeliveryReconReadiness({ ...allReady, courierVehicleBridgeExists: false }).ready,
    ).toBe(false);
    expect(
      evaluateDeliveryReconReadiness({ ...allReady, rushSettlementSignedOff: false }).ready,
    ).toBe(false);
  });
});
