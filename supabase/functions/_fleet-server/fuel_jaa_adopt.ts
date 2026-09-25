/**
 * Adopt / link / dismiss unmatched JAA approved_fuel statement rows into Transaction Logs.
 * Money always flows through persistFuelMatchPair — never invent a parallel writer.
 * Pure decision logic lives in packages/roam-shared/src/fuel/jaaStatementAdoption.ts (tested).
 */
import * as kv from "./kv_store.tsx";
import { isJaaStatementLedgerRow } from "./fuel_jaa_ledger.ts";
import { isUnlinkedCardCharge } from "../../../packages/roam-shared/src/fuel/jaaUnlinkedCardCharge.ts";
import {
  buildAdoptedOpsEntry,
  planStatementPurge,
  validateAdoptPreconditions,
  validateConfirmAdoptFields,
  type StationMode,
} from "../../../packages/roam-shared/src/fuel/jaaStatementAdoption.ts";
import {
  WEEK_SEALED_MATCH_CODE,
  datesAndOrgForMatchPair,
} from "../../../packages/roam-shared/src/fuel/jaaMatchSeal.ts";
import { persistFuelMatchPair } from "./fuel_jaa_match.ts";
import { isFeatureEnabled, FEATURE_FLAGS } from "./feature_flags.ts";
import { weekKeyForDateStr } from "./period_reset.ts";
import { getServiceClient } from "./service_client.ts";
import { getFleetTimezone } from "./timezone_helper.tsx";

export { unlinkOpsFromDeletedStatement } from "../../../packages/roam-shared/src/fuel/jaaStatementAdoption.ts";
export { WEEK_SEALED_MATCH_CODE, datesAndOrgForMatchPair };

function metaOf(entry: Record<string, unknown>): Record<string, unknown> {
  const m = entry?.metadata;
  return m && typeof m === "object" ? (m as Record<string, unknown>) : {};
}

function ymd(v: unknown): string {
  return String(v || "").slice(0, 10);
}

/** Org-level fuel week lock — refuse adopt/link/dismiss into sealed weeks. */
export async function isOrgFuelWeekSealed(orgId: string, dateYmd: string): Promise<boolean> {
  if (!orgId || !dateYmd) return false;
  const tz = await getFleetTimezone("fleet").catch(() => "America/Jamaica");
  const weekKey = weekKeyForDateStr(dateYmd, tz);
  if (!weekKey) return false;
  const sb = getServiceClient();
  const periodId = `${orgId}:${weekKey}`;
  const { data: recon } = await sb
    .from("fuel_reconciliation_period")
    .select("status, locked_at")
    .eq("org_id", orgId)
    .eq("id", periodId)
    .maybeSingle();
  if (recon && (String(recon.status) === "locked" || recon.locked_at)) return true;
  return false;
}

/**
 * Refuse match persist when either side lands in a sealed org week.
 * Evaluated before any write — same lock as adopt/link/dismiss.
 */
export async function refuseIfMatchPairWeekSealed(
  pair: {
    statementEntry?: Record<string, unknown>;
    driverEntry?: Record<string, unknown>;
  },
  fallbackOrgId: string,
): Promise<
  | { ok: true }
  | { ok: false; status: 409; code: typeof WEEK_SEALED_MATCH_CODE; error: string }
> {
  const { orgId, datesYmd } = datesAndOrgForMatchPair(pair, fallbackOrgId);
  if (!orgId || datesYmd.length === 0) {
    return {
      ok: false,
      status: 409,
      code: WEEK_SEALED_MATCH_CODE,
      error: "Week is closed — rematch cannot modify sealed fuel weeks (missing org or date)",
    };
  }
  for (const d of datesYmd) {
    if (await isOrgFuelWeekSealed(orgId, d)) {
      return {
        ok: false,
        status: 409,
        code: WEEK_SEALED_MATCH_CODE,
        error: "Week is closed — rematch cannot modify sealed fuel weeks",
      };
    }
  }
  return { ok: true };
}

async function assertAdoptFlag(orgId: string): Promise<void> {
  const on = await isFeatureEnabled(FEATURE_FLAGS.FUEL_STATEMENT_ADOPT, orgId);
  if (!on) {
    throw Object.assign(new Error("Statement adopt is not enabled for this organization"), {
      status: 403,
    });
  }
}

async function loadFuelEntry(id: string): Promise<Record<string, unknown> | null> {
  const row = await kv.get(`fuel_entry:${id}`);
  return row && typeof row === "object" ? (row as Record<string, unknown>) : null;
}

/**
 * Before purging statement rows for an import: refuse if adopted children exist;
 * otherwise unlink matched driver logs and reverse copied money.
 */
export async function prepareStatementPurge(
  statementIds: string[],
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const all = ((await kv.getByPrefix("fuel_entry:")) || []) as Record<string, unknown>[];
  const plan = planStatementPurge(all, statementIds);
  if (plan.refuse) return { ok: false, status: plan.status, error: plan.error };
  for (const ops of plan.opsToUnlink) {
    await kv.set(`fuel_entry:${ops.id}`, ops);
  }
  return { ok: true };
}

export async function adoptUnlinkedStatement(input: {
  statementId: string;
  reason: string;
  adoptedBy: string;
  organizationId: string;
  driverId?: string;
  vehicleId?: string;
  odometer?: number | null;
  stationMode?: StationMode | null;
  matchedStationId?: string | null;
  stationName?: string | null;
  stationAddress?: string | null;
}): Promise<{
  ok: boolean;
  status?: number;
  error?: string;
  statementId?: string;
  driverEntryId?: string;
}> {
  await assertAdoptFlag(input.organizationId);

  const stmt = await loadFuelEntry(input.statementId);
  const pre = validateAdoptPreconditions(stmt, { reason: input.reason });
  if (!pre.ok) return pre;
  const statement = stmt as Record<string, unknown>;

  // Confirm flow always sends stationMode; legacy callers without it keep optional odo.
  const isConfirm = input.stationMode === "jaa_text" || input.stationMode === "verified";
  if (isConfirm) {
    const confirmPre = validateConfirmAdoptFields({
      odometer: input.odometer,
      stationMode: input.stationMode,
      matchedStationId: input.matchedStationId,
    });
    if (!confirmPre.ok) return confirmPre;
  }

  const orgId = String(input.organizationId || statement.organizationId || "");
  if (await isOrgFuelWeekSealed(orgId, ymd(statement.date))) {
    return {
      ok: false,
      status: 409,
      error: "Cannot adopt into a sealed/closed fuel week. Re-finalize if a historical correction is required.",
    };
  }

  const driverId = String(input.driverId || statement.driverId || "").trim();
  if (!driverId) {
    return { ok: false, status: 400, error: "Driver is required (card was unassigned at transaction time)" };
  }

  let stationName = input.stationName ? String(input.stationName).trim() : "";
  let stationAddress = input.stationAddress ? String(input.stationAddress).trim() : "";
  const matchedStationId =
    input.stationMode === "verified" ? String(input.matchedStationId || "").trim() : "";

  if (input.stationMode === "verified") {
    const station = await kv.get(`station:${matchedStationId}`);
    if (!station || typeof station !== "object") {
      return { ok: false, status: 400, error: "Verified station not found" };
    }
    const s = station as Record<string, unknown>;
    stationName = String(s.name || stationName || "").trim();
    stationAddress = String(s.address || stationAddress || "").trim();
    if (!stationName) {
      return { ok: false, status: 400, error: "Verified station has no name" };
    }
  }

  // Re-read immediately before writing and persist the fresh copy, so a concurrent
  // match or dismissal is refused rather than clobbered (KV has no transactions).
  const fresh = await loadFuelEntry(input.statementId);
  const freshPre = validateAdoptPreconditions(fresh, { reason: input.reason });
  if (!freshPre.ok) return freshPre;
  const freshStatement = fresh as Record<string, unknown>;

  const adopted = buildAdoptedOpsEntry({
    statement: freshStatement,
    driverId,
    vehicleId: String(input.vehicleId || freshStatement.vehicleId || "").trim(),
    odometer: input.odometer,
    reason: String(input.reason).trim(),
    adoptedBy: input.adoptedBy,
    organizationId: orgId,
    stationMode: isConfirm ? input.stationMode : null,
    matchedStationId: matchedStationId || null,
    stationName: stationName || null,
    stationAddress: stationAddress || null,
  });

  await kv.set(`fuel_entry:${adopted.id}`, adopted);

  let linked: Awaited<ReturnType<typeof persistFuelMatchPair>> | null = null;
  try {
    linked = await persistFuelMatchPair({
      status: "matched",
      statementEntry: freshStatement,
      driverEntry: adopted,
    });
  } catch (e) {
    await kv.del(`fuel_entry:${adopted.id}`);
    throw e;
  }

  if (!linked?.ok) {
    await kv.del(`fuel_entry:${adopted.id}`);
    return { ok: false, status: 500, error: "Failed to link adopted fill to statement" };
  }

  return {
    ok: true,
    statementId: String(freshStatement.id),
    driverEntryId: String(adopted.id),
  };
}

export async function linkStatementToExistingLog(input: {
  statementId: string;
  driverEntryId: string;
  reason: string;
  linkedBy: string;
  organizationId: string;
}): Promise<{ ok: boolean; status?: number; error?: string }> {
  await assertAdoptFlag(input.organizationId);

  const reason = String(input.reason || "").trim();
  if (!reason) return { ok: false, status: 400, error: "Link reason is required" };

  const stmt = await loadFuelEntry(input.statementId);
  const drv = await loadFuelEntry(input.driverEntryId);
  if (!stmt || !drv) return { ok: false, status: 404, error: "Entry not found" };
  if (!isJaaStatementLedgerRow(stmt as any)) {
    return { ok: false, status: 400, error: "First id must be a statement ledger row" };
  }
  if (isJaaStatementLedgerRow(drv as any)) {
    return { ok: false, status: 400, error: "Cannot link two statement rows" };
  }
  if (metaOf(stmt).jaaMatchedDriverEntryId) {
    return { ok: false, status: 409, error: "Statement already linked" };
  }
  if (metaOf(drv).jaaMatchedStatementId) {
    return { ok: false, status: 409, error: "Log already linked to a statement" };
  }

  const orgId = String(input.organizationId || stmt.organizationId || "");
  if (await isOrgFuelWeekSealed(orgId, ymd(stmt.date))) {
    return { ok: false, status: 409, error: "Cannot link into a sealed/closed fuel week" };
  }

  const kind = String(metaOf(stmt).jaaRowKind || "");
  if (kind === "fee" || kind === "declined") {
    return { ok: false, status: 400, error: "Cannot link fee or declined statement rows" };
  }

  const stmtWithNote = {
    ...stmt,
    metadata: {
      ...metaOf(stmt),
      manualLinkReason: reason,
      manualLinkedBy: input.linkedBy,
      manualLinkedAt: new Date().toISOString(),
    },
  };

  const result = await persistFuelMatchPair({
    status: "matched",
    statementEntry: stmtWithNote,
    driverEntry: drv,
  });
  if (!result.ok) return { ok: false, status: 500, error: "Failed to persist link" };
  return { ok: true };
}

export async function dismissUnlinkedStatement(input: {
  statementId: string;
  reason: string;
  dismissedBy: string;
  organizationId: string;
}): Promise<{ ok: boolean; status?: number; error?: string }> {
  await assertAdoptFlag(input.organizationId);

  const reason = String(input.reason || "").trim();
  if (!reason) return { ok: false, status: 400, error: "Dismiss reason is required" };

  const stmt = await loadFuelEntry(input.statementId);
  if (!stmt) return { ok: false, status: 404, error: "Statement row not found" };
  if (!isJaaStatementLedgerRow(stmt as any)) {
    return { ok: false, status: 400, error: "Not a statement ledger row" };
  }
  if (metaOf(stmt).jaaMatchedDriverEntryId) {
    return { ok: false, status: 409, error: "Cannot dismiss a matched statement" };
  }

  const orgId = String(input.organizationId || stmt.organizationId || "");
  if (await isOrgFuelWeekSealed(orgId, ymd(stmt.date))) {
    return { ok: false, status: 409, error: "Cannot dismiss in a sealed/closed fuel week" };
  }

  const nowIso = new Date().toISOString();
  const next = {
    ...stmt,
    metadata: {
      ...metaOf(stmt),
      adoptionDismissedAt: nowIso,
      adoptionDismissedReason: reason,
      adoptionDismissedBy: input.dismissedBy,
      countsInFuelSpend: false,
    },
  };
  await kv.set(`fuel_entry:${stmt.id}`, next);
  return { ok: true };
}

/** Phase 7: persist a driver nudge request on the statement + optional notification KV. */
export async function requestDriverLogForStatement(input: {
  statementId: string;
  requestedBy: string;
  organizationId: string;
  message?: string;
}): Promise<{ ok: boolean; status?: number; error?: string }> {
  await assertAdoptFlag(input.organizationId);

  const stmt = await loadFuelEntry(input.statementId);
  if (!stmt) return { ok: false, status: 404, error: "Statement row not found" };
  if (!isUnlinkedCardCharge(stmt as any)) {
    return { ok: false, status: 400, error: "Only unlinked approved charges can request a driver log" };
  }

  const driverId = String(stmt.driverId || "").trim();
  if (!driverId) {
    return { ok: false, status: 400, error: "No driver on this charge to notify" };
  }

  const nowIso = new Date().toISOString();
  const nudgeId = crypto.randomUUID();
  const next = {
    ...stmt,
    metadata: {
      ...metaOf(stmt),
      driverLogRequestedAt: nowIso,
      driverLogRequestedBy: input.requestedBy,
      driverLogRequestId: nudgeId,
    },
  };
  await kv.set(`fuel_entry:${stmt.id}`, next);

  await kv.set(`fuel_driver_nudge:${nudgeId}`, {
    id: nudgeId,
    type: "unlinked_card_charge",
    statementId: stmt.id,
    driverId,
    organizationId: input.organizationId || stmt.organizationId,
    vehicleId: stmt.vehicleId,
    cardId: stmt.cardId,
    amount: stmt.amount,
    date: stmt.date,
    message:
      input.message ||
      "Please log your gas-card fill in the driver portal so this charge can be matched.",
    status: "pending",
    createdAt: nowIso,
    createdBy: input.requestedBy,
  });

  return { ok: true };
}
