import type { Hono } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { customerKeys as fuelCustomerKeys } from "./fuel_overview_admin.ts";

type Guard = (c: { req: { header: (name: string) => string | undefined }; json: (body: unknown, status?: number) => Response }) => Promise<{ id: string } | Response>;

const EXTRA = ["user_id", "saved_place"];

function extraKeys(value: unknown, found: string[]) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) extraKeys(item, found);
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (EXTRA.includes(key) && !found.includes(key)) found.push(key);
    extraKeys(child, found);
  }
}

export function customerKeys(value: unknown): string[] {
  const found = fuelCustomerKeys(value);
  extraKeys(value, found);
  return found;
}

export function attachPlacesOverviewRoute(
  app: Hono,
  deps: {
    admin: () => SupabaseClient;
    requirePlatformAdmin: Guard;
  },
) {
  app.get("/admin/places/overview", async (c) => {
    const auth = await deps.requirePlatformAdmin(c);
    if (auth instanceof Response) return auth;

    const { data, error } = await deps.admin().schema("places").rpc("places_overview");
    if (error || data == null) {
      return c.json({ error: "Could not load Places and Maps" }, 500);
    }
    if (customerKeys(data).length > 0) {
      return c.json({ error: "Could not load Places and Maps" }, 500);
    }
    return c.json(data, 200, { "Cache-Control": "private, max-age=30" });
  });
}
