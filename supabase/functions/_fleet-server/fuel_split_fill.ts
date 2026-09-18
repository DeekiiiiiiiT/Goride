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
import { projectFromFuelEntry } from "./odometer_ledger.ts";
import { syncLinkedExpenseTransaction } from "./fuel_transaction_sync.ts";
import type { RbacUser } from "./rbac_middleware.ts";
import { hasPermission } from "./rbac_middleware.ts";

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
    ) || Math.abs(Number(cashTx.amount) || 0);

  const expectedCard =
    Number(
      (cardEntry.metadata as Record<string, unknown> | undefined)?.splitExpectedCardAmount,
    ) || 0;

  cashTx.metadata = ensureFillGroupMeta(
    cashTx.metadata as Record<string, unknown> | undefined,
    fillGroupId,
    "cash",
    {
      splitPumpTotal: pumpTotal,
      splitVolumeOwner: true,
    },
  );

  cardEntry.metadata = ensureFillGroupMeta(
    cardEntry.metadata as Record<string, unknown> | undefined,
    fillGroupId,
    "card",
    {
      splitPumpTotal: pumpTotal,
      splitExpectedCardAmount: expectedCard,
      splitVolumeOwner: false,
      awaitingCardStatement: true,
      countsInFuelSpend: false,
      countsInFuelVolume: false,
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

  {
    const paySrc = resolveFuelPaymentSource(
      cardEntry.paymentSource ||
        (cardEntry.metadata as Record<string, unknown>)?.paymentSource ||
        "Gas_Card",
    );
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
      await projectFromFuelEntry(cardEntry, (cardEntry.organizationId as string) || getOrgId(c));
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
