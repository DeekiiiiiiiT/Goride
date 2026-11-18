/**
 * Toll v2 matcher engine (design B4; Part F P2-R3). Pure: no clock, no I/O, no randomness.
 *
 *   matchTolls(bundle)  → every eligible charge↔payback pair that touches a focal record,
 *                          each with score parts, rules fired, the B4 auto-apply test and the
 *                          exact inputs it was scored from.
 *   scorePair(inputs)   → the score for one stored `inputs` value. Re-running it on a stored
 *                          suggestion gives the stored answer (I11).
 *
 * Windows (B4 + Phase 2 decision 4):
 *   trip start = pickup, else request; trip end = drop-off, else start.
 *   on_trip   : start ≤ t ≤ end
 *   enroute   : request − 45 min ≤ t < start
 *   post_trip : end < t ≤ end + 15 min
 *   Each edge is widened only by the coarser of the two precisions (exact 0 s, minute 60 s).
 *   If either side is date_only, the test is by Jamaica calendar day (`same_day`).
 * Adjustments (no trip): same driver, charge day in [paid_on − 7 days, paid_on].
 *
 * Auto-apply (B4) only when ALL hold: the platform's auto_apply is on, one candidate on each
 * side, on_trip with a known drop-off, score ≥ threshold, neither side date_only, receipt verified.
 */
import type {
  Candidate,
  Excluded,
  MatchBundle,
  MatchCharge,
  MatchDispute,
  MatchPayback,
  MatchPlazaRate,
  MatchResult,
  MatchTrip,
  MatcherConfig,
  PairInputs,
  Scored,
  SuggestionKind,
  TimePrecision,
  WindowHit,
} from './types.ts';

export const ENGINE_VERSION = 'toll-matcher-v1';
export const ENGINE_VERSION_V2 = 'toll-matcher-v2';

export const MATCHER_CONFIG_V1: MatcherConfig = Object.freeze({
  approach_minutes: 45,
  post_trip_minutes: 15,
  precision_slack_seconds: Object.freeze({ exact: 0, minute: 60 }),
  amount_close_ratio: 0.05,
  adjustment_lookback_days: 7,
  auto_apply_min_score: 90,
  points: Object.freeze({
    on_trip: 60,
    enroute: 35,
    post_trip: 25,
    same_day: 20,
    adjustment_same_day: 25,
    adjustment_within_lookback: 10,
    amount_exact: 30,
    amount_close: 15,
    sole_candidate: 10,
  }),
}) as MatcherConfig;

const MIN = 60_000;
const DAY = 86_400_000;
const JAMAICA_OFFSET_MS = 5 * 3_600_000; // UTC−5, no daylight saving

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const v = Date.parse(iso);
  return Number.isNaN(v) ? null : v;
}

/** Jamaica calendar day of an instant, as a day number (days since 1970-01-01). */
function jamaicaDayNo(instantMs: number): number {
  return Math.floor((instantMs - JAMAICA_OFFSET_MS) / DAY);
}

function ymdDayNo(ymd: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
  if (!m) return null;
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY);
}

function slackMs(a: TimePrecision, b: TimePrecision, cfg: MatcherConfig): number {
  const s = (p: TimePrecision) =>
    p === 'exact' ? cfg.precision_slack_seconds.exact : p === 'minute' ? cfg.precision_slack_seconds.minute : 0;
  return Math.max(s(a), s(b)) * 1000;
}

interface WindowOutcome {
  hit: WindowHit;
  minutesOutside: number;
  noDropoff: boolean;
  dateOnly: boolean;
}

/** Where the crossing falls against the trip (or the adjustment's date). Null = not a candidate. */
export function windowFor(
  charge: PairInputs['charge'],
  payback: PairInputs['payback'],
  trip: PairInputs['trip'],
  cfg: MatcherConfig,
): WindowOutcome | null {
  const t = ms(charge.occurred_at);
  if (t === null) return null;

  if (payback.kind === 'adjustment') {
    if (!charge.driver_id || charge.driver_id !== payback.driver_id) return null;
    const paid = ymdDayNo(payback.paid_on);
    if (paid === null) return null;
    const day = jamaicaDayNo(t);
    const back = paid - day;
    if (back < 0 || back > cfg.adjustment_lookback_days) return null;
    return {
      hit: back === 0 ? 'adjustment_same_day' : 'adjustment_within_lookback',
      minutesOutside: 0,
      noDropoff: false,
      dateOnly: charge.time_precision === 'date_only',
    };
  }

  if (payback.kind !== 'trip_line' || !trip) return null;
  if (!charge.vehicle_id || charge.vehicle_id !== trip.vehicle_id) return null;
  const request = ms(trip.request_at);
  const pickup = ms(trip.pickup_at);
  const start = pickup ?? request;
  if (start === null) return null;
  const dropoff = ms(trip.dropoff_at);
  const end = dropoff ?? start;
  const approachStart = (request ?? start) - cfg.approach_minutes * MIN;
  const postEnd = end + cfg.post_trip_minutes * MIN;
  const noDropoff = dropoff === null;

  if (charge.time_precision === 'date_only' || trip.time_precision === 'date_only') {
    const day = jamaicaDayNo(t);
    if (day < jamaicaDayNo(approachStart) || day > jamaicaDayNo(postEnd)) return null;
    return { hit: 'same_day', minutesOutside: 0, noDropoff, dateOnly: true };
  }

  const slack = slackMs(charge.time_precision, trip.time_precision, cfg);
  if (t >= start - slack && t <= end + slack) {
    return { hit: 'on_trip', minutesOutside: 0, noDropoff, dateOnly: false };
  }
  if (t >= approachStart - slack && t < start - slack) {
    return { hit: 'enroute', minutesOutside: Math.round((start - t) / MIN), noDropoff, dateOnly: false };
  }
  if (t > end + slack && t <= postEnd + slack) {
    return { hit: 'post_trip', minutesOutside: Math.round((t - end) / MIN), noDropoff, dateOnly: false };
  }
  return null;
}

function paybackAmountForScore(inputs: PairInputs): number {
  if (inputs.engine_version === ENGINE_VERSION_V2 && inputs.platform_rate_minor != null) {
    return inputs.platform_rate_minor;
  }
  return inputs.payback.remaining_minor;
}

/** Score one pair from its stored inputs. Throws if the inputs are not a candidate at all. */
export function scorePair(inputs: PairInputs): Scored {
  if (inputs.kind === 'dispute_refund') {
    return scoreRefundPair(inputs);
  }

  const cfg = inputs.config;
  const w = windowFor(inputs.charge, inputs.payback, inputs.trip, cfg);
  if (!w) throw new Error('scorePair: inputs are not a candidate pair');

  const rules: string[] = [w.hit];
  const windowPts = cfg.points[w.hit];

  const want = inputs.charge.remaining_minor;
  const have = inputs.payback.remaining_minor;
  const diff = have - want;
  let amountPts = 0;
  if (
    inputs.platform_rate_minor != null &&
    have === inputs.platform_rate_minor &&
    inputs.charge.remaining_minor === inputs.charge.amount_minor
  ) {
    amountPts = cfg.points.amount_exact;
    rules.push('amount_platform_rate', 'amount_exact');
  } else if (diff === 0) {
    amountPts = cfg.points.amount_exact;
    rules.push('amount_exact');
  } else if (Math.abs(diff) <= Math.floor(want * cfg.amount_close_ratio)) {
    amountPts = cfg.points.amount_close;
    rules.push('amount_close');
  } else {
    rules.push(diff > 0 ? 'payback_larger' : 'payback_smaller');
  }

  const sole = inputs.competitors.charge_candidates === 1 && inputs.competitors.payback_candidates === 1;
  const solePts = sole ? cfg.points.sole_candidate : 0;
  rules.push(sole ? 'sole_candidate' : 'competing_candidates');

  if (w.dateOnly) rules.push('date_only');
  if (w.noDropoff && inputs.payback.kind === 'trip_line') rules.push('no_dropoff');
  if (inputs.payback.kind === 'adjustment') rules.push('no_trip');
  if (inputs.charge.evidence_status !== 'verified') rules.push('receipt_unverified');

  const total = windowPts + amountPts + solePts;

  const tight = w.hit === 'on_trip' && !w.noDropoff;
  const allTrue =
    inputs.auto_apply_setting &&
    sole &&
    tight &&
    total >= cfg.auto_apply_min_score &&
    !w.dateOnly &&
    inputs.charge.evidence_status === 'verified';
  if (allTrue) rules.push('auto_apply_eligible');
  else if (!inputs.auto_apply_setting) rules.push('auto_apply_off');
  else rules.push('auto_apply_blocked');

  return {
    score: total,
    score_parts: {
      window: windowPts,
      amount: amountPts,
      sole_candidate: solePts,
      total,
      window_hit: w.hit,
      amount_diff_minor: diff,
      minutes_outside_trip: w.minutesOutside,
    },
    rules_fired: rules,
    auto_apply: allTrue,
  };
}

function scoreRefundPair(inputs: PairInputs): Scored {
  const cfg = inputs.config;
  const d = inputs.dispute;
  if (!d) throw new Error('scoreRefundPair: dispute required');
  const owed = d.owed_minor - d.recovered_minor;
  const have = inputs.payback.remaining_minor;
  const rules: string[] = ['refund_window', 'dispute_refund'];
  const windowPts = cfg.points.same_day;

  let amountPts = 0;
  let diff = have - owed;
  if (diff === 0) {
    amountPts = cfg.points.amount_exact;
    rules.push('amount_exact');
  } else {
    rules.push(diff > 0 ? 'payback_larger' : 'payback_smaller');
  }

  const sole = inputs.competitors.charge_candidates === 1 && inputs.competitors.payback_candidates === 1;
  const solePts = sole ? cfg.points.sole_candidate : 0;
  rules.push(sole ? 'sole_candidate' : 'competing_candidates');

  const total = windowPts + amountPts + solePts;

  return {
    score: total,
    score_parts: {
      window: windowPts,
      amount: amountPts,
      sole_candidate: solePts,
      total,
      window_hit: 'refund_window',
      amount_diff_minor: diff,
      minutes_outside_trip: 0,
    },
    rules_fired: rules,
    auto_apply: false,
  };
}

function bundleUsesV2(bundle: MatchBundle): boolean {
  return bundle.rates !== undefined || bundle.disputes !== undefined;
}

function activeDisputedCharges(disputes: MatchDispute[] | undefined): Set<string> {
  const s = new Set<string>();
  for (const d of disputes ?? []) {
    if (d.state === 'to_send' || d.state === 'sent' || d.state === 'expired') s.add(d.charge_id);
  }
  return s;
}

function tripJamaicaDate(trip: MatchTrip | null, payback: MatchPayback): string | null {
  if (trip) {
    const anchor = trip.pickup_at ?? trip.request_at ?? trip.dropoff_at;
    if (anchor) {
      const m = Date.parse(anchor);
      if (!Number.isNaN(m)) {
        const j = new Date(m - JAMAICA_OFFSET_MS);
        const y = j.getUTCFullYear();
        const mo = String(j.getUTCMonth() + 1).padStart(2, '0');
        const da = String(j.getUTCDate()).padStart(2, '0');
        return `${y}-${mo}-${da}`;
      }
    }
  }
  return payback.paid_on;
}

function platformRateMinor(
  charge: MatchCharge,
  payback: MatchPayback,
  trip: MatchTrip | null,
  rates: MatchPlazaRate[] | undefined,
): number | undefined {
  if (!rates?.length || !charge.plaza_id) return undefined;
  if (charge.remaining_minor !== charge.amount_minor) return undefined;
  const tripDay = tripJamaicaDate(trip, payback);
  if (!tripDay) return undefined;
  const tripDayNo = ymdDayNo(tripDay);
  if (tripDayNo === null) return undefined;
  let best: MatchPlazaRate | undefined;
  for (const r of rates) {
    if (r.plaza_id !== charge.plaza_id || r.platform !== payback.platform) continue;
    const fromNo = ymdDayNo(r.valid_from);
    if (fromNo === null || fromNo > tripDayNo) continue;
    if (!best || fromNo > ymdDayNo(best.valid_from)!) best = r;
  }
  return best?.amount_minor;
}

function paybackInRefundWindow(p: MatchPayback, d: MatchDispute): boolean {
  const paid = ymdDayNo(p.paid_on);
  const from = ymdDayNo(d.refund_from);
  const to = ymdDayNo(d.refund_to);
  if (paid === null || from === null || to === null) return false;
  return paid >= from && paid <= to;
}

function refundPaybackEligible(p: MatchPayback, d: MatchDispute): boolean {
  if (d.state === 'to_send') return false;
  if (p.platform !== d.platform || p.driver_id !== d.driver_id) return false;
  if (!paybackInRefundWindow(p, d)) return false;
  if (d.state === 'expired') return p.kind === 'adjustment';
  if (d.state === 'sent') {
    if (p.kind === 'adjustment') return true;
    return p.kind === 'trip_line' && p.platform_trip_id === d.platform_trip_id;
  }
  return false;
}

function disputeOpenEligible(inputs: PairInputs, scored: Scored): boolean {
  if (inputs.engine_version !== ENGINE_VERSION_V2) return false;
  if (!inputs.takes_disputes_setting) return false;
  if (inputs.payback.kind !== 'trip_line') return false;
  if (inputs.payback.remaining_minor >= inputs.charge.remaining_minor) return false;
  const w = windowFor(inputs.charge, inputs.payback, inputs.trip, inputs.config);
  if (!w) return false;
  const sole = inputs.competitors.charge_candidates === 1 && inputs.competitors.payback_candidates === 1;
  const tight = w.hit === 'on_trip' && !w.noDropoff;
  return (
    sole &&
    tight &&
    scored.score >= inputs.config.auto_apply_min_score &&
    !w.dateOnly &&
    inputs.charge.evidence_status === 'verified'
  );
}

function chargeExclusion(c: MatchCharge): string | null {
  if (c.source === 'roam_ride') return 'roam_native';
  if (c.is_legacy) return 'legacy';
  if (c.duplicate_of) return 'duplicate';
  if (c.after_seal) return 'after_seal';
  if (c.week_sealed) return 'week_sealed';
  if (c.evidence_status === 'rejected') return 'receipt_rejected';
  if (c.remaining_minor <= 0) return 'fully_decided';
  return null;
}

function paybackExclusion(p: MatchPayback, tripFound: boolean): string | null {
  if (p.kind === 'native') return 'roam_native';
  if (p.is_legacy) return 'legacy';
  if (p.reversal_of) return 'reversing_payback';
  if (p.reversed) return 'reversed';
  if (p.after_seal) return 'after_seal';
  if (p.week_sealed) return 'week_sealed';
  if (p.remaining_minor <= 0) return 'fully_decided';
  if (p.kind === 'trip_line' && !tripFound) return 'trip_missing';
  return null;
}

function tripKey(platform: string, id: string): string {
  return `${platform}\u0000${id}`;
}

function byId(a: { id: string }, b: { id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Run the matcher over one claimed bundle. */
export function matchTolls(bundle: MatchBundle, cfg: MatcherConfig = MATCHER_CONFIG_V1): MatchResult {
  if (!bundleUsesV2(bundle)) {
    return matchTollsCore(bundle, cfg, ENGINE_VERSION);
  }
  return matchTollsCore(bundle, cfg, ENGINE_VERSION_V2);
}

function matchTollsCore(bundle: MatchBundle, cfg: MatcherConfig, engineVersion: string): MatchResult {
  const focalC = new Set(bundle.focal?.charge_ids ?? []);
  const focalP = new Set(bundle.focal?.payback_ids ?? []);
  const disputed = engineVersion === ENGINE_VERSION_V2 ? activeDisputedCharges(bundle.disputes) : new Set<string>();

  const trips = new Map<string, MatchTrip>();
  for (const t of bundle.trips ?? []) {
    if (!t.is_legacy) trips.set(tripKey(t.platform, t.platform_trip_id), t);
  }
  const autoBy = new Map<string, boolean>();
  for (const s of bundle.settings ?? []) autoBy.set(s.platform, !!s.auto_apply);

  const excludedC: Excluded[] = [];
  const excludedP: Excluded[] = [];
  const charges: MatchCharge[] = [];
  const paybacks: { p: MatchPayback; trip: MatchTrip | null }[] = [];

  const takesBy = new Map<string, boolean>();
  for (const s of bundle.settings ?? []) takesBy.set(s.platform, !!s.takes_disputes);

  for (const c of [...(bundle.charges ?? [])].sort(byId)) {
    const why =
      chargeExclusion(c) ?? (disputed.has(c.id) ? 'disputed' : null);
    if (why) {
      if (focalC.has(c.id)) excludedC.push({ id: c.id, reason: why });
    } else charges.push(c);
  }
  for (const p of [...(bundle.paybacks ?? [])].sort(byId)) {
    const trip = p.platform_trip_id ? trips.get(tripKey(p.platform, p.platform_trip_id)) ?? null : null;
    const why = paybackExclusion(p, !!trip);
    if (why) {
      if (focalP.has(p.id)) excludedP.push({ id: p.id, reason: why });
    } else paybacks.push({ p, trip: p.kind === 'trip_line' ? trip : null });
  }

  // 1. Every pair that falls in a window, over the whole bundle (so competitor counts are complete
  //    for any pair that touches a focal record; the database loads two hops around the focal set).
  type Raw = { c: MatchCharge; p: MatchPayback; trip: MatchTrip | null };
  const raw: Raw[] = [];
  for (const c of charges) {
    const cIn = pickCharge(c);
    for (const { p, trip } of paybacks) {
      if (disputed.has(c.id)) continue;
      if (windowFor(cIn, pickPayback(p), trip ? pickTrip(trip) : null, cfg)) raw.push({ c, p, trip });
    }
  }
  const perCharge = new Map<string, number>();
  const perPayback = new Map<string, number>();
  for (const r of raw) {
    perCharge.set(r.c.id, (perCharge.get(r.c.id) ?? 0) + 1);
    perPayback.set(r.p.id, (perPayback.get(r.p.id) ?? 0) + 1);
  }

  // 2. Score the pairs that touch a focal record.
  const candidates: Candidate[] = [];
  for (const r of raw) {
    if (!focalC.has(r.c.id) && !focalP.has(r.p.id)) continue;
    const rateMinor =
      engineVersion === ENGINE_VERSION_V2
        ? platformRateMinor(r.c, r.p, r.trip, bundle.rates)
        : undefined;
    const inputs: PairInputs = {
      engine_version: engineVersion,
      config: cfg,
      charge: pickCharge(r.c),
      payback: pickPayback(r.p),
      trip: r.trip ? pickTrip(r.trip) : null,
      competitors: {
        charge_candidates: perCharge.get(r.c.id) ?? 0,
        payback_candidates: perPayback.get(r.p.id) ?? 0,
      },
      auto_apply_setting: autoBy.get(r.p.platform) ?? false,
    };
    // v1 inputs stay byte-identical to before S2a (same inputs_hash, no live churn while the switch is off);
    // the v2 keys are written only when the bundle carries dispute data.
    if (engineVersion === ENGINE_VERSION_V2) {
      inputs.kind = 'payback';
      if (rateMinor !== undefined) inputs.platform_rate_minor = rateMinor;
      inputs.takes_disputes_setting = takesBy.get(r.p.platform) ?? false;
    }
    const scored = scorePair(inputs);
    const openEl = disputeOpenEligible(inputs, scored);
    const cand: Candidate = {
      kind: 'payback',
      charge_id: r.c.id,
      payback_id: r.p.id,
      inputs,
      ...scored,
      dispute_open_eligible: openEl,
    };
    if (openEl) cand.rules_fired = [...cand.rules_fired, 'dispute_open_eligible'];
    candidates.push(cand);
  }

  if (engineVersion === ENGINE_VERSION_V2 && (bundle.disputes?.length ?? 0) > 0) {
    const disputes = (bundle.disputes ?? []).filter((d) => d.state === 'sent' || d.state === 'expired');
    const chargesById = new Map(bundle.charges.map((c) => [c.id, c]));
  type RefundRaw = { d: MatchDispute; p: MatchPayback; c: MatchCharge };
  const refundRaw: RefundRaw[] = [];
    for (const d of disputes) {
      const c = chargesById.get(d.charge_id);
      if (!c) continue;
      for (const { p } of paybacks) {
        if (refundPaybackEligible(p, d)) refundRaw.push({ d, p, c });
      }
    }
    const perDispute = new Map<string, number>();
    const perPaybackRefund = new Map<string, number>();
    for (const r of refundRaw) {
      perDispute.set(r.d.id, (perDispute.get(r.d.id) ?? 0) + 1);
      perPaybackRefund.set(r.p.id, (perPaybackRefund.get(r.p.id) ?? 0) + 1);
    }
    for (const r of refundRaw) {
      if (!focalC.has(r.c.id) && !focalP.has(r.p.id)) continue;
      const inputs: PairInputs = {
        engine_version: engineVersion,
        config: cfg,
        kind: 'dispute_refund',
        dispute_id: r.d.id,
        charge: pickCharge(r.c),
        payback: pickPayback(r.p),
        trip: null,
        competitors: {
          charge_candidates: perDispute.get(r.d.id) ?? 0,
          payback_candidates: perPaybackRefund.get(r.p.id) ?? 0,
        },
        auto_apply_setting: false,
        dispute: {
          id: r.d.id,
          state: r.d.state,
          owed_minor: r.d.owed_minor,
          recovered_minor: r.d.recovered_minor,
          platform_trip_id: r.d.platform_trip_id,
          platform: r.d.platform,
        },
      };
      const scored = scorePair(inputs);
      const owedLeft = r.d.owed_minor - r.d.recovered_minor;
      const settleEl =
        inputs.competitors.charge_candidates === 1 &&
        inputs.competitors.payback_candidates === 1 &&
        r.p.remaining_minor <= owedLeft;
      const cand: Candidate = {
        kind: 'dispute_refund',
        dispute_id: r.d.id,
        charge_id: r.c.id,
        payback_id: r.p.id,
        inputs,
        ...scored,
        dispute_settle_eligible: settleEl,
      };
      if (settleEl) cand.rules_fired = [...cand.rules_fired, 'dispute_settle_eligible'];
      candidates.push(cand);
    }
  }

  candidates.sort((a, b) =>
    a.charge_id !== b.charge_id
      ? (a.charge_id < b.charge_id ? -1 : 1)
      : b.score !== a.score
        ? b.score - a.score
        : a.payback_id < b.payback_id ? -1 : a.payback_id > b.payback_id ? 1 : 0,
  );

  return { engine_version: engineVersion, candidates, excluded: { charges: excludedC, paybacks: excludedP } };
}

function pickCharge(c: MatchCharge): PairInputs['charge'] {
  return {
    id: c.id,
    source: c.source,
    vehicle_id: c.vehicle_id ?? null,
    driver_id: c.driver_id ?? null,
    plaza_id: c.plaza_id ?? null,
    occurred_at: c.occurred_at,
    time_precision: c.time_precision,
    amount_minor: c.amount_minor,
    remaining_minor: c.remaining_minor,
    evidence_status: c.evidence_status,
  };
}

function pickPayback(p: MatchPayback): PairInputs['payback'] {
  return {
    id: p.id,
    platform: p.platform,
    kind: p.kind,
    platform_trip_id: p.platform_trip_id ?? null,
    driver_id: p.driver_id ?? null,
    paid_on: p.paid_on,
    amount_minor: p.amount_minor,
    remaining_minor: p.remaining_minor,
    received_by: p.received_by,
  };
}

function pickTrip(t: MatchTrip): NonNullable<PairInputs['trip']> {
  return {
    platform: t.platform,
    platform_trip_id: t.platform_trip_id,
    vehicle_id: t.vehicle_id ?? null,
    request_at: t.request_at ?? null,
    pickup_at: t.pickup_at ?? null,
    dropoff_at: t.dropoff_at ?? null,
    time_precision: t.time_precision,
  };
}
