/**
 * Distinct body types from Commando motor vehicle catalog (public.vehicle_catalog).
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

const FACET_PAGE = 500;
const FACET_MAX_OFFSET = 20000;

function catalogClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

async function distinctBodyTypesFromCatalog(): Promise<string[]> {
  const supabase = catalogClient();
  const bodies = new Set<string>();
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("vehicle_catalog")
      .select("body_type")
      .range(from, from + FACET_PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;

    for (const row of data) {
      const b = String((row as { body_type?: unknown }).body_type ?? "").trim();
      if (b.length >= 1) bodies.add(b);
    }

    if (data.length < FACET_PAGE) break;
    from += FACET_PAGE;
    if (from > FACET_MAX_OFFSET) break;
  }

  return Array.from(bodies).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export function registerCommandoBodyTypeRoutes(admin: Hono) {
  admin.get("/commando/body-types", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;

    let fromCatalog: string[] = [];
    let catalogError: string | null = null;

    try {
      fromCatalog = await distinctBodyTypesFromCatalog();
    } catch (e) {
      catalogError = e instanceof Error ? e.message : String(e);
    }

    const merged = new Set<string>([...COMMANDO_BODY_TYPE_FALLBACK, ...fromCatalog]);
    const body_types = Array.from(merged).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );

    return c.json({
      body_types,
      source: fromCatalog.length > 0 ? "catalog" : "fallback",
      catalog_count: fromCatalog.length,
      ...(catalogError && fromCatalog.length === 0 ? { catalog_warning: catalogError } : {}),
    });
  });
}
