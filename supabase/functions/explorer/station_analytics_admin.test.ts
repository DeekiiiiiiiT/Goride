import { assertEquals } from "jsr:@std/assert";
import { Hono } from "npm:hono@4.3.11";
import { attachStationAnalyticsRoute, parseStationAnalyticsQuery } from "./station_analytics_admin.ts";

Deno.test("station analytics query rejects a bad parish code", () => {
  const parsed = parseStationAnalyticsQuery({ pcode: "Kingston" });
  assertEquals(parsed.ok, false);
});

Deno.test("station analytics query accepts none for a missing brand", () => {
  const parsed = parseStationAnalyticsQuery({ brand: "none", grade: "e10_87" });
  if (!parsed.ok) throw new Error(parsed.error);
  assertEquals(parsed.value.unbranded, true);
  assertEquals(parsed.value.brand, null);
  assertEquals(parsed.value.grade, "e10_87");
});

Deno.test("station analytics route: staff 200, anon 401, bad parish 400", async () => {
  const app = new Hono();
  attachStationAnalyticsRoute(app, {
    admin: () => ({
      schema: () => ({
        rpc: () => Promise.resolve({ data: { meta: { week: "2026-10-22" } }, error: null }),
      }),
    }) as never,
    requirePlatformAdmin: async (c) => {
      const header = c.req.header("Authorization") || "";
      if (!header.startsWith("Bearer ")) return c.json({ error: "Unauthorized" }, 401);
      if (header.includes("anon")) return c.json({ error: "Forbidden" }, 403);
      return { id: "staff" };
    },
  });

  const anon = await app.request("/admin/analytics/stations");
  assertEquals(anon.status, 401);

  const forbidden = await app.request("/admin/analytics/stations", {
    headers: { Authorization: "Bearer anon" },
  });
  assertEquals(forbidden.status, 403);

  const bad = await app.request("/admin/analytics/stations?pcode=nope", {
    headers: { Authorization: "Bearer staff" },
  });
  assertEquals(bad.status, 400);

  const ok = await app.request("/admin/analytics/stations?grade=e10_87&week=2026-10-22", {
    headers: { Authorization: "Bearer staff" },
  });
  assertEquals(ok.status, 200);
  assertEquals(ok.headers.get("cache-control"), "private, max-age=300");
  const body = await ok.json();
  assertEquals(body.meta.week, "2026-10-22");
});
