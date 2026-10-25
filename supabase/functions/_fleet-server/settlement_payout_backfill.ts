/**
 * DS-6: payouts that exist on the week row but not in the movement log, before 6 Sep 2026.
 * Does not change settlement_paid.
 * June 15 already has the reversal. This records the payment that was reversed.
 */
import { getServiceClient } from "./service_client.ts";
import { buildMovementRow, SettlementCommandError } from "./settlement_commands.ts";
import { weeksStillOff } from "../../../packages/finance-core/src/payoutBackfillCheck.ts";

const PAYOUTS: Array<{ week: string; amount: number }> = [
  { week: "2026-01-19", amount: 2425.36 },
  { week: "2026-02-16", amount: 2802.96 },
  { week: "2026-03-09", amount: 2037.26 },
  { week: "2026-03-16", amount: 225.22 },
  { week: "2026-05-11", amount: 783.54 },
  { week: "2026-05-25", amount: 3648.06 },
  { week: "2026-06-01", amount: 1227.32 },
];

const JUNE15_PAYMENT = { week: "2026-06-15", amount: 2565.44 };

function sb() {
  return getServiceClient();
}

function payKey(driverId: string, week: string, amount: number): string {
  return `backfill-payout:${driverId}:${week}:${amount.toFixed(2)}`;
}

function plannedPays(driverId: string) {
  return [...PAYOUTS, JUNE15_PAYMENT].map((row) => ({
    week: row.week,
    amount: row.amount,
    idempotencyKey: payKey(driverId, row.week, row.amount),
  }));
}

export function payoutBackfillPreview() {
  const pays = [...PAYOUTS, JUNE15_PAYMENT];
  const payoutTotal = Math.round(pays.reduce((s, row) => s + row.amount, 0) * 100) / 100;
  return {
    payouts: PAYOUTS,
    june15Payment: JUNE15_PAYMENT,
    payoutTotal,
  };
}

/** True when every planned back-fill payment is already in the movement log. */
export async function payoutKeysPosted(organizationId: string, driverId: string): Promise<boolean> {
  const keys = plannedPays(driverId).map((row) => row.idempotencyKey);
  if (!driverId || keys.length === 0) return false;
  const { data, error } = await sb()
    .from("settlement_movements")
    .select("idempotency_key")
    .eq("organization_id", organizationId)
    .eq("driver_id", driverId)
    .in("idempotency_key", keys);
  if (error) throw new Error(error.message);
  const found = new Set((data || []).map((row) => String(row.idempotency_key || "")));
  return keys.every((key) => found.has(key));
}

async function reconciliation(organizationId: string, driverId: string) {
  const { data: periods, error } = await sb()
    .from("driver_financial_periods")
    .select("period_anchor, settlement_paid")
    .eq("organization_id", organizationId)
    .eq("driver_id", driverId);
  if (error) throw new Error(error.message);
  const { data: movements, error: moveErr } = await sb()
    .from("settlement_movements")
    .select("period_anchor, kind, status, amount_minor, idempotency_key, metadata")
    .eq("organization_id", organizationId)
    .eq("driver_id", driverId);
  if (moveErr) throw new Error(moveErr.message);
  const stillOff = weeksStillOff({
    weeks: (periods || []).map((row) => ({
      week: String(row.period_anchor).slice(0, 10),
      settlementPaid: Number(row.settlement_paid) || 0,
    })),
    movements: (movements || []).map((row) => ({
      week: String(row.period_anchor).slice(0, 10),
      kind: String(row.kind || ""),
      status: String(row.status || ""),
      amount: Math.round(Number(row.amount_minor) || 0) / 100,
      reversedKind: (row.metadata as { reversedKind?: string } | null)?.reversedKind || null,
      idempotencyKey: row.idempotency_key ? String(row.idempotency_key) : null,
    })),
    extraPays: plannedPays(driverId),
  });
  return stillOff;
}

export async function applyPayoutBackfill(opts: {
  organizationId: string;
  driverId: string;
  actorId: string;
  confirm: boolean;
}) {
  const preview = payoutBackfillPreview();
  const stillOff = await reconciliation(opts.organizationId, opts.driverId);
  const ready = stillOff.length === 0;
  const alreadyPosted = await payoutKeysPosted(opts.organizationId, opts.driverId);
  if (!opts.confirm) return { ...preview, stillOff, ready, alreadyPosted, posted: false };
  if (!ready) {
    throw new SettlementCommandError(
      "PAYOUT_BACKFILL_GAP",
      "Payments would still not match what each week says was paid. Nothing was posted.",
      409,
      { stillOff },
    );
  }
  for (const row of plannedPays(opts.driverId)) {
    const { error } = await sb().from("settlement_movements").insert(
      buildMovementRow({
        organizationId: opts.organizationId,
        driverId: opts.driverId,
        periodAnchor: row.week,
        kind: "pay",
        amountMinor: Math.round(row.amount * 100),
        idempotencyKey: row.idempotencyKey,
        actorId: opts.actorId,
        reason: `Backfill payout for the week of ${row.week}`,
        metadata: { backfill: true },
      }),
    );
    if (error && !/duplicate|unique/i.test(error.message)) throw new Error(error.message);
  }
  return { ...preview, stillOff, ready: true, alreadyPosted: true, posted: true };
}
