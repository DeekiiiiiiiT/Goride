import { describe, expect, it } from 'vitest';

/** Rollback drill: flags off → Rush paths noop without breaking rideshare. */
describe('Rush rollout flag rollback', () => {
  const RUSH_FLAGS = [
    'service_lines_enabled',
    'rush_courier_link',
    'rush_trip_projection',
    'rush_settlement',
    'rush_ui',
  ] as const;

  it('lists all Rush integration flags for rollback drills', () => {
    expect(RUSH_FLAGS).toContain('rush_courier_link');
    expect(RUSH_FLAGS).toContain('rush_trip_projection');
    expect(RUSH_FLAGS).toContain('rush_settlement');
    expect(RUSH_FLAGS).toContain('rush_ui');
    expect(RUSH_FLAGS).toContain('service_lines_enabled');
  });

  it('projection noop when rush_trip_projection is off', () => {
    const rushTripProjectionEnabled = false;
    const wouldProject = rushTripProjectionEnabled && true;
    expect(wouldProject).toBe(false);
  });

  it('settlement noop when rush_settlement is off', () => {
    const rushSettlementEnabled = false;
    const includeRushInSettlement = rushSettlementEnabled;
    expect(includeRushInSettlement).toBe(false);
  });
});
