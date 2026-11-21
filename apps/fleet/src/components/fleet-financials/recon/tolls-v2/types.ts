export type TollV2Confidence = 'sure' | 'likely' | 'two_trips' | null;

export type TollV2ChargeSection =
  | 'suggested'
  | 'pick'
  | 'no_trip'
  | 'awaiting_cash'
  | 'receipts'
  | 'duplicates'
  | 'decided'
  /** UI1: a decided charge with an open dispute (part 3); only when the disputes switch is on. */
  | 'disputes'
  /** UI1: a platform paid part and takes no disputes (part 5). */
  | 'part_paid';

/** The six parts of the Tolls step (C3): 1 Matches, 2 Pick a trip, 3 Disputes, 4 No trip, 5 Other checks, 6 Seal. */
export type TollV2PartNo = 1 | 2 | 3 | 4 | 5 | 6;

export type TollV2Trip = {
  platform?: string;
  tripId?: string;
  requestAt?: string;
  pickupAt?: string;
  dropoffAt?: string;
  paymentMethod?: string;
  timePrecision?: string;
};

export type TollV2Suggestion = {
  suggestionId: string;
  /** 'payback' → apply_suggestion; 'rider_pays_driver' (InDrive) → driver_pays / fleet_absorbs with suggestion_id. */
  kind?: 'payback' | 'rider_pays_driver' | string;
  reasonKey?: string;
  score?: number;
  top?: boolean;
  confidence?: TollV2Confidence;
  paybackId: string;
  paybackVersion: number;
  paidBackMinor: number;
  paybackOpenMinor?: number;
  trip?: TollV2Trip | null;
  alsoFits?: Array<{ chargeId: string; occurredAt?: string; plazaName?: string }>;
};

export type TollV2Decision = {
  kind?: string;
  by?: string;
  at?: string;
  trip?: TollV2Trip | null;
  undo?: { decision_id?: string; decisionId?: string; expected_versions?: Record<string, number> } | null;
  reasonCode?: string;
  note?: string;
};

export type TollV2Charge = {
  id: string;
  version: number;
  section: TollV2ChargeSection | string;
  state: string;
  occurredAt?: string;
  amountMinor: number;
  openMinor: number;
  allocatedMinor?: number;
  paidBy?: string;
  plazaName?: string;
  plate?: string;
  driverId?: string | null;
  driverName?: string;
  confidence?: TollV2Confidence;
  suggestions?: TollV2Suggestion[];
  receipt?: Record<string, unknown> | null;
  decision?: TollV2Decision | null;
  reviewPairId?: string | null;
  /** UI1: which of the six parts this charge belongs to (server). */
  part?: TollV2PartNo;
  disputeId?: string | null;
  /** What the driver was doing at the crossing, from the Uber activity timeline + trips (any platform). */
  driverStatus?: TollV2DriverStatus | null;
  /** Pending, no trip, and the driver was offline: likely personal use. Flag only; the owner decides. */
  offlineFlag?: boolean;
};

export type TollV2DriverStatus = 'on_trip' | 'online' | 'offline' | 'no_timeline' | 'unknown';

export type TollV2Payback = {
  id: string;
  version: number;
  amountMinor: number;
  openMinor: number;
  paidOn?: string;
  reference?: string;
  trip?: TollV2Trip | null;
  driverId?: string | null;
};

export type TollV2KeptPayback = {
  id: string;
  paybackId?: string;
  amountMinor: number;
  reason?: string;
  trip?: TollV2Trip | null;
  undo?: TollV2Decision['undo'];
  by?: string;
  at?: string;
};

export type TollV2ReviewPair = {
  id: string;
  chargeA: string;
  chargeAVersion: number;
  chargeB: string;
  chargeBVersion: number;
};

export type TollV2Blocker = {
  kind: string;
  id?: string;
  amountMinor?: number;
  reason?: string;
  /** UI1: the part where this item is worked (server). */
  part?: TollV2PartNo;
};

export type TollV2PartPill = {
  part: TollV2PartNo;
  key: string;
  count: number;
  amountMinor: number;
  /** todo / clear; part 3 also waiting; part 6 sealed / ready / blocked. */
  status: string;
};

export type TollV2RefundCandidate = {
  paybackId: string;
  version: number;
  kind: string;
  paidOn?: string;
  openMinor: number;
  reference?: string | null;
  inRefundWindow?: boolean;
  suggestionId?: string | null;
  suggested?: boolean;
};

export type TollV2DisputeRow = {
  id: string;
  version: number;
  /** to_send, sent, won, part_won, lost, expired */
  state: string;
  closeReason?: string | null;
  platform?: string;
  driverId?: string;
  driverName?: string | null;
  chargeId?: string;
  chargeWeekKey?: string;
  postedInWeekKey?: string | null;
  openedLate?: boolean;
  occurredAt?: string;
  plazaName?: string | null;
  plate?: string | null;
  tollMinor: number;
  paidMinor: number;
  owedMinor: number;
  recoveredMinor?: number;
  leftMinor: number;
  trip?: TollV2Trip | null;
  deadline?: string;
  windowDays?: number | null;
  daysLeft?: number;
  windowClosed?: boolean;
  red?: boolean;
  late?: boolean;
  heldBySweep?: boolean;
  canMarkSent?: boolean;
  canRefundReceived?: boolean;
  canLost?: boolean;
  bearerIfNotSent?: { bearer: string; amountMinor: number } | null;
  /** Active rows: the charge week when it is not the week on screen ("From week of 2 Nov"). */
  fromWeekKey?: string | null;
  refundCandidates?: TollV2RefundCandidate[];
};

export type TollV2DisputeResult = TollV2DisputeRow & {
  /** won, part_won, lost, expired */
  outcome: string;
  borneMinor: number;
  bearer?: string | null;
  decider?: { by?: string; at?: string } | null;
  undo?: { decision_id?: string } | null;
};

export type TollV2DisputesBlock = {
  active: TollV2DisputeRow[];
  tiles: {
    toSend: { count: number; amountMinor: number };
    sent: { count: number; amountMinor: number };
    late: { count: number; amountMinor: number };
  };
  waitingMinor: number;
};

export type TollV2SumLine = {
  spendMinor: number;
  paidBackMinor: number;
  driverMinor: number;
  fleetMinor: number;
  waitingOnUberMinor: number;
  stillOpenMinor: number;
};

export type TollV2WeekResult = {
  spend: { totalMinor: number; tagMinor?: number; cashMinor?: number };
  bearers: { platformMinor: number; driverMinor: number; fleetMinor: number };
  tagAccount?: {
    openingMinor?: number;
    topUpsMinor?: number;
    usageMinor?: number;
    closingMinor?: number;
  };
  drivers?: Array<{ driverId: string; owesFleetMinor: number; driverName?: string }>;
};

export type TollV2LateItem = {
  kind: 'late_charge' | 'late_payback' | 'correction' | string;
  id: string;
  version: number;
  at?: string;
  amountMinor?: number;
  paidBy?: string;
  plazaName?: string;
  driverId?: string;
  platform?: string;
  reference?: string;
  oldAmountMinor?: number;
  newAmountMinor?: number;
  direction?: 'down' | 'up' | string;
  occurredAt?: string;
  changeId?: string;
  /** Late payback: the Uber trip it came with. */
  trip?: TollV2Trip | null;
};

export type TollV2TakeBackCandidate = {
  paybackId: string;
  version: number;
  weekKey: string;
  paidOn?: string;
  amountMinor?: number;
  weekSealed?: boolean;
  weekPaid?: boolean;
  trip?: TollV2Trip | null;
  reference?: string;
};

export type TollV2TakeBack = {
  id: string;
  platform?: string;
  reference?: string;
  driverId?: string;
  driverName?: string;
  paidOn?: string;
  amountMinor: number;
  candidates: TollV2TakeBackCandidate[];
};

export type TollV2WeeksOverview = {
  openWeek: string;
  weeks: Array<{
    weekKey: string;
    sealed: boolean;
    tolls?: number;
    spendMinor?: number;
    toDecide?: number;
    toDecideMinor?: number;
  }>;
  nightly?: {
    at?: string;
    ok?: boolean;
    checks?: Array<{ checkNo?: number; name?: string; ok?: boolean; detail?: string }>;
  };
  takeBacks: TollV2TakeBack[];
};

export type TollV2Desk = {
  weekKey: string;
  sealed: boolean;
  paid?: boolean;
  openWeek?: string;
  weekVersion: number;
  matcherBusy: boolean;
  result: TollV2WeekResult;
  charges: TollV2Charge[];
  paybacks: TollV2Payback[];
  kept: TollV2KeptPayback[];
  reviewPairs: TollV2ReviewPair[];
  blockers: TollV2Blocker[];
  late?: TollV2LateItem[];
  summary?: { offlineFlagged?: number; offlineFlaggedMinor?: number };
  /** UI1 keys (S3). */
  parts?: TollV2PartPill[];
  disputes?: TollV2DisputesBlock;
  results?: TollV2DisputeResult[];
  sumLine?: TollV2SumLine;
  earlierResults?: { refundedMinor: number; toDriverMinor: number; toFleetMinor: number };
  approvals?: { soleManager: boolean; thresholdMinor: number };
};

export type TollV2CommandIntent =
  | 'apply_suggestion'
  | 'driver_pays'
  | 'fleet_absorbs'
  | 'link_payback'
  | 'leave_payback_unlinked'
  | 'verify_cash_receipt'
  | 'correct_charge_amount'
  | 'reject_cash_receipt'
  | 'confirm_duplicate'
  | 'release_duplicate'
  | 'undo_decision'
  | 'seal_week'
  | 'reopen_week'
  | 'carry_forward'
  | 'reverse_payback'
  | 'mark_dispute_sent'
  | 'settle_dispute'
  | 'close_dispute_lost'
  | 'change_toll_settings';
