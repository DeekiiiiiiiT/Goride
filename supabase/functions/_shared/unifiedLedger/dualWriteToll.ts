import { isLedgerDualWriteIslandEnabled } from "./flags.ts";
import { ledgerPostEntry, majorToMinor } from "./postEntry.ts";
import { logDualWriteMetric } from "./metrics.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Shared Toll KV → unified dual-write (Fleet saveTollLedgerEntry + Toll Brain materialize). */
export async function dualWriteTollLedgerKv(entry: {
  id: string;
  type: string;
  amount: number;
  currency?: string;
  driverId?: string | null;
  organizationId?: string | null;
  vehicleId?: string | null;
  date?: string;
}): Promise<void> {
  if (!isLedgerDualWriteIslandEnabled("kv_toll_ledger")) {
    logDualWriteMetric({
      source_system: "kv_toll_ledger",
      status: "skipped",
      reason: "flag_off",
      source_id: entry.id,
    });
    return;
  }

  const amountMinor = majorToMinor(entry.amount);
  if (amountMinor <= 0) {
    logDualWriteMetric({
      source_system: "kv_toll_ledger",
      status: "skipped",
      reason: "zero_amount",
      source_id: entry.id,
      amount_minor: amountMinor,
    });
    return;
  }

  // Prefer org fleet account; fall back to driver digital — never platform:clearing for both legs.
  let counterparty = "";
  let product: "roam_fleet" | "roam_driver" = "roam_fleet";
  if (entry.organizationId && UUID_RE.test(entry.organizationId)) {
    counterparty = `org:${entry.organizationId}:fleet`;
    product = "roam_fleet";
  } else if (entry.driverId && UUID_RE.test(entry.driverId)) {
    counterparty = `user:${entry.driverId}:driver:digital`;
    product = "roam_driver";
  } else {
    logDualWriteMetric({
      source_system: "kv_toll_ledger",
      status: "skipped",
      reason: "missing_counterparty",
      source_id: entry.id,
      amount_minor: amountMinor,
    });
    return;
  }

  const isUsage = entry.type === "usage" || entry.amount < 0;
  const debitKey = isUsage ? counterparty : "platform:clearing";
  const creditKey = isUsage ? "platform:clearing" : counterparty;
  if (debitKey === creditKey) {
    logDualWriteMetric({
      source_system: "kv_toll_ledger",
      status: "skipped",
      reason: "self_ref_accounts",
      source_id: entry.id,
      amount_minor: amountMinor,
    });
    return;
  }

  try {
    const result = await ledgerPostEntry({
      idempotencyKey: `kv_toll_ledger:${entry.id}`,
      entryType: `toll_${entry.type}`,
      debitAccountKey: debitKey,
      creditAccountKey: creditKey,
      amountMinor,
      currency: entry.currency ?? "JMD",
      product,
      organizationId: entry.organizationId ?? null,
      effectiveAt: entry.date ? `${entry.date}T12:00:00.000Z` : new Date().toISOString(),
      referenceType: "toll",
      referenceId: entry.id,
      metadata: {
        driver_id: entry.driverId,
        vehicle_id: entry.vehicleId,
        toll_type: entry.type,
      },
      sourceSystem: "kv_toll_ledger",
      sourceId: entry.id,
      sourceIdempotencyKey: entry.id,
    });

    logDualWriteMetric({
      source_system: "kv_toll_ledger",
      status: result.inserted || result.skipped || result.conflict ? "ok" : "fail",
      reason: result.conflict ? "conflict" : result.skipped ? "idempotent_skip" : result.inserted ? "inserted" : "unknown",
      source_id: entry.id,
      entry_type: `toll_${entry.type}`,
      amount_minor: amountMinor,
    });

    // Root-cause guard: silent RPC soft-fail left island rows without receipts (soak delta −12).
    if (!(result.inserted || result.skipped || result.conflict)) {
      const retry = await ledgerPostEntry({
        idempotencyKey: `kv_toll_ledger:${entry.id}`,
        entryType: `toll_${entry.type}`,
        debitAccountKey: debitKey,
        creditAccountKey: creditKey,
        amountMinor,
        currency: entry.currency ?? "JMD",
        product,
        organizationId: entry.organizationId ?? null,
        effectiveAt: entry.date ? `${entry.date}T12:00:00.000Z` : new Date().toISOString(),
        referenceType: "toll",
        referenceId: entry.id,
        metadata: {
          driver_id: entry.driverId,
          vehicle_id: entry.vehicleId,
          toll_type: entry.type,
        },
        sourceSystem: "kv_toll_ledger",
        sourceId: entry.id,
        sourceIdempotencyKey: entry.id,
      });
      logDualWriteMetric({
        source_system: "kv_toll_ledger",
        status: retry.inserted || retry.skipped || retry.conflict ? "ok" : "fail",
        reason: retry.conflict
          ? "conflict_retry"
          : retry.skipped
          ? "idempotent_skip_retry"
          : retry.inserted
          ? "inserted_retry"
          : "unknown_retry",
        source_id: entry.id,
        entry_type: `toll_${entry.type}`,
        amount_minor: amountMinor,
      });
      if (!(retry.inserted || retry.skipped || retry.conflict)) {
        throw new Error(`kv_toll_ledger dual-write soft-fail for ${entry.id}`);
      }
    }
  } catch (e) {
    logDualWriteMetric({
      source_system: "kv_toll_ledger",
      status: "fail",
      reason: e instanceof Error ? e.message : String(e),
      source_id: entry.id,
      amount_minor: amountMinor,
    });
    throw e;
  }
}
