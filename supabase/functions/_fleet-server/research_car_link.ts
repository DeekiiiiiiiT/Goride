/**
 * NR-01 (docs/needs-review-browser-check-audit.md): Roam builds the car maker's catalogue link from the car itself,
 * so an unproven answer always gets a Browser check instead of a one-click "Looks right" in Needs review.
 *
 * Order:
 *   1. the catalogue version the owner already confirmed for this car (research_car_site_version), cut back to the
 *      frame's version list (RE-60);
 *   2. else Amayama's search for a number Roam found under the car maker's own brand, when Amayama is trusted as a
 *      catalogue for that car maker;
 *   3. else none.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { versionListLink } from "./research_browser_check.ts";

export const AMAYAMA_DOMAIN = "amayama.com";

export type CarLinkInput = {
  knownVersionUrls: Array<string | null | undefined>;
  carMakerNumbers: Array<string | null | undefined>;
  amayamaForMake: boolean;
};

export function pickCarCatalogueLink(input: CarLinkInput): string | null {
  for (const raw of input.knownVersionUrls) {
    const url = String(raw ?? "").trim();
    if (url.startsWith("https://")) return versionListLink(url);
  }
  if (input.amayamaForMake) {
    const n = input.carMakerNumbers.map((x) => String(x ?? "").trim()).find((x) => x.length >= 4);
    if (n) return `https://www.amayama.com/en/search?q=${encodeURIComponent(n)}`;
  }
  return null;
}

/** Loads what pickCarCatalogueLink needs for one car. Never throws: no link is a normal answer. */
export async function findCarCatalogueLink(
  supabase: SupabaseClient,
  input: { vehicleId: string | null | undefined; carMake: string | null | undefined; carMakerNumbers?: string[] },
): Promise<string | null> {
  if (!input.vehicleId) return null;
  const make = String(input.carMake ?? "").trim().toLowerCase();
  try {
    const [{ data: versions }, { data: amayama }] = await Promise.all([
      supabase.from("research_car_site_version").select("version_url, confirmed_at")
        .eq("vehicle_catalog_id", input.vehicleId).order("confirmed_at", { ascending: false }).limit(5),
      make
        ? supabase.from("trusted_source").select("domain").eq("domain", AMAYAMA_DOMAIN).eq("kind", "car_maker")
          .eq("maker_norm", make).limit(1)
        : Promise.resolve({ data: [] }),
    ]);
    return pickCarCatalogueLink({
      knownVersionUrls: ((versions ?? []) as Array<{ version_url: string | null }>).map((v) => v.version_url),
      carMakerNumbers: input.carMakerNumbers ?? [],
      amayamaForMake: ((amayama ?? []) as unknown[]).length > 0,
    });
  } catch {
    return null;
  }
}

/**
 * Step 3 of a Browser check: the car maker's own name for the part ("Hub & bearing assy, rear axle"), so the guide says
 * what to search in that maker's catalogue instead of Roam's own name ("Wheel bearing").
 * Order: a name the owner already confirmed for this part type on a car of the same make, else Roam's guess on this job
 * under the car maker's brand. Text in brackets is dropped ("(Rear RH / Rear LH)").
 */
export function pickMakerPartName(input: {
  make: string | null | undefined;
  confirmed: Array<{ brand?: string | null; part_name?: string | null }>;
  guesses: Array<{ brand?: string | null; part_name?: string | null }>;
}): string | null {
  const make = String(input.make ?? "").trim().toLowerCase();
  if (!make) return null;
  const clean = (s: unknown) => String(s ?? "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  for (const list of [input.confirmed, input.guesses]) {
    const hit = list.find((p) => String(p.brand ?? "").trim().toLowerCase() === make && clean(p.part_name).length >= 3);
    if (hit) return clean(hit.part_name);
  }
  return null;
}

/** Loads the names pickMakerPartName needs. Never throws. */
export async function findMakerPartName(
  supabase: SupabaseClient,
  input: {
    make: string | null | undefined;
    componentId: string | null | undefined;
    guesses: Array<{ brand?: string | null; part_name?: string | null }>;
  },
): Promise<string | null> {
  let confirmed: Array<{ brand?: string | null; part_name?: string | null }> = [];
  const make = String(input.make ?? "").trim();
  if (make && input.componentId) {
    try {
      const { data: jobs } = await supabase.from("catalog_research_job").select("id")
        .eq("maintenance_component_id", input.componentId).eq("state", "added")
        .order("updated_at", { ascending: false }).limit(50);
      const ids = ((jobs ?? []) as Array<{ id: string }>).map((j) => j.id);
      if (ids.length) {
        const { data } = await supabase.from("catalog_part_proposal").select("brand, part_name")
          .in("job_id", ids).eq("status", "promoted").ilike("brand", make).not("part_name", "is", null).limit(20);
        confirmed = (data ?? []) as typeof confirmed;
      }
    } catch {
      confirmed = [];
    }
  }
  return pickMakerPartName({ make, confirmed, guesses: input.guesses });
}
