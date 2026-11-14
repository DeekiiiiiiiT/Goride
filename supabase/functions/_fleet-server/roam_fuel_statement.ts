/**
 * RF-01 / RF-03 / RF-08 (docs/roam-fuel-card-statement-audit.md): Roam's JAA statement is
 * uploaded once (Fleet Admin → Gas cards → Statement import). Every fleet holding a Roam card
 * then has a "received" Roam-card file for each statement week — even a week with no fills —
 * so Week Reconciliation stops waiting on Roam. The fleet never uploads or confirms it.
 */
import { getServiceClient } from "./service_client.ts";
import { ensureReconImportBatch } from "./recon_batch_bridge.ts";
import { queueWeekDeskRefresh } from "./recon_desk_queue.ts";
import { fleetsWithRoamCards } from "./fuel_card_programs.ts";
import { periodEndForAnchor } from "../../../packages/finance-core/src/periodKey.ts";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Monday (yyyy-mm-dd) of a yyyy-mm-dd date. */
export function mondayOf(ymd: string): string | null {
  const s = String(ymd || "").slice(0, 10);
  if (!YMD.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Mon = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

/** Pure: the Monday-to-Sunday weeks a set of fill dates fall in (sorted, unique). */
export function statementWeeksFromDates(dates: string[]): string[] {
  const weeks = new Set<string>();
  for (const d of dates) {
    const m = mondayOf(d);
    if (m) weeks.add(m);
  }
  return [...weeks].sort();
}

/** Pure: clean a caller's week list down to real Mondays. */
export function normalizeStatementWeeks(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out = new Set<string>();
  for (const w of raw) {
    const s = String(w ?? "").slice(0, 10);
    if (YMD.test(s) && mondayOf(s) === s) out.add(s);
  }
  return [...out].sort();
}

/** One stable batch id per fleet + week, so registering again updates the same row. */
async function batchIdFor(orgId: string, week: string): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`fuelroam:${orgId}:${week}`)),
  ).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** The fleet's Roam-statement fills in one week (any import). */
async function roamFillsInWeek(orgId: string, week: string): Promise<number> {
  const { count, error } = await getServiceClient()
    .from("fleet_fuel_entries")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .gte("date", week)
    .lte("date", periodEndForAnchor(week))
    .not("payload_json->metadata->>jaaImportId", "is", null);
  if (error) throw new Error(`fuel fills read failed: ${error.message}`);
  return count ?? 0;
}

export type RoamRegisterResult = { fleets: number; weeks: string[]; registered: number; failed: string[] };

/** RF-01: mark the Roam-card file received for every Roam-card fleet, every given week. */
export async function registerRoamStatementWeeks(
  weeks: string[],
  fileName: string | null,
): Promise<RoamRegisterResult> {
  const clean = normalizeStatementWeeks(weeks);
  const orgs = clean.length ? await fleetsWithRoamCards() : [];
  const failed: string[] = [];
  let registered = 0;
  for (const orgId of orgs) {
    for (const week of clean) {
      const res = await ensureReconImportBatch({
        batchId: await batchIdFor(orgId, week),
        orgId,
        sourceId: "fuel_card_roam",
        coverageStart: week,
        coverageEnd: periodEndForAnchor(week),
        rowsCommitted: await roamFillsInWeek(orgId, week),
        fileName,
        type: "fuel_card_roam",
        status: "completed",
      });
      if (res.ok) registered += 1;
      else failed.push(`${orgId}:${week}:${res.error ?? "failed"}`);
    }
    await queueWeekDeskRefresh(orgId, clean);
  }
  return { fleets: orgs.length, weeks: clean, registered, failed };
}

/** RF-03: a deleted statement no longer covers its weeks (unless another statement still does). */
export async function unregisterRoamStatementWeeks(weeks: string[], stillCovered: Set<string>): Promise<number> {
  const drop = normalizeStatementWeeks(weeks).filter((w) => !stillCovered.has(w));
  if (drop.length === 0) return 0;
  const sb = getServiceClient();
  const orgs = await fleetsWithRoamCards();
  let removed = 0;
  for (const orgId of orgs) {
    for (const week of drop) {
      const { error } = await sb
        .from("fleet_import_batches")
        .update({ status: "superseded", updated_at: new Date().toISOString() })
        .eq("id", await batchIdFor(orgId, week))
        .eq("organization_id", orgId);
      if (!error) removed += 1;
    }
    await queueWeekDeskRefresh(orgId, drop);
  }
  return removed;
}

/** RF-08: the statement weeks of an import that was saved before weeks were recorded. */
export async function statementWeeksOfImport(importId: string): Promise<string[]> {
  const { data, error } = await getServiceClient()
    .from("fleet_fuel_entries")
    .select("date")
    .eq("payload_json->metadata->>jaaImportId", importId)
    .limit(5000);
  if (error) throw new Error(`fuel fills read failed: ${error.message}`);
  return statementWeeksFromDates((data ?? []).map((r) => String((r as { date?: string }).date ?? "")));
}
