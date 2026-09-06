/**
 * Settlement command helpers — pure predicates + row factories (Phase 3).
 * Kept free of Hono/KV so Deno tests can cover caps / stale residual without the edge graph.
 */

export type SettlementMovementKind =
  | "collect"
  | "pay"
  | "write_off"
  | "reverse"
  | "verify";

export type SettlementApprovalState = "none" | "pending" | "approved" | "rejected";
export type SettlementMovementStatus = "posted" | "pending" | "void";

export interface CollectCommand {
  kind: "collect";
  driverId: string;
  weekAnchor: string;
  amount: number;
  method: string;
  reference?: string;
  reason?: string;
  idempotencyKey: string;
  expectedOutstanding: number;
  allowOverCollect?: boolean;
}

export interface PayCommand {
  kind: "pay";
  driverId: string;
  weekAnchor: string;
  amount: number;
  method: string;
  reference?: string;
  reason?: string;
  idempotencyKey: string;
  expectedOutstanding: number;
}

export interface WriteOffCommand {
  kind: "write_off";
  driverId: string;
  weekAnchor: string;
  amount: number;
  reason: string;
  reference?: string;
  idempotencyKey: string;
  expectedOutstanding: number;
}

export interface ReverseCommand {
  kind: "reverse";
  movementId: string;
  reason: string;
  idempotencyKey: string;
}

export type SettlementCommand =
  | CollectCommand
  | PayCommand
  | WriteOffCommand
  | ReverseCommand;

export class SettlementCommandError extends Error {
  code: string;
  status: number;
  details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    status = 400,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "SettlementCommandError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/** Major units → integer minor units (cents). */
export function toMinor(amount: number): number {
  return Math.round(Number(amount) * 100);
}

/** Minor → major for API responses. */
export function fromMinor(minor: number): number {
  return Number(minor) / 100;
}

/**
 * Optimistic concurrency: client residual must match server residual.
 * Throws STALE_RESIDUAL (409) when drift exceeds eps.
 */
export function assertExpectedOutstanding(
  actual: number,
  expected: number,
  eps = 0.005,
): void {
  const a = Number(actual);
  const e = Number(expected);
  if (!Number.isFinite(a) || !Number.isFinite(e)) {
    throw new SettlementCommandError(
      "STALE_RESIDUAL",
      "expectedOutstanding is not a finite number",
      409,
      { actual, expected },
    );
  }
  if (Math.abs(a - e) > eps) {
    throw new SettlementCommandError(
      "STALE_RESIDUAL",
      "Outstanding amount changed since you loaded this week. Refresh and try again.",
      409,
      { actual, expected, eps },
    );
  }
}

/**
 * Claim the period write lock via CAS on row_version.
 * Must run BEFORE movement insert so two concurrent pays cannot both succeed.
 * Throws STALE_RESIDUAL (409) when another writer won the race (updatedRow null).
 */
export function assertPeriodCasClaimed(
  updatedRow: unknown | null | undefined,
): void {
  if (updatedRow == null) {
    throw new SettlementCommandError(
      "STALE_RESIDUAL",
      "This week was updated by someone else. Refresh and try again.",
      409,
    );
  }
}

/**
 * Pure CAS bump: succeeds only when liveVersion === expectedRowVersion.
 * Callers must CAS against the version observed when residual was computed —
 * never against a fresh re-read (that lets two observers of v1 both win).
 */
export function casBumpRowVersion(
  liveVersion: number,
  expectedRowVersion: number,
): { next: number } | null {
  const live = Number(liveVersion) || 1;
  const expected = Number(expectedRowVersion) || 1;
  if (live !== expected) return null;
  return { next: expected + 1 };
}

/** Company-owes residual (pay queue). */
export function companyOwesResidual(settlementAmount: number): number {
  return Math.max(0, Number(settlementAmount) || 0);
}

/** Driver-owes residual (collect / write-off queue). */
export function driverOwesResidual(settlementAmount: number): number {
  return Math.max(0, -(Number(settlementAmount) || 0));
}

/**
 * Cap payouts: paidSoFar + amount must not exceed entitlement.
 * entitlement = total that may ever be paid for the week (e.g. gross positive + tips).
 */
export function enforcePayCap(
  paidSoFar: number,
  entitlement: number,
  amount: number,
): void {
  const paid = Math.max(0, Number(paidSoFar) || 0);
  const cap = Math.max(0, Number(entitlement) || 0);
  const amt = Math.max(0, Number(amount) || 0);
  if (!(amt > 0.005)) {
    throw new SettlementCommandError(
      "INVALID_AMOUNT",
      "Payout amount must be greater than zero",
      400,
    );
  }
  if (paid + amt > cap + 0.005) {
    throw new SettlementCommandError(
      "OVER_PAY_CAP",
      `Payout would exceed entitlement (paid ${paid.toFixed(2)} + ${amt.toFixed(2)} > ${cap.toFixed(2)}).`,
      400,
      { paidSoFar: paid, entitlement: cap, amount: amt },
    );
  }
}

/**
 * Cap collections against amount owed.
 * allowOver + reason required to intentionally over-collect.
 */
export function enforceCollectCap(
  owed: number,
  amount: number,
  allowOver = false,
  reason?: string,
): void {
  const owedAmt = Math.max(0, Number(owed) || 0);
  const amt = Math.max(0, Number(amount) || 0);
  if (!(amt > 0.005)) {
    throw new SettlementCommandError(
      "INVALID_AMOUNT",
      "Collection amount must be greater than zero",
      400,
    );
  }
  if (amt <= owedAmt + 0.005) return;
  if (allowOver) {
    const why = String(reason || "").trim();
    if (!why) {
      throw new SettlementCommandError(
        "OVER_COLLECT_REASON_REQUIRED",
        "Over-collection requires a reason.",
        400,
        { owed: owedAmt, amount: amt },
      );
    }
    return;
  }
  throw new SettlementCommandError(
    "OVER_COLLECT_CAP",
    `Collection ${amt.toFixed(2)} exceeds amount owed ${owedAmt.toFixed(2)}.`,
    400,
    { owed: owedAmt, amount: amt },
  );
}

export interface BuildMovementRowInput {
  organizationId: string;
  driverId: string;
  periodAnchor: string;
  kind: SettlementMovementKind;
  amountMinor: number;
  method?: string | null;
  reference?: string | null;
  reason?: string | null;
  actorId?: string | null;
  idempotencyKey: string;
  reversesMovementId?: string | null;
  approvalState?: SettlementApprovalState;
  status?: SettlementMovementStatus;
  sourceTransactionId?: string | null;
  metadata?: Record<string, unknown>;
}

/** Factory for ledger.settlement_movements insert payload (snake_case). */
export function buildMovementRow(input: BuildMovementRowInput): Record<string, unknown> {
  const key = String(input.idempotencyKey || "").trim();
  if (!key) {
    throw new SettlementCommandError(
      "IDEMPOTENCY_KEY_REQUIRED",
      "idempotencyKey is required",
      400,
    );
  }
  if (!input.organizationId || !input.driverId || !input.periodAnchor) {
    throw new SettlementCommandError(
      "INVALID_MOVEMENT",
      "organizationId, driverId, and periodAnchor are required",
      400,
    );
  }
  if (!Number.isFinite(input.amountMinor)) {
    throw new SettlementCommandError(
      "INVALID_AMOUNT",
      "amountMinor must be a finite integer",
      400,
    );
  }
  return {
    organization_id: input.organizationId,
    driver_id: input.driverId,
    period_anchor: String(input.periodAnchor).slice(0, 10),
    kind: input.kind,
    amount_minor: Math.trunc(input.amountMinor),
    method: input.method ?? null,
    reference: input.reference ?? null,
    reason: input.reason ?? null,
    actor_id: input.actorId ?? null,
    idempotency_key: key,
    reverses_movement_id: input.reversesMovementId ?? null,
    approval_state: input.approvalState ?? "none",
    status: input.status ?? "posted",
    source_transaction_id: input.sourceTransactionId ?? null,
    metadata: input.metadata ?? {},
  };
}

/** Stable uniqueness check helper for tests / pre-insert validation. */
export function isSameIdempotencyScope(
  a: { organizationId: string; idempotencyKey: string },
  b: { organizationId: string; idempotencyKey: string },
): boolean {
  return (
    String(a.organizationId) === String(b.organizationId) &&
    String(a.idempotencyKey).trim() === String(b.idempotencyKey).trim()
  );
}

/**
 * Residual impact of a posted movement (minor units).
 * Pay reduces company-owes; collect/write_off reduce driver-owes.
 * Void/pending contribute nothing. Reverse uses {@link reverseResidualDeltaMinor}.
 */
export function residualDeltaMinor(
  kind: Exclude<SettlementMovementKind, "reverse" | "verify">,
  amountMinor: number,
  status: SettlementMovementStatus | string,
): number {
  const st = String(status || "").toLowerCase();
  if (st === "void" || st === "pending") return 0;
  const a = Math.trunc(Math.abs(Number(amountMinor) || 0));
  if (kind === "pay") return -a;
  return a; // collect | write_off
}

/** Reverse undoes the original's residual impact (same absolute minor amount). */
export function reverseResidualDeltaMinor(
  originalKind: Exclude<SettlementMovementKind, "reverse" | "verify">,
  amountMinor: number,
): number {
  return -residualDeltaMinor(originalKind, amountMinor, "posted");
}

/**
 * Posted movement + matching reverse nets to zero on the period residual projection.
 */
export function movementReversalPairNetsToZero(
  originalKind: Exclude<SettlementMovementKind, "reverse" | "verify">,
  amountMinor: number,
): boolean {
  const posted = residualDeltaMinor(originalKind, amountMinor, "posted");
  const reverse = reverseResidualDeltaMinor(originalKind, amountMinor);
  return posted + reverse === 0 && posted !== 0;
}
