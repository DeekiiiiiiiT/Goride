import { describe, expect, it } from 'vitest';
import { buildGasCardOdometerAnchor } from './buildGasCardOdometerAnchor';

describe('buildGasCardOdometerAnchor', () => {
  it('builds $0 awaiting Card statement Anchor (admin Known fill shape)', () => {
    const entry = buildGasCardOdometerAnchor({
      id: 'a1',
      date: '2026-09-11',
      time: '11:01:00',
      cardId: 'card-1',
      vehicleId: '5179KZ',
      driverId: 'kenny',
      odometer: 184476,
      odometerImageUrl: 'https://example.com/odo.jpg',
      location: 'FESCO BEECHWOOD',
      matchedStationId: 'st-1',
      entrySource: 'admin-manual',
    });

    expect(entry.amount).toBe(0);
    expect(entry.type).toBe('Manual_Entry');
    expect(entry.entryMode).toBe('Anchor');
    expect(entry.paymentSource).toBe('Gas_Card');
    expect(entry.usageCategory).toBe('ride');
    expect(entry.entrySource).toBe('admin-manual');
    expect(entry.metadata?.awaitingCardStatement).toBe(true);
    expect(entry.metadata?.countsInFuelSpend).toBe(false);
    expect(entry.metadata?.countsInFuelVolume).toBe(false);
    expect(entry.odometer).toBe(184476);
    expect(entry.liters).toBeUndefined();
  });
});
