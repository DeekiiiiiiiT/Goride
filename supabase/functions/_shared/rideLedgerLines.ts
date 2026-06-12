/**
 * Build and persist immutable ledger lines for completed Roam platform rides.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface RideLedgerLineInsert {
  ride_request_id: string;
  line_kind: string;
  description: string;
  reporting_at: string;
  paid_to_you_minor: number;
  earnings_gross_minor: number;
  cash_collected_minor: number;
  bank_transferred_minor: number;
  fare_breakdown: Record<string, number>;
  payment_method: "cash" | "card" | null;
  driver_user_id: string | null;
  rider_user_id: string;
  idempotency_key: string;
}

function breakdownFromRide(ride: Record<string, unknown>, fareMinor: number): Record<string, number> {
  const raw = ride.fare_final_breakdown ?? ride.fare_breakdown;
  const waitTimeFeeMinor = Number(ride.wait_time_fee_minor) || 0;
  if (raw && typeof raw === "object") {
    const b = raw as Record<string, unknown>;
    return {
      base_minor: Number(b.base_minor) || 0,
      booking_fee_minor: Number(b.booking_fee_minor) || 0,
      distance_component_minor: Number(b.distance_component_minor) || 0,
      time_component_minor: Number(b.time_component_minor) || 0,
      after_surge_minor: Number(b.after_surge_minor) || fareMinor,
      estimated_tolls_minor: Number(b.estimated_tolls_minor) || 0,
      wait_time_fee_minor: waitTimeFeeMinor,
      actual_tolls_minor: Number(b.actual_tolls_minor) || 0,
    };
  }
  return { after_surge_minor: fareMinor, wait_time_fee_minor: waitTimeFeeMinor };
}

export function buildRideLedgerLineInserts(ride: Record<string, unknown>): RideLedgerLineInsert[] {
  const rideId = String(ride.id);
  const riderUserId = String(ride.rider_user_id);
  const driverUserId = (ride.assigned_driver_user_id as string | null) ?? null;
  const paymentMethod = (ride.payment_method as "cash" | "card" | null) ?? "cash";
  const completedAt = String(ride.completed_at ?? ride.updated_at ?? new Date().toISOString());
  const fareMinor = Number(ride.fare_final_minor ?? ride.fare_estimate_minor) || 0;
  const platformFeeMinor = Number(ride.platform_fee_minor) || 0;
  const tipMinor = Number(ride.tip_minor) || 0;
  const driverNetMinor = Number(ride.driver_net_minor) || Math.max(0, fareMinor - platformFeeMinor);
  const breakdown = breakdownFromRide(ride, fareMinor);

  const lines: RideLedgerLineInsert[] = [];
  const settledCash = ride.cash_settlement_status === "settled"
    && ride.cash_received_minor != null;
  const cashReceivedMinor = settledCash
    ? Math.max(0, Number(ride.cash_received_minor) || 0)
    : 0;

  lines.push({
    ride_request_id: rideId,
    line_kind: "fare_earning",
    description: "Roam trip fare",
    reporting_at: completedAt,
    paid_to_you_minor: driverNetMinor,
    earnings_gross_minor: fareMinor,
    cash_collected_minor: paymentMethod === "cash" && !settledCash ? -fareMinor : 0,
    bank_transferred_minor: paymentMethod === "card" ? fareMinor : 0,
    fare_breakdown: breakdown,
    payment_method: paymentMethod,
    driver_user_id: driverUserId,
    rider_user_id: riderUserId,
    idempotency_key: `ride:${rideId}|fare_earning`,
  });

  if (paymentMethod === "cash" && settledCash) {
    lines.push({
      ride_request_id: rideId,
      line_kind: "cash_collection",
      description: "Cash collected from rider",
      reporting_at: completedAt,
      paid_to_you_minor: 0,
      earnings_gross_minor: cashReceivedMinor,
      cash_collected_minor: cashReceivedMinor,
      bank_transferred_minor: 0,
      fare_breakdown: {
        cash_received_minor: cashReceivedMinor,
        fare_final_minor: fareMinor,
      },
      payment_method: paymentMethod,
      driver_user_id: driverUserId,
      rider_user_id: riderUserId,
      idempotency_key: `ride:${rideId}|cash_collection`,
    });
  }

  if (tipMinor > 0) {
    lines.push({
      ride_request_id: rideId,
      line_kind: "tip",
      description: "Roam trip tip",
      reporting_at: completedAt,
      paid_to_you_minor: tipMinor,
      earnings_gross_minor: tipMinor,
      cash_collected_minor: 0,
      bank_transferred_minor: 0,
      fare_breakdown: { tip_minor: tipMinor },
      payment_method: paymentMethod,
      driver_user_id: driverUserId,
      rider_user_id: riderUserId,
      idempotency_key: `ride:${rideId}|tip`,
    });
  }

  if (platformFeeMinor > 0) {
    lines.push({
      ride_request_id: rideId,
      line_kind: "platform_fee",
      description: "Roam platform fee",
      reporting_at: completedAt,
      paid_to_you_minor: -platformFeeMinor,
      earnings_gross_minor: platformFeeMinor,
      cash_collected_minor: 0,
      bank_transferred_minor: 0,
      fare_breakdown: { platform_fee_minor: platformFeeMinor },
      payment_method: paymentMethod,
      driver_user_id: driverUserId,
      rider_user_id: riderUserId,
      idempotency_key: `ride:${rideId}|platform_fee`,
    });
  }

  return lines;
}

function cancelDescription(ride: Record<string, unknown>): string {
  const by = String(ride.cancelled_by ?? "unknown");
  const reason = ride.cancel_reason ? ` — ${String(ride.cancel_reason)}` : "";
  return `Roam trip cancelled (${by})${reason}`;
}

export function buildCancelledRideLedgerLines(ride: Record<string, unknown>): RideLedgerLineInsert[] {
  const rideId = String(ride.id);
  const riderUserId = String(ride.rider_user_id);
  const driverUserId = (ride.assigned_driver_user_id as string | null) ?? null;
  const paymentMethod = (ride.payment_method as "cash" | "card" | null) ?? null;
  const reportingAt = String(
    ride.updated_at ?? ride.created_at ?? new Date().toISOString(),
  );

  return [{
    ride_request_id: rideId,
    line_kind: "trip_cancelled",
    description: cancelDescription(ride),
    reporting_at: reportingAt,
    paid_to_you_minor: 0,
    earnings_gross_minor: 0,
    cash_collected_minor: 0,
    bank_transferred_minor: 0,
    fare_breakdown: {},
    payment_method: paymentMethod,
    driver_user_id: driverUserId,
    rider_user_id: riderUserId,
    idempotency_key: `ride:${rideId}|cancelled`,
  }];
}

export function buildLedgerLinesForTerminalState(
  ride: Record<string, unknown>,
): RideLedgerLineInsert[] {
  const status = String(ride.status ?? "");
  if (status === "completed") return buildRideLedgerLineInserts(ride);
  if (status === "cancelled") return buildCancelledRideLedgerLines(ride);
  return [];
}

async function upsertLedgerLines(
  db: SupabaseClient,
  lines: RideLedgerLineInsert[],
): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;

  for (const line of lines) {
    const { error } = await db.from("ledger_lines").upsert(line, {
      onConflict: "idempotency_key",
      ignoreDuplicates: true,
    });
    if (error) {
      if (String(error.message).includes("duplicate") || String(error.code) === "23505") {
        skipped++;
      } else {
        console.error("[rideLedgerLines] insert failed:", error.message, line.idempotency_key);
      }
    } else {
      inserted++;
    }
  }

  return { inserted, skipped };
}

export async function persistRideLedgerLines(
  db: SupabaseClient,
  ride: Record<string, unknown>,
): Promise<{ inserted: number; skipped: number }> {
  return persistRideLedgerLinesForTerminalState(db, ride);
}

export async function persistRideLedgerLinesForTerminalState(
  db: SupabaseClient,
  ride: Record<string, unknown>,
): Promise<{ inserted: number; skipped: number }> {
  const lines = buildLedgerLinesForTerminalState(ride);
  if (lines.length === 0) return { inserted: 0, skipped: 0 };
  return upsertLedgerLines(db, lines);
}

export async function finalizeRideLedgerFields(
  db: SupabaseClient,
  rideId: string,
  ride: Record<string, unknown>,
): Promise<void> {
  const fareMinor = Number(ride.fare_final_minor ?? ride.fare_estimate_minor) || 0;
  const platformFeeMinor = Number(ride.platform_fee_minor) || 0;
  const breakdown = ride.fare_breakdown ?? null;

  await db.from("ride_requests").update({
    fare_final_breakdown: breakdown,
    platform_fee_minor: platformFeeMinor,
    tip_minor: Number(ride.tip_minor) || 0,
    driver_net_minor: Math.max(0, fareMinor - platformFeeMinor),
  }).eq("id", rideId);
}
