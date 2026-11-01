/**
 * Side / axle hints for FP4 from catalog listings (no PII).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { getCatalogParts } from "./catalog_api.ts";

export type ComponentFitHints = {
  hasSideSpecificListings: boolean;
  countsByPosition: { front: number; rear: number };
};

export async function readComponentFitHints(
  supabase: SupabaseClient,
  variantId: string,
  componentId: string,
): Promise<ComponentFitHints> {
  const parts = await getCatalogParts(supabase, variantId, { componentId });
  const items = (parts.items || []) as Array<{ position?: string | null; side?: string | null }>;
  const countsByPosition = { front: 0, rear: 0 };
  let hasSideSpecificListings = false;
  for (const item of items) {
    const pos = String(item.position ?? "").toLowerCase();
    if (pos === "front") countsByPosition.front += 1;
    if (pos === "rear") countsByPosition.rear += 1;
    const side = String(item.side ?? "").toLowerCase();
    if (side === "left" || side === "right") hasSideSpecificListings = true;
  }
  return { hasSideSpecificListings, countsByPosition };
}
