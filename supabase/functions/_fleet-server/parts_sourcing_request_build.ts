/**
 * Build parts_sourcing_requests insert rows (B1 catalog vs platform).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { PART_MATCH_TIERS } from "../../../packages/types/src/partsResolution.ts";
import { formatPartsFitParam, resolvePartsFitPairs } from "../../../packages/types/src/partsFitParam.ts";

const MATCH_TAGS = new Set(PART_MATCH_TIERS.map((row) => row.tag));

export function normalizeMatchType(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  if (MATCH_TAGS.has(value)) return value;
  const byLabel = PART_MATCH_TIERS.find(
    (row) => row.plainLabel.toLowerCase() === value.toLowerCase() || row.tag.toLowerCase() === value.toLowerCase(),
  );
  return byLabel?.tag ?? value.slice(0, 40);
}

export async function resolveCatalogAndPlatform(
  supabase: SupabaseClient,
  vehicleCatalogId: string | null,
): Promise<{ vehicle_catalog_id: string | null; platform_id: string | null }> {
  if (!vehicleCatalogId) return { vehicle_catalog_id: null, platform_id: null };
  const { data, error } = await supabase
    .from("vehicle_catalog")
    .select("id, platform_id")
    .eq("id", vehicleCatalogId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) return { vehicle_catalog_id: null, platform_id: null };
  return {
    vehicle_catalog_id: String(data.id),
    platform_id: data.platform_id ? String(data.platform_id) : null,
  };
}

export function fitDescriptorFromBody(body: Record<string, unknown>): {
  fitDescriptor: string | null;
  install_position: string | null;
  install_side: string | null;
} {
  const fitRaw = body.fit ? String(body.fit) : (body.fitDescriptor ? String(body.fitDescriptor) : "");
  const pairs = resolvePartsFitPairs({
    fit: fitRaw || null,
    position: body.position ? String(body.position) : null,
    side: body.side ? String(body.side) : null,
  });
  const fitDescriptor = fitRaw.trim() || (pairs.length ? formatPartsFitParam(pairs) : null);
  const primary = pairs[0];
  return {
    fitDescriptor: fitDescriptor ? fitDescriptor.slice(0, 120) : null,
    install_position: primary?.axle ?? (body.position ? String(body.position).slice(0, 20) : null),
    install_side: primary?.side ?? (body.side ? String(body.side).slice(0, 20) : null),
  };
}

export async function buildPartsSourcingInsert(
  supabase: SupabaseClient,
  input: {
    orgId: string;
    vehicleId: string | null;
    needText: string;
    componentId: string | null;
    engineFamilyId: string | null;
    vehicleCatalogId: string | null;
    matchType: string | null;
    fit: Record<string, unknown>;
    kind: string | null;
    urgency: string | null;
    qty: number | null;
    userId: string | null;
    photoUrl: string | null;
    sentAt: string | null;
    replyDueAt: string | null;
    oldPartNumber?: string | null;
  },
) {
  const { vehicle_catalog_id, platform_id } = await resolveCatalogAndPlatform(supabase, input.vehicleCatalogId);
  const fitFields = fitDescriptorFromBody(input.fit);
  return {
    organization_id: input.orgId,
    vehicle_id: input.vehicleId,
    need_text: input.needText.slice(0, 2000),
    status: "open",
    created_by: input.userId,
    maintenance_component_id: input.componentId,
    vehicle_catalog_id,
    platform_id,
    engine_family_id: input.engineFamilyId,
    urgency: input.urgency,
    reply_due_at: input.replyDueAt,
    kind: input.kind,
    qty: input.qty,
    photo_url: input.photoUrl,
    install_side: fitFields.install_side,
    install_position: fitFields.install_position,
    fit_descriptor: fitFields.fitDescriptor,
    match_type: input.matchType,
    sent_at: input.sentAt,
    old_part_number: input.oldPartNumber
      ? String(input.oldPartNumber).replace(/[^A-Za-z0-9-]/g, "").slice(0, 80)
      : null,
  };
}
