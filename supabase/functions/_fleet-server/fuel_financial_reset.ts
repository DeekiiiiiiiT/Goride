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

function filterActiveEvents<T extends {
  id?: string;
  reverses_event_id?: string | null;
  reversed_at?: string | null;
}>(events: T[]): T[] {
  const reversedIds = new Set<string>();
  for (const ev of events) {
    if (ev?.reverses_event_id) reversedIds.add(String(ev.reverses_event_id));
  }
  return events.filter(
    (ev) =>
      ev?.id &&
      !ev.reverses_event_id &&
      !ev.reversed_at &&
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
      "id, event_type, domain, source_system, source_id, amount_minor, occurred_at, payload, reverses_event_id, reversed_at, driver_id, period_anchor",
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

/** Canonical snapshot field is driverSpend; keep legacy aliases for old KV rows. */
export function reportDriverSpendMajor(report: Record<string, any>): number {
  return Math.abs(
    Number(report.driverSpend) ||
      Number(report.driverCashSpend) ||
      Number(report.cashSpend) ||
      0,
  );
}

function roundCentsEqual(a: number, b: number): boolean {
  return Math.round(Math.abs(a) * 100) === Math.round(Math.abs(b) * 100);
}

/** Sum active fuel event amounts (major units) by type for staleness checks. */
function sumsFromActiveFuelEvents(active: any[]): {
  deduction: number;
  fleetShare: number;
  driverSpend: number;
  gasCard: number;
} {
  let deduction = 0;
  let fleetShare = 0;
  let driverSpend = 0;
  let gasCard = 0;
  for (const ev of active) {
    const major = Math.abs(minorToMajor(Number(ev.amount_minor) || 0));
    const et = String(ev.event_type || "");
    if (et === "fuel_deduction") deduction += major;
    else if (et === "fuel_fleet_share") fleetShare += major;
    else if (et === "fuel_driver_spend") driverSpend += major;
    else if (et === "fuel_gas_card_spend") gasCard += major;
  }
  return { deduction, fleetShare, driverSpend, gasCard };
}

/**
 * Post fuel close events from a finalized_report snapshot (finalize + heal).
 * Throws if any required post fails (caller may rollback KV).
 *
 * After delete/reset, prior rows stay (append-only) but reversed_at frees the
 * active-source unique slot. Idempotency keys still need a generation suffix
 * because keys are globally unique forever. source_id stays the report id.
 *
 * Re-finalize: if active events exist but amounts differ from the snapshot
 * (or Paid-by-Driver was never posted), reverse then post a new generation.
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
  const driverSpend = reportDriverSpendMajor(report);
  const gasCard = Math.abs(Number(report.gasCardSpend) || 0);
  const results: PostFinancialEventResult[] = [];

  const active = await listActiveFuelEventsForWeek(driverId, weekKey);
  if (active.length > 0) {
    const curr = sumsFromActiveFuelEvents(active);
    const amountsMatch =
      roundCentsEqual(curr.deduction, deduction) &&
      roundCentsEqual(curr.fleetShare, fleetShare) &&
      roundCentsEqual(curr.driverSpend, driverSpend) &&
      roundCentsEqual(curr.gasCard, gasCard);
    if (amountsMatch) {
      // Already closed with matching amounts — refresh Expenses projection only.
      const { rebuildDriverFinancialPeriod } = await import("./driver_financial_periods.ts");
      await rebuildDriverFinancialPeriod(driverId, weekKey);
      return { weekKey, driverId, results };
    }
    // Stale / incomplete ledger (e.g. first finalize then more fills, or missing driverSpend) —
    // reverse active fuel events then fall through to post the current snapshot.
    const rev = await reverseFuelFinancialEventsForWeek(
      driverId,
      weekKey,
      "fuel_re_finalize",
    );
    if (rev.errors.length > 0) {
      throw new Error(`fuel ledger reverse: ${rev.errors.join("; ")}`);
    }
  }

  // Next generation after prior closes (idempotency keys are never reused).
  const generation = await nextFuelFinalizeGeneration(driverId, weekKey);
  const keyBase =
    generation <= 1
      ? `fuel_finalized:${driverId}:${weekKey}`
      : `fuel_finalized:${driverId}:${weekKey}:g${generation}`;
  // Stable source id — reversed_at frees the unique active-source slot on reset.
  const sourceId = String(report.id || `${driverId}_${weekKey}`);

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
      payload: { reportId: report.id, weekStart: weekKey, generation },
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

/** Count prior non-reversal fuel_finalized rows → next close generation (1-based). */
async function nextFuelFinalizeGeneration(
  driverId: string,
  weekKey: string,
): Promise<number> {
  const { count, error } = await sb()
    .from("financial_events")
    .select("id", { count: "exact", head: true })
    .eq("driver_id", driverId)
    .eq("period_anchor", weekKey)
    .eq("domain", "fuel")
    .eq("event_type", "fuel_finalized")
    .is("reverses_event_id", null);
  if (error) throw new Error(error.message);
  return (count || 0) + 1;
}
