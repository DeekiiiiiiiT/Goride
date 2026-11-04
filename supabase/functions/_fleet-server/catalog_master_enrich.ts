import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

type MasterRow = {
  partId?: string;
  groupId?: string | null;
  wva?: string | null;
  fitCount?: number;
};

function partRows(payload: Record<string, unknown>): MasterRow[] {
  const out: MasterRow[] = [];
  const push = (rows: unknown) => {
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      if (row && typeof row === "object" && "partId" in row) out.push(row as MasterRow);
    }
  };
  push(payload.rows);
  const groups = payload.groups;
  if (groups && typeof groups === "object") {
    const g = groups as Record<string, unknown>;
    for (const key of ["oem", "engine", "aftermarket"]) push(g[key]);
  }
  return out;
}

/** Attach WVA and fitment counts from the database (admin_catalog_master_search rows). */
export async function enrichCatalogMasterSearch(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const rows = partRows(payload);
  const partIds = [...new Set(rows.map((r) => String(r.partId ?? "")).filter(Boolean))];
  const groupIds = [...new Set(rows.map((r) => String(r.groupId ?? "")).filter(Boolean))];
  if (!partIds.length) return payload;

  const wvaByPart = new Map<string, string>();
  const { data: wvaRows, error: wvaErr } = await supabase
    .from("part_index_number")
    .select("part_id, value, created_at")
    .in("part_id", partIds)
    .eq("index_type", "wva")
    .order("created_at", { ascending: false });
  if (wvaErr) throw wvaErr;
  for (const row of wvaRows ?? []) {
    const id = String((row as { part_id?: string }).part_id ?? "");
    if (!id || wvaByPart.has(id)) continue;
    const val = String((row as { value?: string }).value ?? "").trim();
    if (val) wvaByPart.set(id, val);
  }

  const fitByGroup = new Map<string, number>();
  if (groupIds.length) {
    const { data: fitRows, error: fitErr } = await supabase
      .from("part_listing")
      .select("interchange_group_id, vehicle_catalog_id")
      .in("interchange_group_id", groupIds);
    if (fitErr) throw fitErr;
    const seen = new Map<string, Set<string>>();
    for (const row of fitRows ?? []) {
      const gid = String((row as { interchange_group_id?: string }).interchange_group_id ?? "");
      const vid = String((row as { vehicle_catalog_id?: string }).vehicle_catalog_id ?? "");
      if (!gid || !vid) continue;
      let set = seen.get(gid);
      if (!set) {
        set = new Set<string>();
        seen.set(gid, set);
      }
      set.add(vid);
    }
    for (const [gid, set] of seen) fitByGroup.set(gid, set.size);
  }

  const stamp = (rows: unknown) => {
    if (!Array.isArray(rows)) return rows;
    return rows.map((raw) => {
      const row = raw as MasterRow;
      const partId = String(row.partId ?? "");
      const groupId = String(row.groupId ?? "");
      return {
        ...row,
        wva: wvaByPart.get(partId) ?? null,
        fitCount: groupId ? (fitByGroup.get(groupId) ?? 0) : 0,
      };
    });
  };

  const next = { ...payload };
  if (Array.isArray(payload.rows)) next.rows = stamp(payload.rows);
  if (payload.groups && typeof payload.groups === "object") {
    const g = payload.groups as Record<string, unknown>;
    next.groups = {
      ...g,
      oem: stamp(g.oem),
      engine: stamp(g.engine),
      aftermarket: stamp(g.aftermarket),
    };
  }
  return next;
}

/** Index group banner + fit via for drawer (admin_catalog_master_part). */
export async function enrichCatalogMasterPart(
  supabase: SupabaseClient,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const partId = String(body.partId ?? "");
  const wva = String(body.wva ?? "").trim();
  const groupCode = body.groupCode != null ? String(body.groupCode).trim() : "";
  const groupId = body.groupId != null ? String(body.groupId) : "";

  let indexGroupCode = groupCode || null;
  let indexGroupHeadline: string | null = null;
  let indexBadge: string | null = null;
  const wvaPeerLabels: string[] = [];

  if (wva) {
    if (!indexGroupCode) indexGroupCode = `GRP-WVA-${wva}`;
    const { data: peers, error } = await supabase
      .from("part_index_number")
      .select("part_id, part_master(manufacturer, oem_part_number, name)")
      .eq("index_type", "wva")
      .eq("value", wva)
      .neq("part_id", partId)
      .limit(12);
    if (error) throw error;
    for (const row of peers ?? []) {
      const pm = (row as { part_master?: { manufacturer?: string; oem_part_number?: string } }).part_master;
      const label = [pm?.manufacturer, pm?.oem_part_number].filter(Boolean).join(" ").trim();
      if (label) wvaPeerLabels.push(label);
    }
    const n = wvaPeerLabels.length;
    if (n > 0) {
      indexGroupHeadline = `Grouped with ${n} other part${n === 1 ? "" : "s"} by WVA ${wva}`;
      indexBadge = `Same WVA ${wva} as ${wvaPeerLabels[0]}`;
    }
  }

  const fits = Array.isArray(body.fits) ? body.fits.map((fit) => {
    const row = (fit && typeof fit === "object" ? fit : {}) as Record<string, unknown>;
    return {
      ...row,
      via: "direct",
      linkType: "DIRECT",
    };
  }) : [];

  let groupMembers = body.groupMembers;
  if (groupId && (!Array.isArray(groupMembers) || !(groupMembers as unknown[]).length)) {
    const { data: members, error: memErr } = await supabase
      .from("part_master")
      .select("id, manufacturer, oem_part_number, name")
      .eq("interchange_group_id", groupId)
      .neq("id", partId)
      .order("oem_part_number")
      .limit(12);
    if (memErr) throw memErr;
    groupMembers = (members ?? []).map((m) => ({
      partId: (m as { id: string }).id,
      brand: (m as { manufacturer?: string }).manufacturer,
      number: (m as { oem_part_number?: string }).oem_part_number,
      name: (m as { name?: string }).name,
    }));
  }

  return {
    ...body,
    fits,
    indexGroupCode,
    indexGroupHeadline,
    indexBadge,
    wvaPeerLabels,
    groupMembers,
  };
}
