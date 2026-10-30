import type { Hono } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

type Guard = (c: { req: { header: (name: string) => string | undefined }; json: (body: unknown, status?: number) => Response }) => Promise<{ id: string } | Response>;

const BANNED = ["organization", "driver", "vehicle", "card_number"];

export function customerKeys(value: unknown, found: string[] = []): string[] {
  if (!value || typeof value !== "object") return found;
  if (Array.isArray(value)) {
    for (const item of value) customerKeys(item, found);
    return found;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (BANNED.includes(key)) found.push(key);
    customerKeys(child, found);
  }
  return found;
}

export function attachFuelOverviewRoute(
  app: Hono,
  deps: {
    admin: () => SupabaseClient;
    requirePlatformAdmin: Guard;
  },
) {
  app.get("/admin/fuel/overview", async (c) => {
    const auth = await deps.requirePlatformAdmin(c);
    if (auth instanceof Response) return auth;

    const { data, error } = await deps.admin().schema("places").rpc("fuel_overview");
    if (error || data == null) {
      return c.json({ error: "Could not load fuel overview" }, 500);
    }
    if (customerKeys(data).length > 0) {
      return c.json({ error: "Could not load fuel overview" }, 500);
    }
    return c.json(data, 200, { "Cache-Control": "private, max-age=30" });
  });
}
