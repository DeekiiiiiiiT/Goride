/**
 * Body types + seating capacity from Commando motor vehicle catalog (public.vehicle_catalog).
 */
import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireProductAdmin } from "../../_shared/productAdmin.ts";

/** Fallback when catalog is empty or unreadable — matches Commando Body tab picklist. */
const COMMANDO_BODY_TYPE_FALLBACK: readonly string[] = [
  "Sedan",
  "Coupe",
  "Hatchback",
  "Station Wagon",
  "SUV",
  "Pick up",
  "Bus",
  "Truck",
  "Heavy Equipment",
  "Mini Van",
  "Van",
  "Wagon",
  "Convertible",
];

export type CommandoBodyTypeFacet = {
  body_type: string;
  /** Max seating_capacity in catalog for this body type (passenger count). */
  seating_capacity: number | null;
};

const FACET_PAGE = 500;
const FACET_MAX_OFFSET = 20000;

function catalogClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

async function facetsFromCatalog(): Promise<CommandoBodyTypeFacet[]> {
  const supabase = catalogClient();
  const bodies = new Set<string>();
  const maxSeatsByBody = new Map<string, number>();
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("vehicle_catalog")
      .select("body_type, seating_capacity")
      .range(from, from + FACET_PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;

    for (const row of data) {
      const body = String((row as { body_type?: unknown }).body_type ?? "").trim();
      if (!body) continue;
      bodies.add(body);
      const seatsRaw = (row as { seating_capacity?: unknown }).seating_capacity;
      const seats = typeof seatsRaw === "number"
        ? seatsRaw
        : typeof seatsRaw === "string"
        ? parseInt(seatsRaw, 10)
        : NaN;
      if (Number.isFinite(seats) && seats > 0) {
        const prev = maxSeatsByBody.get(body);
        if (prev === undefined || seats > prev) maxSeatsByBody.set(body, Math.round(seats));
      }
    }

    if (data.length < FACET_PAGE) break;
    from += FACET_PAGE;
    if (from > FACET_MAX_OFFSET) break;
  }

  return Array.from(bodies)
    .map((body_type) => ({
      body_type,
      seating_capacity: maxSeatsByBody.get(body_type) ?? null,
    }))
    .sort((a, b) => a.body_type.localeCompare(b.body_type, undefined, { sensitivity: "base" }));
}

function mergeFacets(
  catalogFacets: CommandoBodyTypeFacet[],
): CommandoBodyTypeFacet[] {
  const byBody = new Map<string, CommandoBodyTypeFacet>();
  for (const body of COMMANDO_BODY_TYPE_FALLBACK) {
    byBody.set(body, { body_type: body, seating_capacity: null });
  }
  for (const f of catalogFacets) {
    const existing = byBody.get(f.body_type);
    if (!existing) {
      byBody.set(f.body_type, f);
      continue;
    }
    if (f.seating_capacity != null) {
      const prev = existing.seating_capacity;
      existing.seating_capacity = prev == null
        ? f.seating_capacity
        : Math.max(prev, f.seating_capacity);
    }
  }
  return Array.from(byBody.values()).sort((a, b) =>
    a.body_type.localeCompare(b.body_type, undefined, { sensitivity: "base" })
  );
}

export function registerCommandoBodyTypeRoutes(admin: Hono) {
  admin.get("/commando/body-types", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;

    let catalogFacets: CommandoBodyTypeFacet[] = [];
    let catalogError: string | null = null;

    try {
      catalogFacets = await facetsFromCatalog();
    } catch (e) {
      catalogError = e instanceof Error ? e.message : String(e);
    }

    const facets = mergeFacets(catalogFacets);
    const body_types = facets.map((f) => f.body_type);
    const fromCatalog = catalogFacets.length > 0;

    return c.json({
      body_types,
      facets,
      source: fromCatalog ? "catalog" : "fallback",
      catalog_count: catalogFacets.length,
      ...(catalogError && !fromCatalog ? { catalog_warning: catalogError } : {}),
    });
  });
}
