/**
 * Pure decision logic for adopting / purging JAA statement rows.
 * Server I/O lives in supabase/functions/_fleet-server/fuel_jaa_adopt.ts (relative import).
 * Leaf module — no package aliases — safe for Deno edge bundling.
 */

import { isUnlinkedCardCharge } from './jaaUnlinkedCardCharge.ts';

type Entry = Record<string, unknown>;

function metaOf(entry: Entry | null | undefined): Record<string, unknown> {
  const m = entry?.metadata;
  return m && typeof m === 'object' ? (m as Record<string, unknown>) : {};
}

export type AdoptionRefusal = { ok: false; status: number; error: string };

/**
 * Preconditions checked before any write. Statement must be an unmatched,
 * undismissed approved_fuel row and the operator must give a reason.
 */
export function validateAdoptPreconditions(
  stmt: Entry | null,
  input: { reason?: string | null },
): { ok: true } | AdoptionRefusal {
  if (!String(input.reason || '').trim()) {
    return { ok: false, status: 400, error: 'Adoption reason is required' };
  }
  if (!stmt) return { ok: false, status: 404, error: 'Statement row not found' };
  const m = metaOf(stmt);
  if (m.jaaMatchedDriverEntryId) {
    return { ok: false, status: 409, error: 'Statement already linked to a log' };
  }
  if (m.adoptionDismissedAt) {
    return { ok: false, status: 409, error: 'Statement was dismissed' };
  }
  if (!isUnlinkedCardCharge(stmt as Parameters<typeof isUnlinkedCardCharge>[0])) {
    return {
      ok: false,
      status: 400,
      error: 'Only unmatched approved fuel statements can be adopted',
    };
  }
  return { ok: true };
}

export type StationMode = 'jaa_text' | 'verified';

/** Confirm-flow fields: odometer required; verified mode needs a station id. */
export function validateConfirmAdoptFields(input: {
  odometer?: number | null;
  stationMode?: StationMode | null;
  matchedStationId?: string | null;
}): { ok: true } | AdoptionRefusal {
  const odo = input.odometer != null ? Number(input.odometer) : NaN;
  if (!Number.isFinite(odo) || odo <= 0) {
    return { ok: false, status: 400, error: 'Odometer is required to confirm an unmatched charge' };
  }
  const mode =
    input.stationMode === 'verified'
      ? 'verified'
      : input.stationMode === 'jaa_text'
        ? 'jaa_text'
        : null;
  if (!mode) {
    return { ok: false, status: 400, error: 'Station confirmation mode is required' };
  }
  if (mode === 'verified' && !String(input.matchedStationId || '').trim()) {
    return {
      ok: false,
      status: 400,
      error: 'Pick a verified station or keep the statement merchant',
    };
  }
  return { ok: true };
}

export type BuildAdoptedOpsEntryInput = {
  statement: Entry;
  driverId: string;
  vehicleId: string;
  odometer?: number | null;
  reason: string;
  adoptedBy: string;
  organizationId: string;
  /** Confirm flow: keep JAA merchant text or attach a verified station. */
  stationMode?: StationMode | null;
  matchedStationId?: string | null;
  stationName?: string | null;
  stationAddress?: string | null;
  /** Injectable for tests; defaults to crypto.randomUUID / now. */
  id?: string;
  nowIso?: string;
};

/** Ops-side row for an unlogged fill. Money arrives only via applyFuelMatchLinks. */
export function buildAdoptedOpsEntry(input: BuildAdoptedOpsEntryInput): Entry {
  const stmt = input.statement;
  const stmtMeta = metaOf(stmt);
  const odo =
    input.odometer != null && Number.isFinite(Number(input.odometer)) && Number(input.odometer) > 0
      ? Number(input.odometer)
      : null;
  const nowIso = input.nowIso || new Date().toISOString();
  const jaaMileage = Number(stmtMeta.jaaMileage);
  const odometerSource =
    odo != null && Number.isFinite(jaaMileage) && jaaMileage > 0 && odo === jaaMileage
      ? 'jaa_mileage'
      : odo != null
        ? 'operator'
        : undefined;

  const stationMode =
    input.stationMode === 'verified'
      ? 'verified'
      : input.stationMode === 'jaa_text'
        ? 'jaa_text'
        : null;
  const verifiedId = String(input.matchedStationId || '').trim();
  const verifiedName = String(input.stationName || '').trim();
  const verifiedAddress = String(input.stationAddress || '').trim();
  const location =
    stationMode === 'verified' && verifiedName
      ? verifiedName
      : (stmt.location as string | undefined);

  const metadata: Record<string, unknown> = {
    awaitingCardStatement: true,
    countsInFuelSpend: false,
    countsInFuelVolume: false,
    paymentSource: 'company_card',
    fillOrigin: 'statement_adopted',
    adoptedFromStatementId: stmt.id,
    adoptedBy: input.adoptedBy,
    adoptedAt: nowIso,
    adoptionReason: input.reason,
    odometerMissing: odo == null,
    driverAttested: false,
    entrySource: 'admin-manual',
    isManual: true,
    source: 'Manual',
    // Never importSource / jaaImportId / jaaRowKind: purge deletes by those keys (F4)
    // and jaaRowKind would classify this row as a statement row.
    jaaCardCode: stmtMeta.jaaCardCode,
  };
  if (odometerSource) metadata.odometerSource = odometerSource;
  if (Number.isFinite(jaaMileage) && jaaMileage > 0) metadata.jaaMileageSuggested = jaaMileage;

  if (stationMode === 'verified' && verifiedId) {
    metadata.stationSource = 'verified';
    metadata.matchedStationId = verifiedId;
    metadata.locationStatus = 'verified';
    metadata.verificationMethod = 'operator_confirm';
    metadata.stationAttestedAt = nowIso;
    metadata.stationAttestedBy = input.adoptedBy;
  } else if (stationMode === 'jaa_text') {
    metadata.stationSource = 'jaa_merchant';
    metadata.stationConfirmedAsJaa = true;
    // Merchant text only — still needs a verified link later if ops wants the blue check.
    metadata.locationStatus = 'unknown';
    metadata.stationAttestedAt = nowIso;
    metadata.stationAttestedBy = input.adoptedBy;
  }

  const row: Entry = {
    id: input.id || crypto.randomUUID(),
    date: stmt.date,
    time: stmt.time,
    cardId: stmt.cardId,
    vehicleId: input.vehicleId || stmt.vehicleId,
    driverId: input.driverId,
    amount: 0,
    liters: undefined,
    odometer: odo,
    entryMode: odo != null ? 'Anchor' : 'Floating',
    type: 'Manual_Entry',
    paymentSource: 'Gas_Card',
    entrySource: 'admin-manual',
    // Unset so the Unattributed chip / Review Queue owns the service-line decision (F6).
    usageCategory: undefined,
    reconciliationStatus: 'Pending',
    organizationId: input.organizationId || stmt.organizationId,
    location,
    metadata,
  };

  if (stationMode === 'verified' && verifiedId) {
    row.matchedStationId = verifiedId;
    row.locationStatus = 'verified';
    if (verifiedAddress) row.stationAddress = verifiedAddress;
  }

  return row;
}

/** Reverse money copied from a statement onto an ops log (CSV rollback). */
export function unlinkOpsFromDeletedStatement(ops: Entry): Entry {
  const m = metaOf(ops);
  const nextMeta: Record<string, unknown> = { ...m };
  delete nextMeta.jaaMatchedStatementId;
  delete nextMeta.jaaMatchStatus;
  delete nextMeta.jaaMatchedAt;
  delete nextMeta.jaaReceiptNumber;
  delete nextMeta.jaaResponse;
  delete nextMeta.jaaFuelType;
  delete nextMeta.jaaMatchScore;
  nextMeta.awaitingCardStatement = true;
  nextMeta.countsInFuelSpend = false;
  nextMeta.countsInFuelVolume = false;
  if (m.fillOrigin === 'statement_adopted') nextMeta.orphanAfterStatementPurge = true;
  return {
    ...ops,
    amount: m.priorDriverAmount != null ? Number(m.priorDriverAmount) || 0 : 0,
    liters: m.priorDriverLiters != null ? m.priorDriverLiters : undefined,
    reconciliationStatus: 'Pending',
    metadata: nextMeta,
  };
}

export type StatementPurgePlan =
  | { refuse: true; status: 409; error: string; adoptedChildIds: string[] }
  | { refuse: false; opsToUnlink: Entry[] };

/**
 * Decide what a statement purge must do to its children before deleting.
 * Adopted children exist only because of the statement → refuse; matched driver
 * logs are unlinked and their copied money reversed.
 */
export function planStatementPurge(
  allEntries: Entry[],
  statementIds: string[],
): StatementPurgePlan {
  const idSet = new Set(statementIds.map(String));
  const adoptedChildIds: string[] = [];
  const opsToUnlink: Entry[] = [];

  for (const e of allEntries) {
    if (!e?.id) continue;
    const m = metaOf(e);
    const parent = String(m.adoptedFromStatementId || m.jaaMatchedStatementId || '');
    if (!parent || !idSet.has(parent)) continue;
    if (m.fillOrigin === 'statement_adopted' || m.adoptedFromStatementId) {
      adoptedChildIds.push(String(e.id));
    } else if (m.jaaMatchedStatementId) {
      opsToUnlink.push(unlinkOpsFromDeletedStatement(e));
    }
  }

  if (adoptedChildIds.length) {
    return {
      refuse: true,
      status: 409,
      error: `Cannot purge import: ${adoptedChildIds.length} adopted fill(s) still reference statement rows. Un-adopt them first.`,
      adoptedChildIds,
    };
  }
  return { refuse: false, opsToUnlink };
}
