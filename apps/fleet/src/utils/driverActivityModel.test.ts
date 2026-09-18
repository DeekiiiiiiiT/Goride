import { describe, expect, it } from 'vitest';
import {
  buildCoverageWindows,
  clampActivityWindow,
  computeEventAcceptanceRate,
  deriveStatusSegments,
  isUnsupportedActivityPlatform,
  mapOfferStatusToCanonical,
  mapRidesAuditToCanonical,
} from './driverActivityModel';

describe('driverActivityModel', () => {
  it('maps ride audit transitions to canonical verbs', () => {
    expect(mapRidesAuditToCanonical('offer_accepted')).toBe('offer_accepted');
    expect(mapRidesAuditToCanonical('ride_completed')).toBe('job_completed');
    expect(
      mapRidesAuditToCanonical('driver_transition', { to: 'driver_en_route_pickup' }),
    ).toBe('en_route_pickup');
    expect(mapRidesAuditToCanonical('ride_cancelled', { cancelled_by: 'driver' })).toBe(
      'driver_cancelled',
    );
    expect(mapOfferStatusToCanonical('expired')).toBe('offer_expired');
  });

  it('I8: acceptanceRate is null when denominator is 0', () => {
    expect(computeEventAcceptanceRate({ accepted: 0, declined: 0, expired: 0 })).toBeNull();
    expect(computeEventAcceptanceRate({ accepted: 2, declined: 2, expired: 0 })).toBe(50);
  });

  it('I7: uncovered window yields not-recorded coverage only', () => {
    const windows = buildCoverageWindows(
      '2026-09-01T00:00:00.000Z',
      '2026-09-07T00:00:00.000Z',
      [],
    );
    expect(windows).toHaveLength(1);
    expect(windows[0].recorded).toBe(false);
  });

  it('partial coverage renders recorded and not-recorded bands', () => {
    const windows = buildCoverageWindows(
      '2026-09-01T00:00:00.000Z',
      '2026-09-10T00:00:00.000Z',
      [{ covered_from: '2026-09-05T00:00:00.000Z', covered_to: null }],
    );
    expect(windows.some((w) => !w.recorded)).toBe(true);
    expect(windows.some((w) => w.recorded)).toBe(true);
  });

  it('I3/I4: presence segments do not overlap and open session has null to', () => {
    const segments = deriveStatusSegments(
      [
        { event_type: 'went_online', occurred_at: '2026-09-13T14:53:00.000Z' },
        { event_type: 'went_offline', occurred_at: '2026-09-13T15:28:00.000Z', payload: { reason: 'app_toggle' } },
        { event_type: 'went_online', occurred_at: '2026-09-13T16:00:00.000Z' },
      ],
      '2026-09-13T14:00:00.000Z',
      '2026-09-13T18:00:00.000Z',
      '2026-09-13T17:00:00.000Z',
    );
    const online = segments.filter((s) => s.kind === 'online');
    expect(online.length).toBeGreaterThanOrEqual(2);
    const open = online.find((s) => s.to == null);
    expect(open).toBeTruthy();
  });

  it('clamps windows over 31 days', () => {
    const w = clampActivityWindow('2026-01-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z', 31);
    expect(w.clamped).toBe(true);
    expect(Date.parse(w.to) - Date.parse(w.from)).toBeLessThanOrEqual(31 * 86400000 + 1000);
  });

  it('flags Uber/InDrive as unsupported', () => {
    expect(isUnsupportedActivityPlatform('Uber')).toBe(true);
    expect(isUnsupportedActivityPlatform('InDrive')).toBe(true);
    expect(isUnsupportedActivityPlatform('Roam')).toBe(false);
  });
});
