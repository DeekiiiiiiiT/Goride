/**
 * Side / axle hints for FP4 from catalog listings (no PII).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { getCatalogParts } from "./catalog_api.ts";

export type ComponentFitHints = {
  hasSideSpecificListings: boolean;
  countsByPosition: { front: number; rear: number };
  labelsByPosition: { front?: string; rear?: string };
};

function partDisplayName(item: { part?: Record<string, unknown> }): string {
  const part = item.part || {};
  const name = String(part.name ?? part.part_name ?? "").trim();
  return name;
}

function pickStableLabel(names: string[]): string | undefined {
  const counts = new Map<string, number>();
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  if (!counts.size) return undefined;
  let best = "";
  let bestCount = -1;
  for (const [name, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      best = name;
    }
  }
  return best || undefined;
}

export async function readComponentFitHints(
  supabase: SupabaseClient,
  variantId: string,
  componentId: string,
): Promise<ComponentFitHints> {
  const parts = await getCatalogParts(supabase, variantId, { componentId });
  const items = (parts.items || []) as Array<{ position?: string | null; side?: string | null; part?: Record<string, unknown> }>;
  const countsByPosition = { front: 0, rear: 0 };
  const namesByPosition: { front: string[]; rear: string[] } = { front: [], rear: [] };
  let hasSideSpecificListings = false;
  for (const item of items) {
    const pos = String(item.position ?? "").toLowerCase();
    const label = partDisplayName(item);
    if (pos === "front") {
      countsByPosition.front += 1;
      if (label) namesByPosition.front.push(label);
    }
    if (pos === "rear") {
      countsByPosition.rear += 1;
      if (label) namesByPosition.rear.push(label);
    }
    const side = String(item.side ?? "").toLowerCase();
    if (side === "left" || side === "right") hasSideSpecificListings = true;
  }
  return {
    hasSideSpecificListings,
    countsByPosition,
    labelsByPosition: {
      front: pickStableLabel(namesByPosition.front),
      rear: pickStableLabel(namesByPosition.rear),
    },
  };
}
