export interface AdapterProblem {
  row: number;
  reason: string;
}

export interface TagStatementChargeRow {
  source_ref: string;
  occurred_at: string;
  amount_minor: number;
  plaza_id: string;
  vehicle_id: string;
  driver_id?: string;
  time_precision: 'minute';
}

export interface TopupRow {
  source_ref: string;
  topped_up_on: string;
  amount_minor: number;
  provider: 'transjam';
  account_ref: string;
  vehicle_id?: string;
}

export interface UberTripRow {
  row_type: 'trip';
  platform_trip_id: string;
  driver_id: string;
  vehicle_id: string;
  request_at: string;
  dropoff_at?: string;
  time_precision: 'minute';
  payment_method: 'cash' | 'card';
  toll_payback_minor?: number;
}

export interface UberAdjustmentRow {
  row_type: 'adjustment';
  reference: string;
  driver_id: string;
  paid_on: string;
  amount_minor: number;
}

export type UberRow = UberTripRow | UberAdjustmentRow;

export interface IndriveTripRow {
  row_type: 'trip';
  platform_trip_id: string;
  driver_id: string;
  vehicle_id: string;
  request_at: string;
  dropoff_at?: string;
  payment_method: 'cash' | 'card' | 'unknown';
  toll_payback_minor?: number;
}

export interface DriverCashEvidence {
  receipt_url: string;
  plaza?: string;
  lane?: string;
  collector?: string;
  vehicleClass?: string;
}

export interface DriverCashRow {
  source_ref: string;
  occurred_at: string;
  amount_minor: number;
  plaza_id: string;
  vehicle_id: string;
  driver_id: string;
  evidence: DriverCashEvidence;
  evidence_status: 'unverified';
}

export interface TagStatementCtx {
  tagToVehicle: Record<string, string>;
  vehicleToDriver: Record<string, string>;
  plazaIdByName: Record<string, string>;
}

export interface TopupProviderCtx {
  tagToVehicle?: Record<string, string>;
}

export interface UberCtx {
  driverByUberUuid: Record<string, string>;
  vehicleByPlate: Record<string, string>;
}

export interface IndriveCtx {
  driverByExternalId?: Record<string, string>;
  vehicleByPlate?: Record<string, string>;
}

export interface TagStatementResult {
  kind: 'tag_statement';
  rows: TagStatementChargeRow[];
  topups: TopupRow[];
  problems: AdapterProblem[];
}

export interface TopupProviderResult {
  kind: 'topups';
  rows: TopupRow[];
  problems: AdapterProblem[];
}

export interface UberResult {
  kind: 'uber';
  rows: UberRow[];
  problems: AdapterProblem[];
}

export interface IndriveResult {
  kind: 'indrive';
  rows: IndriveTripRow[];
  problems: AdapterProblem[];
}

export interface DriverCashSubmission {
  submissionId: string;
  receiptNumber?: string;
  receiptUrl?: string;
  occurredAt: string;
  amountMinor: number;
  plazaId: string;
  vehicleId: string;
  driverId: string;
  plaza?: string;
  lane?: string;
  collector?: string;
  vehicleClass?: string;
}

export interface DriverCashReceiptResult {
  kind: 'driver_cash';
  rows: DriverCashRow[];
  problems: AdapterProblem[];
}
