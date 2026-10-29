import type { Hono } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const GRADES = new Set(["e10_87", "e10_90", "diesel", "ulsd"]);
const WEEK = /^\d{4}-\d{2}-\d{2}$/;
const PCODE = /^JM\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type StationAnalyticsQuery = {
  grade: string;
  week: string | null;
  pcode: string | null;
  brand: string | null;
  unbranded: boolean;
};

export function parseStationAnalyticsQuery(input: {
  grade?: string | null;
  week?: string | null;
  pcode?: string | null;
  brand?: string | null;
}): { ok: true; value: StationAnalyticsQuery } | { ok: false; error: string } {
  const grade = (input.grade || "e10_87").trim();
  if (!GRADES.has(grade)) return { ok: false, error: "Unknown grade" };

  const weekRaw = (input.week || "").trim();
  if (weekRaw && !WEEK.test(weekRaw)) return { ok: false, error: "Week must be YYYY-MM-DD" };

  const pcodeRaw = (input.pcode || "").trim();
  if (pcodeRaw && !PCODE.test(pcodeRaw)) return { ok: false, error: "Parish code must look like JM01" };

  const brandRaw = (input.brand || "").trim();
  if (brandRaw && brandRaw !== "none" && !UUID.test(brandRaw)) {
    return { ok: false, error: "Brand must be a UUID or none" };
  }

  return {
    ok: true,
    value: {
      grade,
      week: weekRaw || null,
      pcode: pcodeRaw || null,
      brand: brandRaw && brandRaw !== "none" ? brandRaw : null,
      unbranded: brandRaw === "none",
    },
  };
}

type Guard = (c: { req: { header: (name: string) => string | undefined }; json: (body: unknown, status?: number) => Response }) => Promise<{ id: string } | Response>;

export function attachStationAnalyticsRoute(
  app: Hono,
  deps: {
    admin: () => SupabaseClient;
    requirePlatformAdmin: Guard;
  },
) {
  app.get("/admin/analytics/stations", async (c) => {
    const auth = await deps.requirePlatformAdmin(c);
    if (auth instanceof Response) return auth;

    const parsed = parseStationAnalyticsQuery({
      grade: c.req.query("grade"),
      week: c.req.query("week"),
      pcode: c.req.query("pcode"),
      brand: c.req.query("brand"),
    });
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);

    const { grade, week, pcode, brand, unbranded } = parsed.value;
    const { data, error } = await deps.admin().schema("places").rpc("station_analytics", {
      p_grade: grade,
      p_week: week,
      p_pcode: pcode,
      p_brand: brand,
      p_unbranded: unbranded,
    });
    if (error) return c.json({ error: error.message || "Could not load station analytics" }, 400);

    return c.json(data ?? {}, 200, { "Cache-Control": "private, max-age=300" });
  });
}
