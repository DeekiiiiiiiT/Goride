/**
 * Atomic Gas Card + Cash split fill — one logical pump stop, two ledger rows.
 * Idempotent on fillGroupId via fuel_split:{id} marker.
 */
import type { Context } from "npm:hono@4.3.11";
import * as kv from "./kv_store.tsx";
import { stampOrg, getOrgId } from "./org_scope.ts";
import {
  resolveFuelPaymentSource,
} from "./fuel_payment_source.ts";
import { stampPendingReconciliationStatus } from "./fuel_posted_guarantee.ts";
import { findConflictingGasCardAnchor } from "./gas_card_anchor_guard.ts";
import { findSoftDuplicateFuelEntry } from "./fuel_soft_dedup.ts";
import { stampFuelEntryRetailPrice } from "./fuel_retail_stamp.ts";
import {
  enrichRecordWithDriverVehicle,
} from "./driver_vehicle_assignment.ts";
import {
  applyStationMatch,
  extractEntryCoords,
  mirrorStationOntoCash,
  signMatchedFuelEntry,
} from "./fuel_station_match.ts";
import {
  projectOdometerReading,
  resolveFuelRecordedAt,
} from "./odometer_ledger.ts";
import { syncLinkedExpenseTransaction } from "./fuel_transaction_sync.ts";
import type { RbacUser } from "./rbac_middleware.ts";
import { hasPermission } from "./rbac_middleware.ts";
import { isOrgModuleEnabled } from "./enterprise_modules.ts";
import { queryFleet } from "./repos/baseRepo.ts";
import {
  AWAITING_CASH_STALE_DAYS,
  assertSplitCashInvariant,
  isStaleAwaitingCash,
  resolveSplitCashAcceptDerived,
  resolveSplitCashManual,
  resolveSplitCashVoid,
  stampSplitVarianceSiblingAudit,
} from "../../../packages/fuel-core/src/fuelSplitCashLifecycle.ts";

export type SplitFillBody = {
  fillGroupId: string;
  cashTransaction: Record<string, unknown>;
  cardFuelEntry: Record<string, unknown>;
};

export type SplitFillResult = {
  fillGroupId: string;
  cashTransactionId: string;
  cardFuelEntryId: string;
  cashTransaction: Record<string, unknown>;
  cardFuelEntry: Record<string, unknown>;
  idempotent?: boolean;
};

function markerKey(fillGroupId: string): string {
  return `fuel_split:${fillGroupId}`;
}

function driverNameOf(record: Record<string, unknown>): string {
  return String(record.driverName || "").trim();
}

async function lookupDriverName(driverId: string): Promise<string | undefined> {
  const id = driverId.trim();
  if (!id) return undefined;
  const driver = await kv.get(`driver:${id}`);
  if (!driver || typeof driver !== "object") return undefined;
  const d = driver as Record<string, unknown>;
  const name = d.driverName || d.name || d.fullName || d.displayName;
  const text = name != null ? String(name).trim() : "";
  return text || undefined;
}

/** Stamp the driver's name on both halves when the client omitted it. */
export async function stampSplitDriverNames(
  cashTx: Record<string, unknown>,
  cardEntry: Record<string, unknown>,
  lookup: (driverId: string) => Promise<string | undefined> = lookupDriverName,
): Promise<void> {
  const driverId = String(cardEntry.driverId || cashTx.driverId || "").trim();
  let name = driverNameOf(cardEntry) || driverNameOf(cashTx);
  if (!name && driverId) name = (await lookup(driverId)) || "";
  if (!name) return;
  if (!driverNameOf(cashTx)) cashTx.driverName = name;
  if (!driverNameOf(cardEntry)) cardEntry.driverName = name;
}

function ensureFillGroupMeta(
  meta: Record<string, unknown> | undefined,
  fillGroupId: string,
  role: "cash" | "card",
  extras: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...(meta || {}),
    fillGroupId,
    splitRole: role,
    ...extras,
  };
}

export async function persistSplitFill(
  c: Context,
  body: SplitFillBody,
): Promise<{ ok: true; data: SplitFillResult } | { ok: false; status: number; error: string; code?: string }> {
  const fillGroupId = String(body.fillGroupId || "").trim();
  if (!fillGroupId) {
    return { ok: false, status: 400, error: "fillGroupId is required", code: "MISSING_FILL_GROUP" };
  }
  if (!body.cashTransaction || typeof body.cashTransaction !== "object") {
    return { ok: false, status: 400, error: "cashTransaction is required", code: "MISSING_CASH" };
  }
  if (!body.cardFuelEntry || typeof body.cardFuelEntry !== "object") {
    return { ok: false, status: 400, error: "cardFuelEntry is required", code: "MISSING_CARD" };
  }

  const existingMarker = await kv.get(markerKey(fillGroupId));
  if (existingMarker && typeof existingMarker === "object") {
    const m = existingMarker as SplitFillResult;
    const cashTx = m.cashTransactionId
      ? await kv.get(`transaction:${m.cashTransactionId}`)
      : null;
    const cardEntry = m.cardFuelEntryId
      ? await kv.get(`fuel_entry:${m.cardFuelEntryId}`)
      : null;
    if (cashTx && cardEntry) {
      return {
        ok: true,
        data: {
          fillGroupId,
          cashTransactionId: String(m.cashTransactionId),
          cardFuelEntryId: String(m.cardFuelEntryId),
          cashTransaction: cashTx as Record<string, unknown>,
          cardFuelEntry: cardEntry as Record<string, unknown>,
          idempotent: true,
        },
      };
    }
  }

  const cashTx: Record<string, unknown> = { ...body.cashTransaction };
  const cardEntry: Record<string, unknown> = { ...body.cardFuelEntry };

  if (!cashTx.id) cashTx.id = crypto.randomUUID();
  if (!cardEntry.id) cardEntry.id = crypto.randomUUID();
  if (!cashTx.timestamp) cashTx.timestamp = new Date().toISOString();

  const pumpTotal =
    Number(
      (cashTx.metadata as Record<string, unknown> | undefined)?.splitPumpTotal ??
        (cardEntry.metadata as Record<string, unknown> | undefined)?.splitPumpTotal,
    ) || 0;

  if (!(pumpTotal > 0)) {
    return {
      ok: false,
      status: 400,
      error: "splitPumpTotal is required and must be greater than zero",
      code: "MISSING_PUMP_TOTAL",
    };
  }

  // Cash amount is $0 until Dominion statement derives cash = pump − card
  cashTx.amount = 0;

  // Shared pump liters BEFORE card liters are zeroed — M4 price band needs full pump volume
  const cashMeta = (cashTx.metadata as Record<string, unknown> | undefined) || {};
  const pumpLiters =
    Number(cashTx.quantity) ||
    Number(cashMeta.fuelVolume) ||
    Number(cardEntry.liters) ||
    0;
  const splitPumpLiters = pumpLiters > 0 ? pumpLiters : undefined;

  cashTx.metadata = ensureFillGroupMeta(
    cashTx.metadata as Record<string, unknown> | undefined,
    fillGroupId,
    "cash",
    {
      splitPumpTotal: pumpTotal,
      splitVolumeOwner: true,
      awaitingCashStatement: true,
      splitPumpLiters,
    },
  );

  cardEntry.metadata = ensureFillGroupMeta(
    cardEntry.metadata as Record<string, unknown> | undefined,
    fillGroupId,
    "card",
    {
      splitPumpTotal: pumpTotal,
      splitVolumeOwner: false,
      awaitingCardStatement: true,
      countsInFuelSpend: false,
      countsInFuelVolume: false,
      splitPumpLiters,
    },
  );

  // Card row never carries volume.
  cardEntry.liters = 0;
  cardEntry.amount = cardEntry.amount ?? 0;

  Object.assign(cashTx, stampOrg(cashTx, c));
  Object.assign(cardEntry, stampOrg(cardEntry, c));

  if (cardEntry.driverId || cardEntry.vehicleId) {
    const enriched = await enrichRecordWithDriverVehicle(
      cardEntry,
      cardEntry.organizationId as string | undefined,
    );
    Object.assign(cardEntry, enriched);
  }
  if (cashTx.driverId || cashTx.vehicleId) {
    const enrichedCash = await enrichRecordWithDriverVehicle(
      cashTx,
      (cashTx.organizationId as string | undefined) ||
        (cardEntry.organizationId as string | undefined),
    );
    Object.assign(cashTx, enrichedCash);
  }
  await stampSplitDriverNames(cashTx, cardEntry);

  // Station match before retail stamp and soft-dedup (dedup compares vendor/location).
  // Signature waits until both rows are stored so the hash covers the finished card half.
  await applyStationMatch(cardEntry, { deferSignature: true });
  mirrorStationOntoCash(cardEntry, cashTx);

  {
    const rawPay =
      cardEntry.paymentSource ??
      (cardEntry.metadata as Record<string, unknown> | undefined)?.paymentSource;
    const paySrc = resolveFuelPaymentSource(typeof rawPay === "string" && rawPay ? rawPay : "Gas_Card");
    cardEntry.paymentSource = paySrc.enum;
    cardEntry.metadata = {
      ...(cardEntry.metadata as Record<string, unknown>),
      paymentSource: paySrc.meta,
    };
  }

  await stampFuelEntryRetailPrice(cardEntry);
  stampPendingReconciliationStatus(cardEntry);

  const gasConflict = await findConflictingGasCardAnchor(cardEntry);
  if (gasConflict) {
    return {
      ok: false,
      status: 409,
      error: "Conflicting gas card anchor already exists for this fill",
      code: "GAS_CARD_ANCHOR_CONFLICT",
    };
  }

  const softDup = await findSoftDuplicateFuelEntry(cardEntry);
  if (softDup && String(softDup.paymentSource || "") === "Gas_Card") {
    // Same payment family soft-dup — reject; different payment (cash sibling) is allowed by soft-dedup.
    return {
      ok: false,
      status: 409,
      error: "Duplicate gas card fill detected",
      code: "SOFT_DUP_CARD",
    };
  }

  // Write cash first, then card; compensate cash on card failure.
  await kv.set(`transaction:${cashTx.id}`, cashTx);

  try {
    await kv.set(`fuel_entry:${cardEntry.id}`, cardEntry);
    try {
      await signMatchedFuelEntry(cardEntry);
      await kv.set(`fuel_entry:${cardEntry.id}`, cardEntry);
    } catch (signErr) {
      console.error("[SplitFill] Card signature failed (non-fatal):", signErr);
    }
    // One odometer projection per fillGroupId (cash owns volume; card never projects).
    try {
      const odo = Number(cardEntry.odometer);
      const vehicleId = String(cardEntry.vehicleId || "").trim();
      if (Number.isFinite(odo) && odo > 0 && vehicleId && vehicleId !== "unknown") {
        await projectOdometerReading({
          organizationId: (cardEntry.organizationId as string) || getOrgId(c),
          vehicleId,
          reading: odo,
          source: "fuel",
          referenceId: fillGroupId,
          referenceType: "fuel_entry",
          recordedAt: await resolveFuelRecordedAt(cardEntry),
          readingDate: String(cardEntry.date || "").slice(0, 10) || undefined,
          driverId: (cardEntry.driverId as string) || null,
          isHard: true,
          isVerified: true,
          notes: cardEntry.location
            ? `Split fuel at ${cardEntry.location}`
            : "Split Fuel Fill",
          imageUrl:
            (cardEntry.odometerImageUrl as string) ||
            (cardEntry.odometerProofUrl as string) ||
            null,
          payloadExtra: {
            fillGroupId,
            metaData: cardEntry.metadata || {},
            time: cardEntry.time || null,
          },
        });
      }
    } catch (odoErr) {
      console.error("[SplitFill] Odometer projection failed (non-fatal):", odoErr);
    }
    try {
      await syncLinkedExpenseTransaction(cardEntry);
    } catch (syncErr) {
      console.error("[SplitFill] Card tx sync failed (non-fatal):", syncErr);
    }
  } catch (cardErr) {
    console.error("[SplitFill] Card write failed — rolling back cash tx:", cardErr);
    try {
      await kv.del(`transaction:${cashTx.id}`);
    } catch (rollbackErr) {
      console.error("[SplitFill] Cash rollback failed:", rollbackErr);
    }
    return {
      ok: false,
      status: 500,
      error: cardErr instanceof Error ? cardErr.message : "Failed to persist card anchor",
      code: "CARD_WRITE_FAILED",
    };
  }

  const result: SplitFillResult = {
    fillGroupId,
    cashTransactionId: String(cashTx.id),
    cardFuelEntryId: String(cardEntry.id),
    cashTransaction: cashTx,
    cardFuelEntry: cardEntry,
  };
  await kv.set(markerKey(fillGroupId), {
    fillGroupId,
    cashTransactionId: result.cashTransactionId,
    cardFuelEntryId: result.cardFuelEntryId,
    createdAt: new Date().toISOString(),
  });

  return { ok: true, data: result };
}

export function assertSplitFillAllowed(c: Context): { allowed: true } | { allowed: false; status: 401 | 403; body: Record<string, unknown> } {
  const rbacUser = c.get("rbacUser") as RbacUser | undefined;
  if (!rbacUser) {
    return { allowed: false, status: 401, body: { error: "Unauthorized: No user context" } };
  }
  const canFleetCreate = hasPermission(rbacUser.resolvedRole, "fuel.create_entry");
  const isDriverSubmitter = rbacUser.resolvedRole === "driver";
  if (!canFleetCreate && !isDriverSubmitter) {
    return {
      allowed: false,
      status: 403,
      body: {
        error: "Forbidden",
        message: 'You do not have the "fuel.create_entry" permission.',
        required: "fuel.create_entry",
        currentRole: rbacUser.resolvedRole,
      },
    };
  }
  return { allowed: true };
}

/**
 * Resolve org for the split-fill module gate.
 * Prefer request org scope, then rbac.organizationId; fleet_owner / admin fall back to userId.
 */
export function resolveSplitFillOrgId(c: Context, rbacUser: RbacUser): string | null {
  let orgId = getOrgId(c) || rbacUser.organizationId || null;
  if (!orgId && (rbacUser.resolvedRole === "fleet_owner" || rbacUser.rawRole === "admin")) {
    orgId = rbacUser.userId;
  }
  return orgId;
}

export type SplitFillModuleChecker = (
  orgId: string,
  moduleKey: "fuelSplitPayment",
) => Promise<boolean>;

/** RBAC + fuelSplitPayment module gate (org can still disable). */
export async function assertSplitFillAllowedAsync(
  c: Context,
  checkModule: SplitFillModuleChecker = isOrgModuleEnabled,
): Promise<{ allowed: true } | { allowed: false; status: 401 | 403; body: Record<string, unknown> }> {
  const rbac = assertSplitFillAllowed(c);
  if (!rbac.allowed) return rbac;

  const rbacUser = c.get("rbacUser") as RbacUser;
  const orgId = resolveSplitFillOrgId(c, rbacUser);
  if (!orgId) {
    return {
      allowed: false,
      status: 403,
      body: {
        error: "Forbidden",
        code: "MODULE_DISABLED",
        message: "Gas Card + Cash split fills require an organization with the module enabled.",
        module: "fuelSplitPayment",
      },
    };
  }

  const enabled = await checkModule(orgId, "fuelSplitPayment");
  if (!enabled) {
    return {
      allowed: false,
      status: 403,
      body: {
        error: "Forbidden",
        code: "MODULE_DISABLED",
        message: "Gas Card + Cash split fills are not enabled for this organization.",
        module: "fuelSplitPayment",
      },
    };
  }
  return { allowed: true };
}

function metaRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function flagOn(value: unknown): boolean {
  return value === true || value === "true";
}

async function loadSplitCashTx(fillGroupId: string): Promise<Record<string, unknown> | null> {
  const marker = (await kv.get(markerKey(fillGroupId))) as Record<string, unknown> | null;
  const cashId = marker && typeof marker.cashTransactionId === "string" ? marker.cashTransactionId : "";
  if (!cashId) return null;
  const tx = await kv.get(`transaction:${cashId}`);
  return tx && typeof tx === "object" ? (tx as Record<string, unknown>) : null;
}

export type SplitCashResolveBody = {
  action?: string;
  cashAmount?: number;
  reason?: string;
};

/** Owner escalate, or staff deciding a statement mismatch. Refuses fresh awaiting rows. */
export async function resolveSplitFillCash(
  c: Context,
  fillGroupId: string,
  body: SplitCashResolveBody,
): Promise<
  | { ok: true; data: { cashTransaction: Record<string, unknown>; fuelEntries: Record<string, unknown>[] } }
  | { ok: false; status: number; error: string; code?: string }
> {
  const rbacUser = c.get("rbacUser") as RbacUser | undefined;
  if (!rbacUser) return { ok: false, status: 401, error: "Unauthorized" };

  const gid = String(fillGroupId || "").trim();
  if (!gid) return { ok: false, status: 400, error: "fillGroupId is required", code: "MISSING_FILL_GROUP" };

  const tx = await loadSplitCashTx(gid);
  if (!tx) return { ok: false, status: 404, error: "Split cash reimbursement was not found", code: "SPLIT_CASH_NOT_FOUND" };

  const meta = metaRecord(tx.metadata);
  const awaiting = flagOn(meta.awaitingCashStatement);
  const hasStatement = meta.splitStatementAmount != null && Number(meta.splitStatementAmount) > 0;
  const variance = flagOn(meta.splitVariance) && !flagOn(meta.splitReconciled);
  const stale = isStaleAwaitingCash({
    date: String(tx.date || ""),
    status: tx.status as string | undefined,
    amount: Number(tx.amount),
    metadata: meta,
  });

  const canOverride = hasPermission(rbacUser.resolvedRole, "fuel.split_cash_override");
  const canApprove = hasPermission(rbacUser.resolvedRole, "fuel.approve");
  const statementDecision = variance || hasStatement;

  if (awaiting && !hasStatement && !variance && !stale) {
    if (!canOverride && !canApprove) {
      return { ok: false, status: 403, error: "Forbidden", code: "FORBIDDEN" };
    }
    return {
      ok: false,
      status: 409,
      error: `Cash waits for the gas card statement until this fill is ${AWAITING_CASH_STALE_DAYS} days old.`,
      code: "SPLIT_CASH_AWAITING_STATEMENT",
    };
  }

  if (!canOverride && !(canApprove && statementDecision)) {
    return {
      ok: false,
      status: 403,
      error: "Only a fleet owner can set cash before the statement matches.",
      code: "FORBIDDEN",
    };
  }

  const action = String(body.action || "");
  const actor = {
    actorId: rbacUser.userId,
    reason: body.reason,
    at: new Date().toISOString(),
  };
  let patch;
  try {
    if (action === "accept_derived") {
      patch = resolveSplitCashAcceptDerived(meta, Number(body.cashAmount ?? meta.splitDerivedCashAmount) || 0, actor);
    } else if (action === "enter_cash") {
      patch = resolveSplitCashManual(meta, Number(body.cashAmount) || 0, actor);
    } else if (action === "void") {
      patch = resolveSplitCashVoid(meta, actor);
    } else {
      return { ok: false, status: 400, error: "Unknown resolve action", code: "BAD_ACTION" };
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Resolve failed";
    const status = message === "split_cash_reason_required" ? 400 : 500;
    return { ok: false, status, error: message, code: message };
  }

  const nextTx: Record<string, unknown> = {
    ...tx,
    amount: patch.amount,
    status: patch.status || tx.status,
    metadata: assertSplitCashInvariant(patch.metadata),
  };
  await kv.set(`transaction:${tx.id}`, nextTx);

  const entriesRes = await queryFleet("fuel_entries", {
    filters: [{ op: "eq", col: "value->metadata->>fillGroupId", value: gid }],
    limit: 10,
  });
  const fuelEntries: Record<string, unknown>[] = [];
  if (!entriesRes.error && Array.isArray(entriesRes.data)) {
    for (const raw of entriesRes.data as Record<string, unknown>[]) {
      const em = metaRecord(raw.metadata);
      const isCash = em.splitRole === "cash" || em.splitVolumeOwner === true;
      const updated = isCash
        ? {
            ...raw,
            amount: Math.abs(Number(patch.amount) || 0),
            metadata: assertSplitCashInvariant({ ...em, ...patch.metadata }),
          }
        : {
            ...raw,
            metadata: stampSplitVarianceSiblingAudit(
              em,
              action as "accept_derived" | "enter_cash" | "void",
              actor,
            ),
          };
      if (raw.id) await kv.set(`fuel_entry:${raw.id}`, updated);
      fuelEntries.push(updated);
    }
  }

  return { ok: true, data: { cashTransaction: nextTx, fuelEntries } };
}

export type SplitBackfillRow = {
  fillGroupId: string;
  cardFuelEntryId: string;
  cashTransactionId: string | null;
  driverName: string | null;
  vendor: string | null;
  matchedStationId: string | null;
  locationStatus: string | null;
  applied: boolean;
};

/**
 * Preview or apply station match + missing driver names on split card rows.
 * Dry-run does not write stations, learnt locations, or ledger rows.
 */
export async function backfillUnmatchedSplitFills(opts: {
  dryRun: boolean;
  orgId?: string | null;
  limit?: number;
}): Promise<{ dryRun: boolean; rows: SplitBackfillRow[] }> {
  const res = await queryFleet("fuel_entries", {
    org: opts.orgId || undefined,
    filters: [{ op: "eq", col: "value->metadata->>splitRole", value: "card" }],
    limit: Math.min(opts.limit ?? 200, 500),
    order: { col: "date", ascending: false },
  });
  if (res.error) throw res.error;

  const rows: SplitBackfillRow[] = [];
  for (const raw of (res.data || []) as Record<string, unknown>[]) {
    const meta = metaRecord(raw.metadata);
    const fillGroupId = String(meta.fillGroupId || "");
    if (!fillGroupId) continue;
    const matched = String(raw.matchedStationId || meta.matchedStationId || "");
    const hasGps = extractEntryCoords(raw) != null;
    const missingName = !String(raw.driverName || "").trim();
    if (matched && !missingName) continue;
    if (!matched && !hasGps && !missingName) continue;

    const card: Record<string, unknown> = { ...raw, metadata: { ...meta } };
    const cash = await loadSplitCashTx(fillGroupId);
    const cashCopy: Record<string, unknown> | null = cash
      ? { ...cash, metadata: { ...metaRecord(cash.metadata) } }
      : null;

    if (!opts.dryRun) {
      if (!matched && hasGps) {
        await applyStationMatch(card, { deferSignature: true });
        await signMatchedFuelEntry(card);
        if (cashCopy) mirrorStationOntoCash(card, cashCopy);
      }
      await stampSplitDriverNames(cashCopy || {}, card);
      if (card.id) await kv.set(`fuel_entry:${card.id}`, card);
      if (cashCopy?.id) await kv.set(`transaction:${cashCopy.id}`, cashCopy);
    } else if (!matched && hasGps) {
      const memory = new Map<string, unknown>();
      const clone = (value: unknown) =>
        value && typeof value === "object" ? JSON.parse(JSON.stringify(value)) : value;
      await applyStationMatch(card, {
        deferSignature: true,
        deps: {
          get: async (key) => (key.startsWith("station:") ? clone(await kv.get(key)) : memory.get(key)),
          getByPrefix: async (prefix) => {
            if (prefix !== "station:") return [];
            const rows = (await kv.getByPrefix(prefix)) || [];
            return rows.map((row: unknown) => clone(row));
          },
          set: async (key, value) => {
            memory.set(key, value);
          },
        },
      });
      if (cashCopy) mirrorStationOntoCash(card, cashCopy);
      await stampSplitDriverNames(cashCopy || {}, card);
    } else {
      await stampSplitDriverNames(cashCopy || {}, card);
    }

    const nextMeta = metaRecord(card.metadata);
    rows.push({
      fillGroupId,
      cardFuelEntryId: String(card.id || ""),
      cashTransactionId: cashCopy?.id ? String(cashCopy.id) : null,
      driverName: card.driverName ? String(card.driverName) : null,
      vendor: card.vendor ? String(card.vendor) : null,
      matchedStationId: card.matchedStationId ? String(card.matchedStationId) : null,
      locationStatus: nextMeta.locationStatus ? String(nextMeta.locationStatus) : null,
      applied: !opts.dryRun,
    });
  }
  return { dryRun: opts.dryRun, rows };
}
