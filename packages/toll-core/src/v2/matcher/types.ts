/**
 * Toll v2 matcher types (design B4; Part F P2-R3).
 *
 * The matcher suggests which platform PAYBACK covers which toll CHARGE. Trips are the bridge:
 * a trip-line payback belongs to a trip, and a charge belongs to a trip when the same vehicle
 * crossed inside the trip's window. A support adjustment (no trip) is matched by driver + date.
 *
 * Roam crossings are native (written with their payback and allocation at ride end) and are
 * never matched.
 */

export type TimePrecision = 'exact' | 'minute' | 'date_only';

/** A charge as the matcher sees it. `remaining_minor` = amount − active allocations. */
export interface MatchCharge {
  id: string;
  source: string; // tag_statement | driver_cash | manual | roam_ride | legacy
  vehicle_id: string | null;
  driver_id: string | null;
  plaza_id: string | null;
  occurred_at: string; // ISO timestamp
  time_precision: TimePrecision;
  amount_minor: number;
  remaining_minor: number;
  evidence_status: 'unverified' | 'verified' | 'rejected';
  duplicate_of: string | null;
  after_seal: boolean;
  is_legacy: boolean;
  week_sealed: boolean;
}

export interface MatchTrip {
  platform: string;
  platform_trip_id: string;
  vehicle_id: string | null;
  driver_id: string | null;
  request_at: string | null;
  pickup_at: string | null;
  dropoff_at: string | null;
  time_precision: TimePrecision;
  payment_method: string;
  is_legacy: boolean;
}

/** `remaining_minor` = amount − active platform allocations − active "left unlinked" amounts. */
export interface MatchPayback {
  id: string;
  platform: string;
  kind: 'trip_line' | 'adjustment' | 'native';
  platform_trip_id: string | null;
  driver_id: string | null;
  paid_on: string; // YYYY-MM-DD (Jamaica)
  amount_minor: number;
  remaining_minor: number;
  received_by: 'fleet' | 'driver';
  reversal_of: string | null;
  reversed: boolean;
  after_seal: boolean;
  is_legacy: boolean;
  week_sealed: boolean;
}

export interface MatchPlatformSetting {
  platform: string;
  auto_apply: boolean;
  payback_mode: string;
  takes_disputes?: boolean;
}

export interface MatchPlazaRate {
  plaza_id: string;
  platform: string;
  amount_minor: number;
  valid_from: string; // YYYY-MM-DD Jamaica
}

export interface MatchDispute {
  id: string;
  charge_id: string;
  state: 'to_send' | 'sent' | 'expired' | 'won' | 'part_won' | 'lost';
  platform: string;
  platform_trip_id: string;
  driver_id: string;
  owed_minor: number;
  recovered_minor: number;
  opened_late: boolean;
  version: number;
  refund_from: string; // YYYY-MM-DD
  refund_to: string;
}

export type SuggestionKind = 'payback' | 'dispute_refund';

/** What the database hands the engine (`toll_sys_match_claim`). */
export interface MatchBundle {
  claim_id?: string | null;
  focal: { charge_ids: string[]; payback_ids: string[] };
  charges: MatchCharge[];
  paybacks: MatchPayback[];
  trips: MatchTrip[];
  settings: MatchPlatformSetting[];
  rates?: MatchPlazaRate[];
  disputes?: MatchDispute[];
}

export interface MatcherConfig {
  approach_minutes: number;
  post_trip_minutes: number;
  /** Slack added on both sides of a window for a timestamp of this precision. */
  precision_slack_seconds: { exact: number; minute: number };
  amount_close_ratio: number;
  adjustment_lookback_days: number;
  auto_apply_min_score: number;
  points: {
    on_trip: number;
    enroute: number;
    post_trip: number;
    same_day: number;
    adjustment_same_day: number;
    adjustment_within_lookback: number;
    amount_exact: number;
    amount_close: number;
    sole_candidate: number;
  };
}

export type WindowHit =
  | 'on_trip'
  | 'enroute'
  | 'post_trip'
  | 'same_day'
  | 'adjustment_same_day'
  | 'adjustment_within_lookback'
  | 'refund_window';

/**
 * Everything one suggestion's score depends on. Stored as `toll.suggestions.inputs`;
 * `scorePair(inputs)` on the stored value gives the stored score (I11).
 */
export interface PairInputs {
  engine_version: string;
  config: MatcherConfig;
  kind?: SuggestionKind;
  dispute_id?: string;
  charge: Pick<
    MatchCharge,
    'id' | 'source' | 'vehicle_id' | 'driver_id' | 'plaza_id' | 'occurred_at' | 'time_precision' |
    'amount_minor' | 'remaining_minor' | 'evidence_status'
  >;
  payback: Pick<
    MatchPayback,
    'id' | 'platform' | 'kind' | 'platform_trip_id' | 'driver_id' | 'paid_on' | 'amount_minor' |
    'remaining_minor' | 'received_by'
  >;
  trip: Pick<
    MatchTrip,
    'platform' | 'platform_trip_id' | 'vehicle_id' | 'request_at' | 'pickup_at' | 'dropoff_at' | 'time_precision'
  > | null;
  /** How many eligible pairs each side has in total (itself included). */
  competitors: { charge_candidates: number; payback_candidates: number };
  auto_apply_setting: boolean;
  /** B9: effective trip payback amount when a platform plaza rate applies. */
  platform_rate_minor?: number;
  takes_disputes_setting?: boolean;
  dispute?: Pick<MatchDispute, 'id' | 'state' | 'owed_minor' | 'recovered_minor' | 'platform_trip_id' | 'platform'>;
}

export interface ScoreParts {
  window: number;
  amount: number;
  sole_candidate: number;
  total: number;
  window_hit: WindowHit;
  amount_diff_minor: number;
  minutes_outside_trip: number;
  dispute_open_eligible?: boolean;
  dispute_settle_eligible?: boolean;
}

export interface Scored {
  score: number;
  score_parts: ScoreParts;
  rules_fired: string[];
  /** B4 auto-apply test result. In P2-R3 nothing is applied (shadow). */
  auto_apply: boolean;
}

export interface Candidate extends Scored {
  kind?: SuggestionKind;
  dispute_id?: string;
  charge_id: string;
  payback_id: string;
  inputs: PairInputs;
  dispute_open_eligible?: boolean;
  dispute_settle_eligible?: boolean;
}

export interface Excluded {
  id: string;
  reason: string;
}

export interface MatchResult {
  engine_version: string;
  candidates: Candidate[];
  excluded: { charges: Excluded[]; paybacks: Excluded[] };
}
