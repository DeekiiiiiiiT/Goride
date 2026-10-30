import { assertEquals } from "jsr:@std/assert";
import { Hono } from "npm:hono@4.3.11";
import {
  TYPE_PROFILE_CONFLICT,
  csvField,
  evidenceTitle,
  matchProfileConflict,
  parseStationListQuery,
  pinOutsideMessage,
  PLACE_EVIDENCE_COLUMNS,
  PLACE_PRICE_COLUMNS,
  placePatchFromBody,
  registerHttpStatus,
  registerPlaceAdmin,
  reviewChipForPlace,
  staticMissing,
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

Deno.test("T7 verify with an unchecked pin is missing Pin checked", () => {
  const missing = staticMissing({
    name: "Angels",
    place_type: "toll_plaza",
    lat: 18.01,
    lng: -76.95,
    pin_state: "unchecked",
  });
  assertEquals(missing.includes("Pin checked"), true);
  assertEquals(missing.includes("Pin"), false);
});

Deno.test("T8 a pin at 0,0 is outside Jamaica", () => {
  assertEquals(pinOutsideMessage(0, 0), "Pin outside Jamaica");
  assertEquals(pinOutsideMessage("", ""), "Pin outside Jamaica");
  assertEquals(registerHttpStatus("Pin outside Jamaica"), 400);
  assertEquals(registerHttpStatus("Place not found"), 404);
  assertEquals(registerHttpStatus(TYPE_PROFILE_CONFLICT), 409);
});

Deno.test("T2 bulk type across match profiles is refused", () => {
  assertEquals(matchProfileConflict("fuel", "none"), TYPE_PROFILE_CONFLICT);
  assertEquals(matchProfileConflict("fuel", "fuel"), null);
  assertEquals(matchProfileConflict("toll", "none"), TYPE_PROFILE_CONFLICT);
});

Deno.test("T4 and T5 empty pins and quoted csv", () => {
  assertEquals(pinOutsideMessage(null, -76.8), "Pin outside Jamaica");
  assertEquals(csvField("6 Old Hope Rd, Kingston"), '"6 Old Hope Rd, Kingston"');
  assertEquals(csvField("Angels"), "Angels");
});

Deno.test("evidence uses the note, or a plain title", () => {
  assertEquals(evidenceTitle("Photo of the pump"), "Photo of the pump");
  assertEquals(evidenceTitle("  "), "Evidence");
  assertEquals(evidenceTitle(null), "Evidence");
});

Deno.test("T8 match_profile is ignored on a taxonomy patch", async () => {
  const { stripTaxonomyPatch, taxonomyKeyOk, registerTaxonomyRoutes } = await import("./taxonomy_admin.ts");
  assertEquals(stripTaxonomyPatch({ label: "Beach", match_profile: "fuel", reason: "because" }), { label: "Beach" });
  assertEquals(taxonomyKeyOk("place_type", "Beach"), false);
  assertEquals(taxonomyKeyOk("place_type", "beach"), true);
  assertEquals(taxonomyKeyOk("category", "2.2"), true);

  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const app = new Hono();
  registerTaxonomyRoutes(app, {
    admin: () => ({
      schema: () => ({
        rpc: (name: string, args: Record<string, unknown>) => {
          calls.push({ name, args });
          return Promise.resolve({ data: { ok: true }, error: null });
        },
      }),
    }) as never,
    requireOwner: async () => ({ id: "owner-1" }),
    requirePlatformAdmin: async () => ({ id: "owner-1", email: "", role: "platform_owner" }),
  });
  const res = await app.request("/admin/taxonomy/place_type/beach", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ label: "Beach", match_profile: "fuel", reason: "renamed the unused type" }),
  });
  assertEquals(res.status, 200);
  assertEquals(calls[0].name, "save_taxonomy");
  assertEquals((calls[0].args.p_patch as Record<string, unknown>).match_profile, undefined);
  assertEquals((calls[0].args.p_patch as Record<string, unknown>).label, "Beach");
});

Deno.test("T7 taxonomy writes use 403, 400 and 409", async () => {
  const { registerTaxonomyRoutes } = await import("./taxonomy_admin.ts");
  const refused = new Hono();
  registerTaxonomyRoutes(refused, {
    admin: () => { throw new Error("should not query"); },
    requireOwner: async () => { throw new Error("Only the owner can review places"); },
    requirePlatformAdmin: async () => ({ id: "staff", email: "", role: "platform_analyst" }),
  });
  const post = await refused.request("/admin/taxonomy/place_type", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ slug: "beach", label: "Beach", reason: "a long enough reason" }),
  });
  assertEquals(post.status, 403);
  const patch = await refused.request("/admin/taxonomy/place_type/beach", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ retire: true, reason: "a long enough reason" }),
  });
  assertEquals(patch.status, 403);

  const bad = new Hono();
  registerTaxonomyRoutes(bad, {
    admin: () => { throw new Error("should not query"); },
    requireOwner: async () => ({ id: "owner-1" }),
    requirePlatformAdmin: async () => ({ id: "owner-1", email: "", role: "platform_owner" }),
  });
  const slug = await bad.request("/admin/taxonomy/place_type", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ slug: "Beach", label: "Beach", reason: "a long enough reason" }),
  });
  assertEquals(slug.status, 400);

  const blocked = new Hono();
  registerTaxonomyRoutes(blocked, {
    admin: () => ({
      schema: () => ({
        rpc: () => Promise.resolve({
          data: null,
          error: Object.assign(new Error("in_use"), {
            details: JSON.stringify({ places: 205, plug_chip: true, search_as: 0, children: 0, facilities: 0, default_facilities: 0 }),
          }),
        }),
      }),
    }) as never,
    requireOwner: async () => ({ id: "owner-1" }),
    requirePlatformAdmin: async () => ({ id: "owner-1", email: "", role: "platform_owner" }),
  });
  const retire = await blocked.request("/admin/taxonomy/place_type/gas_station", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ retire: true, reason: "trying to retire gas station" }),
  });
  assertEquals(retire.status, 409);
  const body = await retire.json();
  assertEquals(body.blocked_by.places, 205);
  assertEquals(body.blocked_by.plug_chip, true);
});

Deno.test("T9 the public taxonomy function is not replaced", async () => {
  const sql = await Deno.readTextFile(new URL("../../migrations/20261029235000_places_taxonomy_admin.sql", import.meta.url));
  assertEquals(/create or replace function places\.taxonomy\s*\(/i.test(sql), false);
  const current = await Deno.readTextFile(new URL("../../migrations/20261028191804_places_plug_chips.sql", import.meta.url));
  assertEquals(/where t\.active and t\.plug_chip is not null/.test(current), true);
});

