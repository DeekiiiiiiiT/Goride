import { isLedgerDualWriteEnabled } from "./flags.ts";
import { ledgerPostEntry, majorToMinor } from "./postEntry.ts";

export type CanonicalEventDualWrite = {
  id: string;
  idempotencyKey: string;
  eventType: string;
  direction: "inflow" | "outflow" | "neutral";
  netAmount: number;
  currency: string;
  driverId: string;
  sourceType: string;
  sourceId: string;
  organizationId?: string | null;
  date?: string;
  metadata?: Record<string, unknown>;
};

function driverDigitalKey(driverId: string): string {
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRe.test(driverId)) return `user:${driverId}:driver:digital`;
  return `user:${driverId}:driver`;
}

/** Phase 8: mirror KV canonical ledger_event into ledger.entries. */
export async function dualWriteCanonicalEvent(event: CanonicalEventDualWrite): Promise<void> {
  if (!isLedgerDualWriteEnabled()) return;
  if (event.direction === "neutral") return;

  const amountMinor = majorToMinor(Math.abs(event.netAmount));
  if (amountMinor <= 0) return;

  const driverKey = driverDigitalKey(event.driverId);
  const isInflow = event.direction === "inflow";

  await ledgerPostEntry({
    idempotencyKey: `kv_ledger_event:${event.idempotencyKey}`,
    entryType: event.eventType,
    debitAccountKey: isInflow ? "platform:clearing" : driverKey,
    creditAccountKey: isInflow ? driverKey : "platform:clearing",
    amountMinor,
    currency: event.currency || "JMD",
    product: "fleet",
    organizationId: event.organizationId ?? null,
    effectiveAt: event.date ? `${event.date}T12:00:00.000Z` : undefined,
    referenceType: event.sourceType,
    referenceId: event.sourceId,
    metadata: event.metadata ?? {},
    sourceSystem: "kv_ledger_event",
    sourceId: event.id,
    sourceIdempotencyKey: event.idempotencyKey,
  });
}
