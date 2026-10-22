/**
 * App-logged trip edits and deletes must not land on a closed pay week.
 * Platform CSV imports are not gated here.
 */
import { getServiceClient } from "./service_client.ts";
import { isPeriodFrozen } from "./settlement_period_freeze.ts";
import { isAppLoggedTrip } from "./trip_save_dedupe.ts";
import { periodKeyFor } from "../../../packages/finance-core/src/periodKey.ts";

export type WeekGate = "missing" | "open" | "frozen" | "unresolved";

export type DeleteDecision =
  | { allow: false; status: 404 | 409; error: string }
  | { allow: true; weekMissing: boolean; rebuild: boolean; anchor: string | null; driverId: string };

export function tripPayAnchor(trip: Record<string, unknown> | null | undefined): string | null {
  if (!trip) return null;
  const raw = String(trip.date ?? trip.requestTime ?? trip.completed_at ?? "").trim();
  if (!raw) return null;
  return periodKeyFor(raw);
}

export function deleteTripDecision(
  trip: Record<string, unknown> | null | undefined,
  week: WeekGate,
): DeleteDecision {
  if (!trip) return { allow: false, status: 404, error: "Trip not found" };
  if (!isAppLoggedTrip(trip)) {
    return { allow: false, status: 409, error: "Imported trips stay in the ledger." };
  }
  if (week === "frozen") {
    return { allow: false, status: 409, error: "That pay week is closed, so this trip stays." };
  }
  if (week === "unresolved") {
    return { allow: false, status: 409, error: "This trip has no driver or date, so it cannot be removed." };
  }
  const driverId = String(trip.driverId ?? "").trim();
  const anchor = tripPayAnchor(trip);
  if (week === "missing") {
    return { allow: true, weekMissing: true, rebuild: false, anchor, driverId };
  }
  return { allow: true, weekMissing: false, rebuild: true, anchor, driverId };
}

/** Null when this save is not an app-logged edit or new log. */
export function appLoggedWriteAnchors(
  incoming: Record<string, unknown>,
  stored: Record<string, unknown> | null | undefined,
): Array<{ driverId: string; anchor: string | null }> | null {
  const incomingApp = isAppLoggedTrip(incoming);
  const storedApp = !!stored && isAppLoggedTrip(stored);
  if (!incomingApp && !storedApp) return null;
  const pairs: Array<{ driverId: string; anchor: string | null }> = [];
  if (storedApp && stored) {
    pairs.push({
      driverId: String(stored.driverId ?? "").trim(),
      anchor: tripPayAnchor(stored),
    });
  }
  if (incomingApp) {
    pairs.push({
      driverId: String(incoming.driverId ?? stored?.driverId ?? "").trim(),
      anchor: tripPayAnchor(incoming),
    });
  }
  return pairs;
}

export function writeBlockedReason(
  pairs: Array<{ driverId: string; anchor: string | null }> | null,
  gates: WeekGate[],
): string | null {
  if (pairs === null) return null;
  if (pairs.length === 0 || pairs.some((p) => !p.driverId || !p.anchor) || gates.includes("unresolved")) {
    return "This trip has no driver or date, so it cannot be changed.";
  }
  if (gates.includes("frozen")) {
    return "That pay week is closed, so this trip cannot be changed.";
  }
  return null;
}

export async function weekGateForAnchor(driverId: string, anchor: string): Promise<WeekGate> {
  const { data, error } = await getServiceClient()
    .from("driver_financial_periods")
    .select("status, metadata, closed_at")
    .eq("driver_id", driverId)
    .eq("period_anchor", anchor)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return "missing";
  const row = data as {
    status?: string | null;
    metadata?: Record<string, unknown> | null;
    closed_at?: string | null;
  };
  return isPeriodFrozen({
    status: row.status,
    metadata: row.metadata,
    closedAt: row.closed_at,
    settlementStatus: row.status,
  })
    ? "frozen"
    : "open";
}

export async function weekGateForTrip(trip: Record<string, unknown>): Promise<WeekGate> {
  const driverId = String(trip.driverId ?? "").trim();
  const anchor = tripPayAnchor(trip);
  if (!driverId || !anchor) return "unresolved";
  return weekGateForAnchor(driverId, anchor);
}

/** 409 message when an app-logged save would touch a closed week. CSV imports return null. */
export async function appLoggedWriteBlock(
  incoming: Record<string, unknown>,
  stored: Record<string, unknown> | null | undefined,
): Promise<string | null> {
  const pairs = appLoggedWriteAnchors(incoming, stored);
  if (pairs === null) return null;
  if (pairs.length === 0 || pairs.some((p) => !p.driverId || !p.anchor)) {
    return writeBlockedReason(pairs, ["unresolved"]);
  }
  const gates: WeekGate[] = [];
  const seen = new Set<string>();
  for (const pair of pairs) {
    const key = `${pair.driverId}|${pair.anchor}`;
    if (seen.has(key)) continue;
    seen.add(key);
    gates.push(await weekGateForAnchor(pair.driverId, pair.anchor as string));
  }
  return writeBlockedReason(pairs, gates);
}
