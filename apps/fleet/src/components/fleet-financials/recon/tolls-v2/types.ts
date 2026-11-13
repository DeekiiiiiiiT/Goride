export type TollV2Confidence = 'sure' | 'likely' | 'two_trips' | null;

export type TollV2ChargeSection =
  | 'suggested'
  | 'pick'
  | 'no_trip'
  | 'awaiting_cash'
  | 'receipts'
  | 'duplicates'
  | 'decided';

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
};

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
  | 'reverse_payback';
