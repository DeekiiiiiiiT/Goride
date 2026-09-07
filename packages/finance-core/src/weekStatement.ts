/**
 * Weekly statements (audit §6, Phase 4).
 *
 * A WeekStatement is an immutable, versioned fact for one driver-week in one
 * lane (fuel / toll / earnings). Fuel finalize publishes a `fuel` statement,
 * toll finish a `toll` statement, the earnings/cash block an `earnings`
 * statement. `rebuildDriverFinancialPeriod` reads statements only (behind a
 * flag), shadow-compared against the legacy projection until zero drift.
 *
 * A new fact on a closed week never mutates in place: it creates version n+1
 * superseding the prior closed row, with a visible delta and an audit row.
 */
import { round2 } from './money.ts';
import { buildCloseHash } from './closeHash.ts';

export type WeekStatementKind = 'fuel' | 'toll' | 'earnings';
export type WeekStatementStatus = 'draft' | 'closed' | 'restated';

export const WEEK_STATEMENT_KINDS: readonly WeekStatementKind[] = ['fuel', 'toll', 'earnings'];

/** Amounts held as integer minor units (cents), keyed by canonical field name. */
export type StatementAmountsMinor = Record<string, number>;

export type WeekStatement = {
  id?: string;
  kind: WeekStatementKind;
  organizationId: string;
  driverId: string;
  /** ISO date (Monday anchor) — YYYY-MM-DD. */
  weekKey: string;
  version: number;
  status: WeekStatementStatus;
  amountsMinor: StatementAmountsMinor;
  sourceRowIds: string[];
  sourceHash?: string | null;
  engineVersion?: string | null;
  closedAt?: string | null;
  closedBy?: string | null;
  closeReason?: string | null;
  supersedes?: string | null;
  createdAt?: string;
};

/** Map a DB row (snake_case public.week_statements) into a WeekStatement. */
export function mapRowToWeekStatement(row: Record<string, unknown>): WeekStatement {
  return {
    id: row.id != null ? String(row.id) : undefined,
    kind: String(row.kind) as WeekStatementKind,
    organizationId: String(row.organization_id ?? ''),
    driverId: String(row.driver_id ?? ''),
    weekKey: String(row.week_key ?? '').slice(0, 10),
    version: Number(row.version) || 1,
    status: String(row.status ?? 'draft') as WeekStatementStatus,
    amountsMinor: (row.amounts_minor as StatementAmountsMinor) ?? {},
    sourceRowIds: Array.isArray(row.source_row_ids) ? (row.source_row_ids as unknown[]).map(String) : [],
    sourceHash: (row.source_hash as string | null) ?? null,
    engineVersion: (row.engine_version as string | null) ?? null,
    closedAt: (row.closed_at as string | null) ?? null,
    closedBy: (row.closed_by as string | null) ?? null,
    closeReason: (row.close_reason as string | null) ?? null,
    supersedes: (row.supersedes as string | null) ?? null,
    createdAt: row.created_at != null ? String(row.created_at) : undefined,
  };
}

/** Map a WeekStatement to a DB insert body for public.week_statements. */
export function weekStatementToRow(s: WeekStatement): Record<string, unknown> {
  return {
    kind: s.kind,
    organization_id: s.organizationId,
    driver_id: s.driverId,
    week_key: s.weekKey,
    version: s.version,
    status: s.status,
    amounts_minor: s.amountsMinor ?? {},
    source_row_ids: s.sourceRowIds ?? [],
    source_hash: s.sourceHash ?? null,
    engine_version: s.engineVersion ?? null,
    closed_at: s.closedAt ?? null,
    closed_by: s.closedBy ?? null,
    close_reason: s.closeReason ?? null,
    supersedes: s.supersedes ?? null,
  };
}

/**
 * Deterministic content hash of a statement's identity + amounts + sources.
 * Binds the signed fact to its inputs (audit H-4) so any later divergence is
 * detectable on read. Excludes volatile fields (id, createdAt, status).
 */
export function hashWeekStatement(s: WeekStatement): Promise<string> {
  return buildCloseHash({
    kind: s.kind,
    organizationId: s.organizationId,
    driverId: s.driverId,
    weekKey: s.weekKey,
    version: s.version,
    engineVersion: s.engineVersion ?? null,
    amountsMinor: s.amountsMinor ?? {},
    sourceRowIds: [...(s.sourceRowIds ?? [])].map(String).sort(),
  });
}

export class StatementsNotClosedError extends Error {
  readonly code = 'STATEMENTS_NOT_CLOSED';
  readonly missing: WeekStatementKind[];
  readonly notClosed: WeekStatementKind[];
  constructor(missing: WeekStatementKind[], notClosed: WeekStatementKind[]) {
    super(
      `STATEMENTS_NOT_CLOSED: settlement requires closed fuel/toll/earnings statements` +
        (missing.length ? ` — missing: ${missing.join(', ')}` : '') +
        (notClosed.length ? ` — not closed: ${notClosed.join(', ')}` : ''),
    );
    this.name = 'StatementsNotClosedError';
    this.missing = missing;
    this.notClosed = notClosed;
  }
}

/**
 * Settlement precondition: fuel, toll AND earnings statements must all exist
 * and be `closed` for the driver-week. Throws StatementsNotClosedError listing
 * exactly which lanes are missing or still open.
 */
export function assertStatementsClosedForSettlement(
  statements: readonly WeekStatement[],
): void {
  const byKind = new Map<WeekStatementKind, WeekStatement>();
  for (const s of statements) {
    // keep the highest version per lane
    const prev = byKind.get(s.kind);
    if (!prev || s.version >= prev.version) byKind.set(s.kind, s);
  }
  const missing: WeekStatementKind[] = [];
  const notClosed: WeekStatementKind[] = [];
  for (const kind of WEEK_STATEMENT_KINDS) {
    const s = byKind.get(kind);
    if (!s) missing.push(kind);
    else if (s.status !== 'closed') notClosed.push(kind);
  }
  if (missing.length || notClosed.length) {
    throw new StatementsNotClosedError(missing, notClosed);
  }
}

// ── Shadow compare (Phase 4 flag rollout) ─────────────────────────────────────

const SHADOW_EPS_MINOR = 1; // 1 cent

export type StatementShadowDrift = {
  kind: WeekStatementKind;
  field: string;
  statementMinor: number;
  projectionMinor: number;
  deltaMinor: number;
};

/**
 * Legacy projection fields (major units) that the statement amounts must match
 * once the statement engine is authoritative. Passed straight from a
 * driver_financial_periods row.
 */
export type LegacyProjectionForShadow = {
  fuel_deduction?: number | null;
  fuel_fleet_share?: number | null;
  toll_spend?: number | null;
  toll_charged_to_driver?: number | null;
  toll_reimbursed?: number | null;
  cash_collected?: number | null;
  driver_share?: number | null;
  fleet_share?: number | null;
  tips_paid_to_driver?: number | null;
  earnings_gross?: number | null;
};

/** amounts_minor key → projection column, per lane. */
const SHADOW_FIELD_MAP: Record<WeekStatementKind, Record<string, keyof LegacyProjectionForShadow>> = {
  fuel: {
    driverShare: 'fuel_deduction',
    companyShare: 'fuel_fleet_share',
  },
  toll: {
    totalSpend: 'toll_spend',
    chargedToDriver: 'toll_charged_to_driver',
    reimbursed: 'toll_reimbursed',
  },
  earnings: {
    driverShare: 'driver_share',
    companyShare: 'fleet_share',
    tipsPaidToDriver: 'tips_paid_to_driver',
    passengerCash: 'cash_collected',
    gross: 'earnings_gross',
  },
};

function projectionMinor(row: LegacyProjectionForShadow, col: keyof LegacyProjectionForShadow): number {
  return Math.round((Number(row[col]) || 0) * 100);
}

/**
 * Compare statement amounts (minor) against the legacy projection fields and
 * return every field that drifts beyond a 1-cent tolerance. An empty list means
 * the statement engine reproduces the legacy number exactly — the gate for
 * flipping PROJECTION_READS_WEEK_STATEMENTS on for a week.
 */
export function shadowCompareStatementVsProjection(
  statement: WeekStatement,
  projection: LegacyProjectionForShadow,
): StatementShadowDrift[] {
  const drifts: StatementShadowDrift[] = [];
  const map = SHADOW_FIELD_MAP[statement.kind] ?? {};
  for (const [amountKey, col] of Object.entries(map)) {
    const stmt = Math.round(Number(statement.amountsMinor?.[amountKey]) || 0);
    const proj = projectionMinor(projection, col);
    const delta = stmt - proj;
    if (Math.abs(delta) > SHADOW_EPS_MINOR) {
      drifts.push({
        kind: statement.kind,
        field: amountKey,
        statementMinor: stmt,
        projectionMinor: proj,
        deltaMinor: delta,
      });
    }
  }
  return drifts;
}

/** Compare a full set of lane statements against one projection row at once. */
export function shadowCompareStatementsVsProjection(
  statements: readonly WeekStatement[],
  projection: LegacyProjectionForShadow,
): StatementShadowDrift[] {
  return statements.flatMap((s) => shadowCompareStatementVsProjection(s, projection));
}

/** Convenience: read a statement amount back into major units. */
export function statementAmountMajor(s: WeekStatement, field: string): number {
  return round2((Number(s.amountsMinor?.[field]) || 0) / 100);
}
