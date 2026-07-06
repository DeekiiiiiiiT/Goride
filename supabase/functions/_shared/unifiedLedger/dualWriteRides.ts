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

  await ledgerPostEntry({
    idempotencyKey: `rides_payment_journal:${sourceId}`,
    entryType: line.entryType,
    debitAccountKey: line.debitAccountKey,
    creditAccountKey: line.creditAccountKey,
    amountMinor: line.amountMinor,
    currency: line.currency,
    requestHash: line.requestHash,
    product: "rides",
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

/** Phase 7: record reporting line linkage (no double-entry — metadata-only mirror). */
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
    product: "rides",
    referenceType: "ride",
    referenceId: line.rideId,
    metadata: { line_kind: line.lineKind, reporting_only: true },
    sourceSystem: "rides_ledger_lines",
    sourceId: line.lineId,
  });
}
