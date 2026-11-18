import { describe, expect, it } from 'vitest';
import { ENGINE_VERSION, ENGINE_VERSION_V2, matchTolls } from './engine.ts';
import type { MatchBundle, MatchCharge, MatchTrip } from './types.ts';

const charge = (o: Partial<MatchCharge> = {}): MatchCharge => ({
  id: 'c1',
  source: 'tag_statement',
  vehicle_id: 'v1',
  driver_id: 'd1',
  plaza_id: 'portmore',
  occurred_at: '2026-11-10T14:20:00-05:00',
  time_precision: 'minute',
  amount_minor: 2000,
  remaining_minor: 2000,
  evidence_status: 'verified',
  duplicate_of: null,
  after_seal: false,
  is_legacy: false,
  week_sealed: false,
  ...o,
});

const riderTrip = (o: Partial<MatchTrip> = {}): MatchTrip => ({
  platform: 'indrive',
  platform_trip_id: 'logged:t1',
  vehicle_id: 'v1',
  driver_id: 'd1',
  request_at: '2026-11-10T14:00:00-05:00',
  pickup_at: '2026-11-10T14:05:00-05:00',
  dropoff_at: '2026-11-10T14:50:00-05:00',
  time_precision: 'minute',
  payment_method: 'cash',
  is_legacy: false,
  ...o,
});

const riderBundle = (o: Partial<MatchBundle> = {}): MatchBundle => ({
  focal: { charge_ids: ['c1'], payback_ids: [] },
  charges: [charge()],
  paybacks: [],
  trips: [],
  rider_trips: [riderTrip()],
  settings: [{ platform: 'indrive', auto_apply: true, payback_mode: 'rider_pays_driver' }],
  ...o,
});

describe('matcher rider_pays_driver golden', () => {
  it('rider_trips key selects v2 engine', () => {
    const r = matchTolls(riderBundle());
    expect(r.engine_version).toBe(ENGINE_VERSION_V2);
  });

  it('on-trip toll yields rider_pays_driver candidate, never auto_apply', () => {
    const r = matchTolls(riderBundle());
    const c = r.candidates.find((x) => x.kind === 'rider_pays_driver');
    expect(c).toBeDefined();
    expect(c!.payback_id).toBeNull();
    expect(c!.trip_platform).toBe('indrive');
    expect(c!.auto_apply).toBe(false);
    expect(c!.rules_fired).toContain('rider_pays_driver');
    expect(c!.dispute_open_eligible).toBeFalsy();
    expect(c!.dispute_settle_eligible).toBeFalsy();
  });

  it('without rider_trips key stays v1', () => {
    const r = matchTolls({
      focal: { charge_ids: ['c1'], payback_ids: [] },
      charges: [charge()],
      paybacks: [],
      trips: [],
      settings: [{ platform: 'indrive', auto_apply: false, payback_mode: 'rider_pays_driver' }],
    });
    expect(r.engine_version).toBe(ENGINE_VERSION);
    expect(r.candidates.filter((x) => x.kind === 'rider_pays_driver')).toHaveLength(0);
  });

  it('withdrawn trip shape is ignored when not in bundle', () => {
    const r = matchTolls(riderBundle({ rider_trips: [] }));
    expect(r.candidates.filter((x) => x.kind === 'rider_pays_driver')).toHaveLength(0);
  });

  it('date-only trip window uses same_day', () => {
    const r = matchTolls(
      riderBundle({
        charges: [charge({ occurred_at: '2026-11-10T12:00:00-05:00', time_precision: 'date_only' })],
        rider_trips: [
          riderTrip({
            time_precision: 'date_only',
            request_at: '2026-11-10T08:00:00-05:00',
            pickup_at: null,
            dropoff_at: '2026-11-10T20:00:00-05:00',
          }),
        ],
      }),
    );
    expect(r.candidates.some((c) => c.rules_fired.includes('same_day'))).toBe(true);
  });
});