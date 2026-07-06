import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isLedgerDualWriteEnabled } from "./flags.ts";
import { ledgerPostEntry } from "./postEntry.ts";

export type RidesJournalLineDualWrite = {
  rideId: string | null;
  rowIdempotencyKey: string;
  entryType: string;
  debitAccountKey: string;
  creditAccountKey: string;
  amountMinor: number;
  currency: string;
  requestHash: string;
  metadata?: Record<string, unknown>;
  createdByUserId?: string | null;
  journalEntryId?: string | null;
};

/** Determine product based on account keys - rider-centric = roam_rides, driver-centric = roam_driver */
function resolveRidesProduct(debitKey: string, creditKey: string): "roam_rides" | "roam_driver" {
  const isRiderInvolved = debitKey.includes(":rider") || creditKey.includes(":rider");
  const isDriverInvolved = debitKey.includes(":driver") || creditKey.includes(":driver");
  
  // If rider is involved, it's a passenger-side transaction
  if (isRiderInvolved) return "roam_rides";
  // If only driver (no rider), it's driver earnings
  if (isDriverInvolved) return "roam_driver";
  // Default to roam_rides for platform-only transactions
  return "roam_rides";
}

/** Phase 7: mirror rides.payment_journal_entries line into ledger.entries. */
export async function dualWriteRidesJournalLine(
  client: SupabaseClient,
  tables: { journal: string },
  line: RidesJournalLineDualWrite,
): Promise<void> {
  if (!isLedgerDualWriteEnabled()) return;

  let sourceId = line.journalEntryId;
  if (!sourceId) {
    let q = client
      .from(tables.journal)
      .select("id")
      .eq("idempotency_key", line.rowIdempotencyKey);
    q = line.rideId
      ? q.eq("ride_request_id", line.rideId)
      : q.is("ride_request_id", null);
    const { data } = await q.maybeSingle();
    sourceId = data?.id ? String(data.id) : line.rowIdempotencyKey;
  }

  const product = resolveRidesProduct(line.debitAccountKey, line.creditAccountKey);

  await ledgerPostEntry({
    idempotencyKey: `rides_payment_journal:${sourceId}`,
    entryType: line.entryType,
    debitAccountKey: line.debitAccountKey,
    creditAccountKey: line.creditAccountKey,
    amountMinor: line.amountMinor,
    currency: line.currency,
    requestHash: line.requestHash,
    product,
    referenceType: line.rideId ? "ride" : null,
    referenceId: line.rideId,
    metadata: line.metadata ?? {},
    createdByUserId: line.createdByUserId ?? null,
    sourceSystem: "rides_payment_journal",
    sourceId: String(sourceId),
    sourceIdempotencyKey: line.rowIdempotencyKey,
  });
}

export type LedgerLineDualWrite = {
  lineId: string;
  rideId: string;
  lineKind: string;
  paidToYouMinor: number;
  driverUserId?: string | null;
  currency?: string;
};

/** 
 * @deprecated Removed to fix double-counting. 
 * Cash settlement journal entries already record these amounts.
 * Kept for reference but not called from production code.
 */
export async function dualWriteRideLedgerLine(line: LedgerLineDualWrite): Promise<void> {
  if (!isLedgerDualWriteEnabled()) return;
  const amount = Math.abs(line.paidToYouMinor);
  if (amount <= 0) return;

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const driverKey = line.driverUserId && uuidRe.test(line.driverUserId)
    ? `user:${line.driverUserId}:driver:digital`
    : "platform:receivable";
  const isCredit = line.paidToYouMinor > 0;

  await ledgerPostEntry({
    idempotencyKey: `rides_ledger_lines:${line.lineId}`,
    entryType: line.lineKind,
    debitAccountKey: isCredit ? "platform:clearing" : driverKey,
    creditAccountKey: isCredit ? driverKey : "platform:clearing",
    amountMinor: amount,
    currency: line.currency ?? "JMD",
    product: "roam_driver",  // Driver earnings
    referenceType: "ride",
    referenceId: line.rideId,
    metadata: { line_kind: line.lineKind, reporting_only: true },
    sourceSystem: "rides_ledger_lines",
    sourceId: line.lineId,
  });
}
