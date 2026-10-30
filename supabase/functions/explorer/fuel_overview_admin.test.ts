import { assertEquals } from "jsr:@std/assert";
import { Hono } from "npm:hono@4.3.11";
import { attachFuelOverviewRoute, customerKeys } from "./fuel_overview_admin.ts";

const sample = {
  generated_at: "2026-10-29T20:58:00Z",
  stations: { total: 205, verified: 57, pending: 148 },
  prices: { live: 5, review_waiting: 1 },
  benchmark: { name: "Benchmark", freshness: "current" },
  gas_cards: { programs: 1 },
};

Deno.test("fuel overview: 401 with no token and 403 for non-platform staff", async () => {
  const app = new Hono();
  attachFuelOverviewRoute(app, {
    admin: () => ({
      schema: () => ({
        rpc: () => Promise.resolve({ data: sample, error: null }),
      }),
    }) as never,
    requirePlatformAdmin: async (c) => {
      const header = c.req.header("Authorization") || "";
      if (!header.startsWith("Bearer ")) return c.json({ error: "Unauthorized" }, 401);
      if (header.includes("platform")) return { id: "staff" };
      return c.json({ error: "Forbidden" }, 403);
    },
  });

  const missing = await app.request("/admin/fuel/overview");
  assertEquals(missing.status, 401);

  const outsider = await app.request("/admin/fuel/overview", {
    headers: { Authorization: "Bearer outsider" },
  });
  assertEquals(outsider.status, 403);

  const staff = await app.request("/admin/fuel/overview", {
    headers: { Authorization: "Bearer platform" },
  });
  assertEquals(staff.status, 200);
  assertEquals(staff.headers.get("cache-control"), "private, max-age=30");
});

Deno.test("fuel overview payload has no customer fields", async () => {
  const app = new Hono();
  attachFuelOverviewRoute(app, {
    admin: () => ({
      schema: () => ({
        rpc: () => Promise.resolve({ data: sample, error: null }),
      }),
    }) as never,
    requirePlatformAdmin: async () => ({ id: "staff" }),
  });
  const res = await app.request("/admin/fuel/overview", {
    headers: { Authorization: "Bearer platform" },
  });
  const body = await res.json();
  assertEquals(customerKeys(body), []);
  assertEquals(res.status, 200);
});

Deno.test("a customer key in the overview is refused", async () => {
  const app = new Hono();
  attachFuelOverviewRoute(app, {
    admin: () => ({
      schema: () => ({
        rpc: () => Promise.resolve({ data: { ...sample, driver: "x" }, error: null }),
      }),
    }) as never,
    requirePlatformAdmin: async () => ({ id: "staff" }),
  });
  const res = await app.request("/admin/fuel/overview", {
    headers: { Authorization: "Bearer platform" },
  });
  assertEquals(res.status, 500);
  assertEquals(await res.json(), { error: "Could not load fuel overview" });
});
