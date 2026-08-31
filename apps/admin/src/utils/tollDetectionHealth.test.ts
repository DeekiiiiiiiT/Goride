import { describe, expect, it } from 'vitest';
import { assessTollDetectionHealth } from './tollDetectionHealth';

describe('assessTollDetectionHealth', () => {
  const plaza = (status: 'verified' | 'unverified') =>
    ({ id: status, name: status, status, location: { lat: 18, lng: -77 } }) as any;

  it('flags verification gate when plazas exist but none verified', () => {
    const h = assessTollDetectionHealth({
      settings: { toll_detection_enabled: true },
      plazas: [plaza('unverified')],
      tollLogRows: [],
    });
    expect(h.verificationGateClosed).toBe(true);
    expect(h.zeroCrossingAlarm).toBe(false);
  });

  it('alarms when detection on, verified plazas, zero crossings', () => {
    const h = assessTollDetectionHealth({
      settings: { toll_detection_enabled: true },
      plazas: [plaza('verified')],
      tollLogRows: [],
      nowMs: Date.parse('2026-08-31T12:00:00Z'),
    });
    expect(h.zeroCrossingAlarm).toBe(true);
  });

  it('counts recent fleet_replay crossings', () => {
    const h = assessTollDetectionHealth({
      settings: { toll_detection_enabled: true },
      plazas: [plaza('verified')],
      nowMs: Date.parse('2026-08-31T12:00:00Z'),
      tollLogRows: [
        {
          date: '2026-08-30',
          referenceNumber: 'fleet_replay:t1:p1:0',
          paymentMethod: 'fleet_account',
        },
      ],
    });
    expect(h.crossingsLastNDays).toBe(1);
    expect(h.zeroCrossingAlarm).toBe(false);
  });
});
