import { describe, expect, it } from 'vitest';
import {
  ENGINE_VERSION,
  ENGINE_VERSION_V2,
  MATCHER_CONFIG_V1,
  matchTolls,
  scorePair,
} from './engine.ts';
import type { MatchBundle, MatchCharge, MatchDispute, MatchPayback, MatchTrip } from './types.ts';

const charge = (o: Partial<MatchCharge> = {}): MatchCharge => ({
  id: 'c1',
  source: 'tag_statement',
  vehicle_id: 'v1',
  driver_id: 'd1',
  plaza_id: 'portmore',
  occurred_at: '2026-11-10T14:20:00-05:00',
  time_precision: 'minute',
  amount_minor: 39000,
  remaining_minor: 39000,
  evidence_status: 'verified',
  duplicate_of: null,
  after_seal: false,
  is_legacy: false,
  week_sealed: false,
  ...o,
});

const trip = (o: Partial<MatchTrip> = {}): MatchTrip => ({
  platform: 'uber',
  platform_trip_id: 't1',
  vehicle_id: 'v1',
  driver_id: 'd1',
  request_at: '2026-11-10T14:00:00-05:00',
  pickup_at: '2026-11-10T14:05:00-05:00',
  dropoff_at: '2026-11-10T14:50:00-05:00',
  time_precision: 'minute',
  payment_method: 'card',
  is_legacy: false,
  ...o,
});

const payback = (o: Partial<MatchPayback> = {}): MatchPayback => ({
  id: 'p1',
  platform: 'uber',
  kind: 'trip_line',
  platform_trip_id: 't1',
  driver_id: 'd1',
  paid_on: '2026-11-10',
  amount_minor: 37000,
  remaining_minor: 37000,
  received_by: 'fleet',
  reversal_of: null,
  reversed: false,
  after_seal: false,
  is_legacy: false,
  week_sealed: false,
  ...o,
});

const disputeV2 = (): MatchBundle => ({
  focal: { charge_ids: ['c1'], payback_ids: [] },
  charges: [charge()],
  paybacks: [payback()],
  trips: [trip()],
  settings: [{ platform: 'uber', auto_apply: false, payback_mode: 'per_trip', takes_disputes: true }],
  rates: [{ plaza_id: 'portmore', platform: 'uber', amount_minor: 37000, valid_from: '2026-01-01' }],
  disputes: [],
});

describe('matcher disputes golden', () => {
  it('v2 bundle stamps engine version', () => {
    const r = matchTolls(disputeV2());
    expect(r.engine_version).toBe(ENGINE_VERSION_V2);
  });

  it('plaza rate makes J$370 on J$390 exact with dispute_open_eligible', () => {
    const r = matchTolls(disputeV2());
    expect(r.candidates).toHaveLength(1);
    const c = r.candidates[0];
    expect(c.rules_fired).toContain('amount_platform_rate');
    expect(c.rules_fired).toContain('amount_exact');
    expect(c.rules_fired).toContain('dispute_open_eligible');
    expect(c.dispute_open_eligible).toBe(true);
    expect(c.score).toBeGreaterThanOrEqual(90);
    const again = scorePair(JSON.parse(JSON.stringify(c.inputs)));
    expect(again.score).toBe(c.score);
  });

  it('dispute-first blocks payback on disputed charge', () => {
    const d: MatchDispute = {
      id: 'd1',
      charge_id: 'c1',
      state: 'to_send',
      platform: 'uber',
      platform_trip_id: 't1',
      driver_id: 'd1',
      owed_minor: 2000,
      recovered_minor: 0,
      opened_late: false,
      version: 1,
      refund_from: '2026-11-10',
      refund_to: '2026-12-07',
    };
    const r = matchTolls({ ...disputeV2(), disputes: [d], charges: [charge({ remaining_minor: 2000 })] });
    expect(r.candidates.filter((x) => x.kind !== 'dispute_refund')).toHaveLength(0);
    expect(r.excluded.charges).toContainEqual({ id: 'c1', reason: 'disputed' });
  });

  it('refund candidate sole settles when sent + adjustment', () => {
    const d: MatchDispute = {
      id: 'd1',
      charge_id: 'c1',
      state: 'sent',
      platform: 'uber',
      platform_trip_id: 't1',
      driver_id: 'd1',
      owed_minor: 2000,
      recovered_minor: 0,
      opened_late: false,
      version: 1,
      refund_from: '2026-11-01',
      refund_to: '2026-12-31',
    };
    const r = matchTolls({
      ...disputeV2(),
      focal: { charge_ids: ['c1'], payback_ids: ['p2'] },
      disputes: [d],
      charges: [charge({ remaining_minor: 0 })],
      paybacks: [
        payback({ id: 'p2', kind: 'adjustment', platform_trip_id: null, remaining_minor: 2000, amount_minor: 2000 }),
      ],
    });
    const refund = r.candidates.find((c) => c.kind === 'dispute_refund');
    expect(refund?.dispute_settle_eligible).toBe(true);
  });

  it('v1 bundle without dispute keys stays v1', () => {
    const base: MatchBundle = {
      focal: { charge_ids: ['c1'], payback_ids: [] },
      charges: [charge({ amount_minor: 34000, remaining_minor: 34000 })],
      paybacks: [payback({ amount_minor: 34000, remaining_minor: 34000 })],
      trips: [trip()],
      settings: [{ platform: 'uber', auto_apply: false, payback_mode: 'per_trip' }],
    };
    const r = matchTolls(base);
    expect(r.engine_version).toBe(ENGINE_VERSION);
    expect(r.candidates[0]?.rules_fired).not.toContain('dispute_open_eligible');
  });
});