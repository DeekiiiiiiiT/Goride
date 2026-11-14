import { describe, expect, it } from 'vitest';
import { assessTollDetectionHealth } from './tollDetectionHealth';

describe('assessTollDetectionHealth', () => {
  const plaza = (status: 'verified' | 'unverified') =>
    ({ id: status, name: status, status, location: { lat: 18, lng: -77 } }) as any;

  it('flags verification gate when plazas exist but none verified', () => {
    const h = assessTollDetectionHealth({
      settings: { toll_detection_enabled: true },
      plazas: [plaza('unverified')],
      crossingsLastNDays: 0,
    });
    expect(h.verificationGateClosed).toBe(true);
    expect(h.zeroCrossingAlarm).toBe(false);
  });

  it('alarms when detection on, verified plazas, zero crossings', () => {
    const h = assessTollDetectionHealth({
      settings: { toll_detection_enabled: true },
      plazas: [plaza('verified')],
      crossingsLastNDays: 0,
    });
    expect(h.zeroCrossingAlarm).toBe(true);
  });

  it('uses the recorded crossing count', () => {
    const h = assessTollDetectionHealth({
      settings: { toll_detection_enabled: true },
      plazas: [plaza('verified')],
      crossingsLastNDays: 1,
    });
    expect(h.crossingsLastNDays).toBe(1);
    expect(h.zeroCrossingAlarm).toBe(false);
  });

  it('warns when the crossing count cannot be read (no silent healthy look)', () => {
    const h = assessTollDetectionHealth({
      settings: { toll_detection_enabled: true },
      plazas: [plaza('verified')],
      crossingsLastNDays: null,
    });
    expect(h.countUnavailable).toBe(true);
    expect(h.zeroCrossingAlarm).toBe(false);
    expect(h.summary).toMatch(/Couldn't read the Roam ride toll crossings/);
  });
});
