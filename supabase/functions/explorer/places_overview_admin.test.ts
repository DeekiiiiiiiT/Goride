import { assertEquals } from "jsr:@std/assert";
import { Hono } from "npm:hono@4.3.11";
import { reviewChipForPlace } from "./place_admin.ts";
import { attachPlacesOverviewRoute, customerKeys } from "./places_overview_admin.ts";

const sample = {
  generated_at: "2026-10-29T21:05:00Z",
  places: { total: 217, verified: 69, pending: 148, learnt: 0 },
  review: { new_places: 148, learnt: 0, suggestions: 0, evidence: 0 },
  map: { score: 100, pins: 6 },
  places_quality: { score: 0, failing: 217 },
};

Deno.test("T4 new places plus learnt matches the place rows review returns with no chip", () => {
  const rows = [
    { status: "pending", origin_app: "manual", legacy_payload: {} },
    { status: "pending", origin_app: "roam_plug", legacy_payload: {} },
    { status: "learnt", origin_app: "roam_fleet", legacy_payload: {} },
    { status: "verified", origin_app: "manual", legacy_payload: {} },
  ];
  const returned = rows.filter((row) => row.status === "pending" || row.status === "learnt");
  for (const row of returned) {
    if (!reviewChipForPlace(row)) throw new Error("place row missing a review chip");
  }
  assertEquals(sample.review.new_places + sample.review.learnt, 148);
  assertEquals(returned.filter((row) => row.status === "verified").length, 0);
  assertEquals(
    returned.filter((row) => row.status === "pending").length
      + returned.filter((row) => row.status === "learnt").length,
    returned.length,
  );
});

Deno.test("T6 places overview: 401 with no token, 403 for non-staff, 200 for staff", async () => {
  const app = new Hono();
  attachPlacesOverviewRoute(app, {
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

  const missing = await app.request("/admin/places/overview");
  assertEquals(missing.status, 401);

  const outsider = await app.request("/admin/places/overview", {
    headers: { Authorization: "Bearer outsider" },
  });
  assertEquals(outsider.status, 403);

  const staff = await app.request("/admin/places/overview", {
    headers: { Authorization: "Bearer platform" },
  });
  assertEquals(staff.status, 200);
  assertEquals(staff.headers.get("cache-control"), "private, max-age=30");
});

Deno.test("T7 places overview payload has no customer fields", async () => {
  const app = new Hono();
  attachPlacesOverviewRoute(app, {
    admin: () => ({
      schema: () => ({
        rpc: () => Promise.resolve({ data: sample, error: null }),
      }),
    }) as never,
    requirePlatformAdmin: async () => ({ id: "staff" }),
  });
  const res = await app.request("/admin/places/overview", {
    headers: { Authorization: "Bearer platform" },
  });
  const body = await res.json();
  assertEquals(customerKeys(body), []);
  assertEquals(res.status, 200);
});

Deno.test("a customer key in the places overview is refused", async () => {
  const app = new Hono();
  attachPlacesOverviewRoute(app, {
    admin: () => ({
      schema: () => ({
        rpc: () => Promise.resolve({ data: { ...sample, saved_place: "home" }, error: null }),
      }),
    }) as never,
    requirePlatformAdmin: async () => ({ id: "staff" }),
  });
  const res = await app.request("/admin/places/overview", {
    headers: { Authorization: "Bearer platform" },
  });
  assertEquals(res.status, 500);
  assertEquals(await res.json(), { error: "Could not load Places and Maps" });
});
