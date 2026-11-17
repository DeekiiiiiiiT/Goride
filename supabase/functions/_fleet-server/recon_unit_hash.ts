import { getServiceClient } from "./service_client.ts";
import { periodEndForAnchor } from "../../../packages/finance-core/src/periodKey.ts";
import { canonicalFactLines, sha256Hex } from "./recon_projection.ts";

const DRIVER_WEEK_STATEMENT_KINDS = ["earnings", "fuel", "toll"] as const;

function sb() {
  return getServiceClient();
}

async function policyVersion(orgId: string): Promise<string> {
  const { data } = await sb()
    .from("fleet_earnings_policies")
    .select("updated_at")
    .eq("organization_id", orgId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return String((data as { updated_at?: string } | null)?.updated_at || "");
}

function linesFrom(
  rows: Array<{ id?: string; updated_at?: string; amount?: number }> | null,
): Array<{ id: string; updatedAt: string; amount: number }> {
  return (rows ?? []).map((row) => ({
    id: String(row.id || ""),
    updatedAt: String(row.updated_at || ""),
    amount: Number(row.amount) || 0,
  }));
}

function movementLinesFrom(
  rows: Array<{ id?: string; created_at?: string; amount_minor?: number }> | null,
): Array<{ id: string; updatedAt: string; amount: number }> {
  return (rows ?? []).map((row) => ({
    id: String(row.id || ""),
    updatedAt: String(row.created_at || ""),
    amount: Number(row.amount_minor) || 0,
  }));
}

/** Latest closed/draft statement fingerprint per lane (WRA-67). */
export function statementHashLines(
  rows: Array<{ kind?: string; version?: number; source_hash?: string | null }>,
): string[] {
  const byKind = new Map<string, { version: number; sourceHash: string }>();
  for (const row of rows) {
    const kind = String(row.kind || "");
    if (!(DRIVER_WEEK_STATEMENT_KINDS as readonly string[]).includes(kind)) continue;
    const version = Number(row.version) || 0;
    const prev = byKind.get(kind);
    if (!prev || version > prev.version) {
      byKind.set(kind, { version, sourceHash: String(row.source_hash ?? "") });
    }
  }
  const out: string[] = [];
  for (const kind of DRIVER_WEEK_STATEMENT_KINDS) {
    const s = byKind.get(kind);
    out.push(s ? `stmt|${kind}|${s.version}|${s.sourceHash}` : `stmt|${kind}|0|`);
  }
  return out;
}

function stableJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => stableJson(v)).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableJson(obj[k])}`).join(",")}}`;
}

/** One canonical line for the driver's toll v2 week result (WRA-67). */
export function tollV2HashLine(line: unknown): string {
  if (line == null) return "toll_v2|";
  return `toll_v2|${stableJson(line)}`;
}

/** Fact rows + prefixed supplement lines + policy (WRA-67). */
export function buildDriverWeekHashInput(
  factRows: Array<{ id: string; updatedAt: string; amount: number }>,
  policyVersion: string,
  supplementLines: string[],
): string {
  const lines = factRows.map((row) => `${row.id}|${row.updatedAt}|${Number(row.amount) || 0}`);
  lines.push(...supplementLines);
  lines.sort();
  lines.push(`policy|${policyVersion}`);
  return lines.join("\n");
}

export async function hashVehicleWeekFacts(
  orgId: string,
  weekKey: string,
  vehicleId: string,
): Promise<string> {
  const end = periodEndForAnchor(weekKey);
  const [{ data }, policy] = await Promise.all([
    sb()
      .from("fleet_fuel_entries")
      .select("id, updated_at, amount")
      .eq("organization_id", orgId)
      .eq("vehicle_id", vehicleId)
      .gte("date", weekKey)
      .lte("date", end)
      .limit(5000),
    policyVersion(orgId),
  ]);
  return sha256Hex(canonicalFactLines(linesFrom(data as never), policy));
}

export async function hashDriverWeekFacts(
  orgId: string,
  weekKey: string,
  driverId: string,
): Promise<string> {
  const end = periodEndForAnchor(weekKey);
  const [trips, tolls, fuel, policy, statements, movements, tollV2On] = await Promise.all([
    sb()
      .from("fleet_trips")
      .select("id, updated_at, amount")
      .eq("organization_id", orgId)
      .eq("driver_id", driverId)
      .gte("date", weekKey)
      .lte("date", end)
      .limit(8000),
    sb()
      .from("fleet_toll_ledger")
      .select("id, updated_at, amount")
      .eq("organization_id", orgId)
      .eq("driver_id", driverId)
      .gte("date", weekKey)
      .lte("date", end)
      .limit(8000),
    sb()
      .from("fleet_fuel_entries")
      .select("id, updated_at, amount")
      .eq("organization_id", orgId)
      .eq("driver_id", driverId)
      .gte("date", weekKey)
      .lte("date", end)
      .limit(5000),
    policyVersion(orgId),
    sb()
      .from("week_statements")
      .select("kind, version, source_hash")
      .eq("organization_id", orgId)
      .eq("driver_id", driverId)
      .eq("week_key", weekKey)
      .in("kind", [...DRIVER_WEEK_STATEMENT_KINDS])
      .order("version", { ascending: false })
      .limit(50),
    sb()
      .from("settlement_movements")
      .select("id, created_at, amount_minor")
      .eq("organization_id", orgId)
      .eq("driver_id", driverId)
      .eq("period_anchor", weekKey)
      .limit(500),
    sb().rpc("toll_sys_tolls_v2_on", { p_company: orgId }),
  ]);

  let tollV2Supplement = tollV2HashLine(null);
  if (Boolean(tollV2On.data)) {
    const { data: tollWeek } = await sb().rpc("toll_sys_driver_week_tolls", {
      p_company: orgId,
      p_week: weekKey,
      p_driver: driverId,
    });
    const line = (tollWeek as { line?: unknown } | null)?.line;
    tollV2Supplement = tollV2HashLine(line);
  }

  const factRows = [
    ...linesFrom(trips.data as never),
    ...linesFrom(tolls.data as never),
    ...linesFrom(fuel.data as never),
    ...movementLinesFrom(movements.data as never),
  ];
  const supplement = [...statementHashLines((statements.data ?? []) as never), tollV2Supplement];
  const input = buildDriverWeekHashInput(factRows, policy, supplement);
  return sha256Hex(input);
}