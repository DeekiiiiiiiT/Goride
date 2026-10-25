/**
 * DS-6: payouts that exist on the week row but not in the movement log, before 6 Sep 2026.
 * Does not change settlement_paid.
 */
import { getServiceClient } from "./service_client.ts";
import { buildMovementRow } from "./settlement_commands.ts";

const PAYOUTS: Array<{ week: string; amount: number }> = [
  { week: "2026-01-19", amount: 2425.36 },
  { week: "2026-02-16", amount: 2802.96 },
  { week: "2026-03-09", amount: 2037.26 },
  { week: "2026-03-16", amount: 225.22 },
  { week: "2026-05-11", amount: 783.54 },
  { week: "2026-05-25", amount: 3648.06 },
  { week: "2026-06-01", amount: 1227.32 },
];

const REVERSAL = { week: "2026-06-15", amount: 2565.44 };

function sb() {
  return getServiceClient();
}

export function payoutBackfillPreview() {
  const payoutTotal = Math.round(PAYOUTS.reduce((s, row) => s + row.amount, 0) * 100) / 100;
  return { payouts: PAYOUTS, payoutTotal, reversal: REVERSAL };
}

export async function applyPayoutBackfill(opts: {
  organizationId: string;
  driverId: string;
  actorId: string;
  confirm: boolean;
}) {
  const preview = payoutBackfillPreview();
  if (!opts.confirm) return { ...preview, posted: false };
  for (const row of PAYOUTS) {
    const idempotencyKey = `backfill-payout:${opts.driverId}:${row.week}:${row.amount.toFixed(2)}`;
    const { error } = await sb().from("settlement_movements").insert(
      buildMovementRow({
        organizationId: opts.organizationId,
        driverId: opts.driverId,
        periodAnchor: row.week,
        kind: "pay",
        amountMinor: Math.round(row.amount * 100),
        idempotencyKey,
        actorId: opts.actorId,
        reason: `Backfill payout for the week of ${row.week}`,
        metadata: { backfill: true },
      }),
    );
    if (error && !/duplicate|unique/i.test(error.message)) throw new Error(error.message);
  }
  const reversalKey = `backfill-reversal:${opts.driverId}:${REVERSAL.week}:${REVERSAL.amount.toFixed(2)}`;
  const { error: reversalError } = await sb().from("settlement_movements").insert(
    buildMovementRow({
      organizationId: opts.organizationId,
      driverId: opts.driverId,
      periodAnchor: REVERSAL.week,
      kind: "reverse",
      amountMinor: Math.round(REVERSAL.amount * 100),
      idempotencyKey: reversalKey,
      actorId: opts.actorId,
      reason: `Backfill reversal for the week of ${REVERSAL.week}. The original payment has no movement row.`,
      metadata: { backfill: true },
    }),
  );
  if (reversalError && !/duplicate|unique/i.test(reversalError.message)) throw new Error(reversalError.message);
  return { ...preview, posted: true };
}
