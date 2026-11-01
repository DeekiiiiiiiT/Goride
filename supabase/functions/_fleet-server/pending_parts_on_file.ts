import { PART_MATCH_TIERS } from "../../../packages/types/src/partsResolution.ts";

export type PendingOnFilePart = {
  brand: string;
  partNumber: string;
  matchType: string;
};

type CatalogPartRow = {
  tier?: number;
  part?: {
    id?: string;
    manufacturer?: string | null;
    oem_part_number?: string | null;
  };
};

/** Maps getCatalogParts items to Dominion drawer rows (no PII). */
export function mapPendingOnFileParts(items: CatalogPartRow[]): PendingOnFilePart[] {
  const seen = new Set<string>();
  const out: PendingOnFilePart[] = [];
  for (const item of items) {
    const part = item.part;
    const partId = String(part?.id || "");
    if (!partId || seen.has(partId)) continue;
    seen.add(partId);
    const tier = Number(item.tier ?? 1);
    const tierRow = PART_MATCH_TIERS.find((row) => row.tier === tier);
    const matchType = tierRow?.plainLabel || tierRow?.tag || "Made for your car";
    out.push({
      brand: String(part?.manufacturer || "").trim() || "—",
      partNumber: String(part?.oem_part_number || "").trim() || "—",
      matchType,
    });
  }
  return out;
}
