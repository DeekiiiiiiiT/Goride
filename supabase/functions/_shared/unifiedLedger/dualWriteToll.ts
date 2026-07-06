import { isLedgerDualWriteEnabled } from "./flags.ts";
import { ledgerPostEntry, majorToMinor } from "./postEntry.ts";

export type TollLedgerDualWrite = {
  id: string;
  type: string;
  amount: number;
  currency?: string;
  driverId?: string | null;
  organizationId?: string | null;
  vehicleId?: string | null;
  date?: string;
};

function orgFleetKey(organizationId: string): string {
  return `org:${organizationId}:fleet`;
}

/** Phase 9: mirror toll_ledger KV row into ledger.entries. */
export async function dualWriteTollLedger(entry: TollLedgerDualWrite): Promise<void> {
  if (!isLedgerDualWriteEnabled()) return;

  const amountMinor = majorToMinor(Math.abs(entry.amount));
  if (amountMinor <= 0) return;

  const orgId = entry.organizationId ?? null;
  const fleetKey = orgId ? orgFleetKey(orgId) : "platform:clearing";
  const driverKey = entry.driverId
    ? `user:${entry.driverId}:driver:digital`
    : fleetKey;

  const isUsage = entry.type === "usage" || entry.amount < 0;
  const debitKey = isUsage ? fleetKey : "platform:clearing";
  const creditKey = isUsage ? "platform:clearing" : fleetKey;

  await ledgerPostEntry({
    idempotencyKey: `kv_toll_ledger:${entry.id}`,
    entryType: `toll_${entry.type}`,
    debitAccountKey: debitKey,
    creditAccountKey: creditKey,
    amountMinor,
    currency: entry.currency ?? "JMD",
    product: "fleet",
    organizationId: orgId,
    effectiveAt: entry.date ? `${entry.date}T12:00:00.000Z` : undefined,
    referenceType: "toll",
    referenceId: entry.id,
    metadata: {
      driver_id: entry.driverId,
      vehicle_id: entry.vehicleId,
      toll_type: entry.type,
    },
    sourceSystem: "kv_toll_ledger",
    sourceId: entry.id,
  });
}
