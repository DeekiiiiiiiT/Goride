import { assertEquals } from "jsr:@std/assert";
import { Hono } from "npm:hono@4.3.11";
import {
  evidenceTitle,
  parseStationListQuery,
  PLACE_EVIDENCE_COLUMNS,
  PLACE_PRICE_COLUMNS,
  placePatchFromBody,
  registerPlaceAdmin,
  reviewChipForPlace,
  summarizeStationFlags,
} from "./place_admin.ts";

Deno.test("imported pending places are not hand review", () => {
  assertEquals(reviewChipForPlace({
    status: "pending",
    origin_app: "manual",
    legacy_payload: { dataSource: "import" },
  }), "import");
  assertEquals(reviewChipForPlace({
    status: "pending",
    origin_app: "roam_plug",
    legacy_payload: {},
  }), "plug");
  assertEquals(reviewChipForPlace({ status: "learnt", origin_app: "roam_fleet" }), "learnt");
  assertEquals(reviewChipForPlace({ status: "pending", origin_app: "manual" }), "hand");
});

Deno.test("place detail asks for columns that exist", () => {
  assertEquals(PLACE_EVIDENCE_COLUMNS.includes("kind"), false);
  assertEquals(PLACE_EVIDENCE_COLUMNS.includes("note"), true);
  assertEquals(PLACE_PRICE_COLUMNS.includes("updated_at"), false);
  assertEquals(PLACE_PRICE_COLUMNS.includes("observed_at"), true);
});

Deno.test("a name-only patch leaves phone, geofence, pin and attributes untouched", () => {
  const patch = placePatchFromBody({ name: "RUBiS Half Way Tree" });
  assertEquals(patch, { name: "RUBiS Half Way Tree" });
  assertEquals("phone" in patch, false);
  assertEquals("geofence_m" in patch, false);
  assertEquals("pin_state" in patch, false);
  assertEquals("attributes" in patch, false);
});

Deno.test("an explicit empty phone clears only the phone", () => {
  const patch = placePatchFromBody({ phone: "" });
  assertEquals(patch.phone, null);
  assertEquals("name" in patch, false);
});

Deno.test("station list query rejects a bad parish code", () => {
  const parsed = parseStationListQuery({ pcode: "Kingston" });
  assertEquals(parsed.ok, false);
});

Deno.test("station flags roll up the summary strip", () => {
  const rolled = summarizeStationFlags([
    { status: "verified", brand_id: null, price_e10_87: 200, pin_state: "unchecked", possible_duplicate: true, parish_text_mismatch: true, company_style_name: false, pcode1: "JM06", parish_name: "Saint Andrew" },
    { status: "pending", brand_id: "brand-1", brand_name: "Rubis", price_e10_87: null, pin_state: "confirmed", company_style_name: true },
  ]);
  assertEquals(rolled.summary.total, 2);
  assertEquals(rolled.summary.verified, 1);
  assertEquals(rolled.summary.pending, 1);
  assertEquals(rolled.summary.priced, 1);
  assertEquals(rolled.summary.issues.duplicate, 1);
  assertEquals(rolled.summary.issues.no_brand, 1);
  assertEquals(rolled.summary.issues.not_verified, 1);
  assertEquals(rolled.parishes[0].name, "Saint Andrew");
});

function queryResult(result: Record<string, unknown>) {
  const q: Record<string, unknown> = {};
  const self = () => q;
  for (const name of ["select", "eq", "in", "or", "is", "not", "order", "ilike", "filter", "limit", "update", "insert", "delete"]) {
    q[name] = self;
  }
  q.range = () => Promise.resolve(result);
  q.maybeSingle = () => Promise.resolve(result);
  q.single = () => Promise.resolve(result);
  q.then = (resolve: (value: unknown) => unknown, reject?: (err: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
  return q;
}

Deno.test("register route: staff can read, staff cannot patch, owner can patch, bad parish is 400", async () => {
  const patches: Record<string, unknown>[] = [];
  const staffApp = new Hono();
  registerPlaceAdmin(staffApp, {
    admin: () => ({
      schema: () => ({
        from: () => queryResult({ data: [], error: null, count: 0 }),
        rpc: () => Promise.resolve({ error: null }),
      }),
      rpc: () => Promise.resolve({ data: [], error: null }),
    }) as never,
    requireOwner: async () => {
      throw new Error("Only the owner can change master data");
    },
    requirePlatformAdmin: async (c) => {
      const header = c.req.header("Authorization") || "";
      if (header.includes("staff")) return { id: "staff" };
      return c.json({ error: "Forbidden" }, 403);
    },
  });

  const staffList = await staffApp.request("/admin/register?type=gas_station", {
    headers: { Authorization: "Bearer staff" },
  });
  assertEquals(staffList.status, 200);

  const staffPatch = await staffApp.request("/admin/register/station-1", {
    method: "PATCH",
    headers: { Authorization: "Bearer staff", "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Renamed" }),
  });
  assertEquals(staffPatch.status, 403);

  const badParish = await staffApp.request("/admin/register?type=gas_station&pcode=Kingston", {
    headers: { Authorization: "Bearer staff" },
  });
  assertEquals(badParish.status, 400);

  const ownerApp = new Hono();
  registerPlaceAdmin(ownerApp, {
    admin: () => ({
      schema: () => ({
        from: () => queryResult({ data: { id: "station-1" }, error: null, count: 0 }),
        rpc: (_name: string, args: Record<string, unknown>) => {
          patches.push(args);
          return Promise.resolve({ error: null });
        },
      }),
      rpc: () => Promise.resolve({ data: [], error: null }),
    }) as never,
    requireOwner: async () => ({ id: "owner" }),
    requirePlatformAdmin: async () => ({ id: "owner" }),
  });
  const ownerPatch = await ownerApp.request("/admin/register/station-1", {
    method: "PATCH",
    headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Renamed" }),
  });
  assertEquals(ownerPatch.status, 200);
  const sent = patches.at(-1) as { p_patch: Record<string, unknown> };
  assertEquals(sent.p_patch, { name: "Renamed" });
  assertEquals("phone" in sent.p_patch, false);
  assertEquals("geofence_m" in sent.p_patch, false);
  assertEquals("pin_state" in sent.p_patch, false);
  assertEquals("attributes" in sent.p_patch, false);
});

Deno.test("evidence uses the note, or a plain title", () => {
  assertEquals(evidenceTitle("Photo of the pump"), "Photo of the pump");
  assertEquals(evidenceTitle("  "), "Evidence");
  assertEquals(evidenceTitle(null), "Evidence");
});
