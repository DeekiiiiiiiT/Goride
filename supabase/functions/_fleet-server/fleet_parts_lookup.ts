/**
 * Fleet-safe part detail (RB-10) from admin_catalog_master_part.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { assertNoCustomerIdentity } from "./catalog_parts_shape.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  const payload = {
    found: true,
    reference,
    brandNumbers,
    alsoFits,
    alsoFitsCount: alsoFits.length,
    sources,
    groupId: body.groupId != null ? String(body.groupId) : null,
    wva: body.wva != null ? String(body.wva) : null,
  };

  assertNoCustomerIdentity(payload);
  return { body: payload, status: 200 as const };
}
