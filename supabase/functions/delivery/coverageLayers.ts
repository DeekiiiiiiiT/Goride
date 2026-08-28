/**
 * Load scoped exclusion layers: global → parish → market-local (in service_zone_polygons).
 */
// deno-lint-ignore no-explicit-any
type ServiceSb = {
  from: (t: string) => any;
};

export type ScopedExclusionRow = Record<string, unknown>;

async function loadScopedSchedules(
  sb: ServiceSb,
  zoneIds: string[],
): Promise<Map<string, Record<string, unknown>[]>> {
  const map = new Map<string, Record<string, unknown>[]>();
  if (!zoneIds.length) return map;
  const { data } = await sb
    .from("scoped_zone_schedules")
    .select("zone_id, dow, start_time, end_time, timezone")
    .in("zone_id", zoneIds);
  for (const row of data ?? []) {
    const r = row as Record<string, unknown>;
    const zid = String(r.zone_id);
    const list = map.get(zid) ?? [];
    list.push(r);
    map.set(zid, list);
  }
  return map;
}

async function loadMarketZoneSchedules(
  sb: ServiceSb,
  zoneIds: string[],
): Promise<Map<string, Record<string, unknown>[]>> {
  const map = new Map<string, Record<string, unknown>[]>();
  if (!zoneIds.length) return map;
  const { data } = await sb
    .from("zone_schedules")
    .select("zone_id, dow, start_time, end_time, timezone")
    .in("zone_id", zoneIds);
  for (const row of data ?? []) {
    const r = row as Record<string, unknown>;
    const zid = String(r.zone_id);
    const list = map.get(zid) ?? [];
    list.push(r);
    map.set(zid, list);
  }
  return map;
}

function schedulesFromRows(rows: Record<string, unknown>[] | undefined) {
  if (!rows?.length) return undefined;
  return rows.map((r) => ({
    dow: Array.isArray(r.dow) ? (r.dow as number[]) : [],
    start_time: String(r.start_time ?? "00:00"),
    end_time: String(r.end_time ?? "23:59"),
    timezone: r.timezone != null ? String(r.timezone) : undefined,
  }));
}

/** Applicable scoped exclusions for a parish + market. */
export async function loadScopedExclusionsForPoint(
  sb: ServiceSb,
  parishId: string | null,
  marketId: string | null,
): Promise<ScopedExclusionRow[]> {
  const rows: ScopedExclusionRow[] = [];

  const { data: globalRows } = await sb
    .from("scoped_exclusion_zones")
    .select("*")
    .eq("scope", "global")
    .eq("is_active", true);
  rows.push(...((globalRows ?? []) as ScopedExclusionRow[]));

  if (parishId) {
    const { data: parishRows } = await sb
      .from("scoped_exclusion_zones")
      .select("*")
      .eq("scope", "parish")
      .eq("parish_id", parishId)
      .eq("is_active", true);
    rows.push(...((parishRows ?? []) as ScopedExclusionRow[]));
  }

  if (marketId) {
    const { data: marketRows } = await sb
      .from("scoped_exclusion_zones")
      .select("*")
      .eq("scope", "market")
      .eq("market_id", marketId)
      .eq("is_active", true);
    rows.push(...((marketRows ?? []) as ScopedExclusionRow[]));
  }

  const ids = rows.map((r) => String(r.id));
  const schedMap = await loadScopedSchedules(sb, ids);
  return rows.map((r) => ({
    ...r,
    kind: "exclude",
    schedules: schedulesFromRows(schedMap.get(String(r.id))),
  }));
}

export async function enrichMarketZonesWithSchedules(
  sb: ServiceSb,
  rows: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  const ids = rows.map((r) => String(r.id)).filter(Boolean);
  const schedMap = await loadMarketZoneSchedules(sb, ids);
  return rows.map((r) => ({
    ...r,
    schedules: schedulesFromRows(schedMap.get(String(r.id))),
  }));
}

export async function resolveParishIdForMarket(
  sb: ServiceSb,
  marketId: string,
): Promise<string | null> {
  const { data } = await sb
    .from("service_markets")
    .select("parish_id")
    .eq("id", marketId)
    .maybeSingle();
  return data?.parish_id != null ? String(data.parish_id) : null;
}
