/**
 * Fuel expense sync — reverse active fuel financial_events for a driver-week
 * and rebuild driver_financial_periods (toll-reset parity).
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  minorToMajor,
  postFinancialEvent,
  reverseFinancialEvent,
  type PostFinancialEventResult,
} from "./financial_ledger.ts";

const FUEL_EVENT_TYPES = new Set([
  "fuel_finalized",
  "fuel_deduction",
  "fuel_fleet_share",
  "fuel_driver_spend",
  "fuel_gas_card_spend",
]);

function sb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function filterActiveEvents<T extends { id?: string; reverses_event_id?: string | null }>(
  events: T[],
): T[] {
  const reversedIds = new Set<string>();
  for (const ev of events) {
    if (ev?.reverses_event_id) reversedIds.add(String(ev.reverses_event_id));
  }
  return events.filter(
    (ev) =>
      ev?.id &&
      !ev.reverses_event_id &&
      !reversedIds.has(String(ev.id)),
  );
}

/** Load active (unreversed) fuel events for a driver-week. */
export async function listActiveFuelEventsForWeek(
  driverId: string,
  weekKey: string,
): Promise<any[]> {
  const { data, error } = await sb()
    .from("financial_events")
    .select(
      "id, event_type, domain, source_system, source_id, amount_minor, occurred_at, payload, reverses_event_id, driver_id, period_anchor",
    )
    .eq("driver_id", driverId)
    .eq("period_anchor", weekKey)
    .eq("domain", "fuel");
  if (error) throw new Error(error.message);
  const fuelOnly = (data || []).filter((ev: any) =>
    FUEL_EVENT_TYPES.has(String(ev.event_type || "")),
  );
  return filterActiveEvents(fuelOnly);
}

/**
 * Reverse every active fuel event for driver+week via compensating ledger rows.
 */
export async function reverseFuelFinancialEventsForWeek(
  driverId: string,
  weekKey: string,
  reason = "fuel_period_reset",
): Promise<{ eventsReversed: number; errors: string[] }> {
  const errors: string[] = [];
  let eventsReversed = 0;
  const active = await listActiveFuelEventsForWeek(driverId, weekKey);

  for (const ev of active) {
    const eventId = String(ev.id);
    const amountMajor = minorToMajor(Number(ev.amount_minor) || 0);
    const result = await reverseFinancialEvent({
      priorEventId: eventId,
      idempotencyKey: `fuel_reset:${driverId}:${weekKey}:${eventId}`,
      reason,
      driverId,
      domain: "fuel",
      eventType: String(ev.event_type || "fuel_finalized"),
      sourceSystem: "fuel_ops",
      sourceId: String(ev.source_id || eventId),
      amountMajor,
      occurredAt: weekKey,
      payload: { weekStart: weekKey, priorEventType: ev.event_type },
    });
    if (result.ok || result.skipped) {
      eventsReversed++;
    } else {
      errors.push(`reverse ${eventId}: ${result.error || "failed"}`);
    }
  }

  return { eventsReversed, errors };
}

/** Reverse fuel events for many drivers, then rebuild expense projections. */
export async function reverseFuelFinancialEventsAndRebuild(
  driverIds: Iterable<string>,
  weekKey: string,
  reason = "fuel_period_reset",
): Promise<{ eventsReversed: number; periodsRebuilt: number; errors: string[] }> {
  const errors: string[] = [];
  let eventsReversed = 0;
  let periodsRebuilt = 0;
  const unique = [...new Set([...driverIds].map(String).filter(Boolean))];

  for (const driverId of unique) {
    try {
      const r = await reverseFuelFinancialEventsForWeek(driverId, weekKey, reason);
      eventsReversed += r.eventsReversed;
      errors.push(...r.errors);
    } catch (e: any) {
      errors.push(`reverse fuel ${driverId}/${weekKey}: ${e?.message || e}`);
    }
  }

  if (unique.length === 0) {
    return { eventsReversed, periodsRebuilt, errors };
  }

  try {
    const { rebuildPeriodsForAnchors } = await import("./driver_financial_periods.ts");
    for (const driverId of unique) {
      try {
        periodsRebuilt += await rebuildPeriodsForAnchors(driverId, [weekKey]);
      } catch (e: any) {
        errors.push(`rebuild expenses ${driverId}: ${e?.message || e}`);
      }
    }
  } catch (e: any) {
    errors.push(`rebuild import: ${e?.message || e}`);
  }

  return { eventsReversed, periodsRebuilt, errors };
}

/**
 * Post fuel close events from a finalized_report snapshot (finalize + heal).
 * Throws if any required post fails (caller may rollback KV).
 */
export async function postFuelFinalizedEventsFromReport(
  report: Record<string, any>,
): Promise<{ weekKey: string; driverId: string; results: PostFinancialEventResult[] }> {
  if (!report?.weekStart || !report?.driverId) {
    throw new Error("report missing weekStart or driverId");
  }
  const weekKey = String(report.weekStart).split("T")[0];
  const driverId = String(report.driverId);
  const deduction = Math.abs(Number(report.driverShare) || 0);
  const fleetShare = Math.abs(Number(report.companyShare) || 0);
  const driverSpend = Math.abs(
    Number(report.driverCashSpend) || Number(report.cashSpend) || 0,
  );
  const gasCard = Math.abs(Number(report.gasCardSpend) || 0);
  const keyBase = `fuel_finalized:${driverId}:${weekKey}`;
  const sourceId = String(report.id || keyBase);
  const results: PostFinancialEventResult[] = [];

  const check = (r: PostFinancialEventResult, label: string) => {
    results.push(r);
    if (!r.ok && !r.skipped) {
      throw new Error(`fuel ledger ${label}: ${r.error || "failed"}`);
    }
  };

  check(
    await postFinancialEvent({
      idempotencyKey: `${keyBase}|finalized`,
      domain: "fuel",
      eventType: "fuel_finalized",
      sourceSystem: "fuel_ops",
      sourceId,
      driverId,
      vehicleId: report.vehicleId || null,
      occurredAt: weekKey,
      amountMajor: 0,
      direction: "neutral",
      payload: { reportId: report.id, weekStart: weekKey },
    }),
    "finalized",
  );

  if (deduction > 0) {
    check(
      await postFinancialEvent({
        idempotencyKey: `${keyBase}|deduction`,
        domain: "fuel",
        eventType: "fuel_deduction",
        sourceSystem: "fuel_ops",
        sourceId,
        driverId,
        occurredAt: weekKey,
        amountMajor: -deduction,
        direction: "outflow",
        debitAccountKey: "platform:driver_receivable",
        creditAccountKey: "platform:fleet_fuel_expense",
        allocations: [{
          allocation_type: "driver_share",
          amount_minor: Math.round(deduction * 100),
          driver_id: driverId,
          fuel_entry_id: String(report.id || ""),
        }],
      }),
      "deduction",
    );
  }
  if (fleetShare > 0) {
    check(
      await postFinancialEvent({
        idempotencyKey: `${keyBase}|fleet_share`,
        domain: "fuel",
        eventType: "fuel_fleet_share",
        sourceSystem: "fuel_ops",
        sourceId,
        driverId,
        occurredAt: weekKey,
        amountMajor: -fleetShare,
        direction: "outflow",
        allocations: [{
          allocation_type: "fleet_share",
          amount_minor: Math.round(fleetShare * 100),
          driver_id: driverId,
        }],
      }),
      "fleet_share",
    );
  }
  if (driverSpend > 0) {
    check(
      await postFinancialEvent({
        idempotencyKey: `${keyBase}|driver_spend`,
        domain: "fuel",
        eventType: "fuel_driver_spend",
        sourceSystem: "fuel_ops",
        sourceId,
        driverId,
        occurredAt: weekKey,
        amountMajor: -driverSpend,
        direction: "outflow",
      }),
      "driver_spend",
    );
  }
  if (gasCard > 0) {
    check(
      await postFinancialEvent({
        idempotencyKey: `${keyBase}|gas_card`,
        domain: "fuel",
        eventType: "fuel_gas_card_spend",
        sourceSystem: "fuel_ops",
        sourceId,
        driverId,
        occurredAt: weekKey,
        amountMajor: -gasCard,
        direction: "outflow",
        debitAccountKey: "platform:fleet_fuel_expense",
        creditAccountKey: "platform:fuel_card_clearing",
      }),
      "gas_card",
    );
  }

  const { rebuildDriverFinancialPeriod } = await import("./driver_financial_periods.ts");
  await rebuildDriverFinancialPeriod(driverId, weekKey);

  return { weekKey, driverId, results };
}
