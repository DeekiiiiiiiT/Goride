/**
 * Fleet-safe part detail (RB-10) from admin_catalog_master_part.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { assertNoCustomerIdentity } from "./catalog_parts_shape.ts";
import { partPictureUrlFromKey, type PictureUrl } from "./part_picture_urls.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** §3.6: one picture for the answer's interchange group, and only while it is ready (a hidden one is not). */
export type FleetPartPicture = { url: PictureUrl; urlDetail: PictureUrl } | null;

/**
 * The group's picture, or null. `status = 'ready'` is the whole rule: queued, making, failed and hidden pictures are
 * never shown in Fleet (§3.6), and a read problem must never hide the part itself.
 */
export async function readFleetPartPicture(
  supabase: SupabaseClient,
  groupId: string | null,
): Promise<FleetPartPicture> {
  if (!groupId || !UUID_RE.test(groupId)) return null;
  try {
    const { data, error } = await supabase
      .from("part_picture")
      .select("r2_key, status")
      .eq("interchange_group_id", groupId)
      .eq("status", "ready")
      .maybeSingle();
    if (error || !data) return null;
    const row = data as { r2_key?: string | null; status?: string | null };
    if (row.status !== "ready" || !row.r2_key) return null;
    const url = partPictureUrlFromKey(row.r2_key, "card");
    const urlDetail = partPictureUrlFromKey(row.r2_key, "detail");
    return url && urlDetail ? { url, urlDetail } : null;
  } catch {
    return null;
  }
}

/**
 * §3.6 for the multi-card answers (calipers, cables, shoes): one read for every card's group, the same ready-only
 * rule. Each item in `sections[].items[]` gets `picture` (null when none). A read problem leaves the cards as they were.
 */
export async function attachFleetPartPictures<T extends { sections?: Array<{ items?: Array<Record<string, unknown>> }> }>(
  supabase: SupabaseClient,
  body: T,
): Promise<T> {
  const items = (body.sections ?? []).flatMap((s) => s.items ?? []);
  const groupIds = [...new Set(items.map((i) => String(i.groupId ?? "")).filter((id) => UUID_RE.test(id)))];
  if (!groupIds.length) return body;
  try {
    const { data, error } = await supabase
      .from("part_picture")
      .select("interchange_group_id, r2_key, status")
      .in("interchange_group_id", groupIds)
      .eq("status", "ready");
    if (error) return body;
    const byGroup = new Map<string, FleetPartPicture>();
    for (const row of (data ?? []) as Array<{ interchange_group_id?: string; r2_key?: string | null; status?: string }>) {
      if (row.status !== "ready" || !row.r2_key || !row.interchange_group_id) continue;
      const url = partPictureUrlFromKey(row.r2_key, "card");
      const urlDetail = partPictureUrlFromKey(row.r2_key, "detail");
      if (url && urlDetail) byGroup.set(row.interchange_group_id, { url, urlDetail });
    }
    for (const item of items) item.picture = byGroup.get(String(item.groupId ?? "")) ?? null;
    return body;
  } catch {
    return body;
  }
}

function trustLabel(raw: unknown, status?: unknown): { trust: string; reason: string | null } {
  const t = String(raw ?? "").toLowerCase();
  const st = String(status ?? "").toLowerCase();
  if (t === "confirmed" || st === "verified") {
    return { trust: "Confirmed", reason: null };
  }
  return { trust: "Needs checking", reason: null };
}

function mapMemberTrust(decision: unknown): string {
  return String(decision ?? "").toLowerCase() === "confirmed" ? "Confirmed" : "Needs checking";
}

export type FleetPartLookupQuery = {
  partId: string;
  vehicleCatalogId?: string | null;
};

export async function readFleetPartLookup(supabase: SupabaseClient, input: FleetPartLookupQuery) {
  const partId = input.partId.trim();
  if (!UUID_RE.test(partId)) {
    return { error: "Choose a part", status: 400 as const };
  }
  const { data, error } = await supabase.rpc("admin_catalog_master_part", { p_part_id: partId });
  if (error) throw error;
  const body = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  if (body.error) {
    return { error: String(body.error), status: 404 as const };
  }

  const highlightId = input.vehicleCatalogId?.trim() && UUID_RE.test(input.vehicleCatalogId)
    ? input.vehicleCatalogId.trim()
    : null;

  const rawFits = Array.isArray(body.fits) ? body.fits : [];
  // Several catalog versions share make/model/chassis/years (e.g. Demio DE5FS Sport CVT / Sport 5MT / 15C):
  // add the version so the Also fits rows can be told apart.
  const fitIds = [...new Set(rawFits.map((row) => String((row as { variantId?: unknown })?.variantId ?? "")).filter((id) => UUID_RE.test(id)))];
  const versionById = new Map<string, string>();
  if (fitIds.length) {
    const { data: versions, error: versionErr } = await supabase
      .from("vehicle_catalog")
      .select("id, trim_series")
      .in("id", fitIds);
    if (versionErr) throw versionErr;
    for (const v of (versions ?? []) as Array<{ id: string; trim_series?: string | null }>) {
      const t = String(v.trim_series ?? "").trim();
      if (t) versionById.set(String(v.id), t);
    }
  }
  const alsoFits = rawFits.map((row) => {
    const fit = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
    const link = String(fit.linkType ?? "DIRECT");
    const isSister = link === "PLATFORM TWIN";
    // Twins come from the database as Needs checking (no source for that car); never force Confirmed.
    const { trust, reason } = trustLabel(fit.trust, null);
    const trustReason = reason ?? (fit.trustReason != null ? String(fit.trustReason) : null);
    const variantId = String(fit.variantId ?? "");
    return {
      variantId,
      make: String(fit.make ?? ""),
      model: String(fit.model ?? ""),
      chassis: String(fit.chassis ?? ""),
      version: versionById.get(variantId) ?? "",
      engine: String(fit.engine ?? ""),
      years: String(fit.years ?? ""),
      trust,
      trustReason: trust === "Needs checking" ? trustReason : null,
      linkType: isSister ? "Sister" : "Direct",
      isYourCar: Boolean(highlightId && variantId === highlightId),
      evidenceUrl: fit.evidenceUrl != null ? String(fit.evidenceUrl) : null,
    };
  });

  const members = Array.isArray(body.groupMembers) ? body.groupMembers : [];
  const brandNumbers = members.map((row) => {
    const m = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
    const pid = String(m.partId ?? "");
    return {
      partId: pid,
      brand: String(m.brand ?? ""),
      number: String(m.number ?? ""),
      name: String(m.name ?? ""),
      trust: "Confirmed" as string,
    };
  });

  const primaryDecision = body.status;
  const reference = {
    partId: String(body.partId ?? ""),
    brand: String(body.brand ?? ""),
    number: String(body.number ?? ""),
    name: String(body.name ?? ""),
    partType: String(body.partType ?? ""),
    position: String(body.position ?? ""),
    trust: mapMemberTrust(primaryDecision === "verified" ? "confirmed" : "pending"),
  };

  const sources: Array<{ label: string; url: string }> = [];
  const mainUrl = body.evidenceUrl != null ? String(body.evidenceUrl).trim() : "";
  if (mainUrl) sources.push({ label: reference.brand || "Catalogue", url: mainUrl });

  const groupId = body.groupId != null ? String(body.groupId) : null;
  // §3.6: the answer's own interchange group; the other compatible numbers get no picture of their own.
  const picture = await readFleetPartPicture(supabase, groupId);

  const payload = {
    found: true,
    reference,
    brandNumbers,
    alsoFits,
    alsoFitsCount: alsoFits.length,
    sources,
    groupId,
    picture,
    wva: body.wva != null ? String(body.wva) : null,
  };

  assertNoCustomerIdentity(payload);
  return { body: payload, status: 200 as const };
}
