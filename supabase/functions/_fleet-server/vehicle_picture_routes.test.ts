/**
 * deno test --no-check --allow-env --allow-read vehicle_picture_routes.test.ts
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import { Hono } from "npm:hono";
import { normalizeFleetCorePathname } from "../_shared/edgeKernel.ts";
import { requireAuth } from "./rbac_middleware.ts";
import { loadLatestDocumentChecks, registerVehiclePictureRoutes } from "./vehicle_picture_routes.ts";
import { createVehiclePictureDb } from "./vehicle_picture_db.ts";
import { ROW_CLAIM_LEASE_MS, vehicleLookFromPictureRow } from "./vehicle_picture_worker.ts";
import { buildPicturePrompt } from "../_shared/vehiclePictures/prompt.ts";
import { readPicturesForVehiclesBatch, type PictureLookupDeps } from "./vehicle_picture_lookup.ts";
import {
  createMemoryVehiclePictureDb,
  defaultSettings,
  defaultTestCatalog,
  seedReadyLook,
} from "./vehicle_picture_test_harness.ts";
import { buildLook } from "../_shared/vehiclePictures/lookKey.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const EXPECTED_ROUTES = [
  "POST /make-server-37f42386/internal/vehicle-pictures/run",
  "POST /make-server-37f42386/internal/vehicle-pictures/fill",
  "GET /make-server-37f42386/vehicles/:id/picture",
  "GET /make-server-37f42386/vehicles/:id/document-checks",
  "POST /make-server-37f42386/vehicles/:id/color",
] as const;

Deno.test("normalizeFleetCorePathname maps vehicle-pictures worker path", () => {
  assertEquals(
    normalizeFleetCorePathname("/fleet-core/internal/vehicle-pictures/run"),
    "/make-server-37f42386/internal/vehicle-pictures/run",
  );
});

Deno.test("registerVehiclePictureRoutes registers exactly four paths", () => {
  const registered: string[] = [];
  const fakeApp = {
    post(path: string, ..._handlers: unknown[]) {
      registered.push(`POST ${path}`);
    },
    get(path: string, ..._handlers: unknown[]) {
      registered.push(`GET ${path}`);
    },
  } as unknown as Hono;
  const fakeSupabase = { from: () => ({}) } as unknown as SupabaseClient;
  registerVehiclePictureRoutes(fakeApp, fakeSupabase);
  assertEquals([...registered].sort(), [...EXPECTED_ROUTES].sort());
});

Deno.test("requireAuth skip lets internal vehicle-pictures run through without user token", async () => {
  const app = new Hono();
  app.use("*", requireAuth({ strict: true }));
  app.post("/make-server-37f42386/internal/vehicle-pictures/run", (c) => c.json({ reached: true }));
  const res = await app.request("/make-server-37f42386/internal/vehicle-pictures/run", { method: "POST" });
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { reached: true });
});

Deno.test("getCatalogRow uses production_start_year aliases", async () => {
  let selectArg = "";
  const fake = {
    from(table: string) {
      assertEquals(table, "vehicle_catalog");
      return {
        select(sel: string) {
          selectArg = sel;
          return {
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          };
        },
      };
    },
  } as unknown as SupabaseClient;
  const db = createVehiclePictureDb(fake);
  await db.getCatalogRow("x");
  assert(selectArg.includes("production_start_year"), selectArg);
  assert(selectArg.includes("production_end_year"), selectArg);
});

Deno.test("pre_facelift row prompt contains pre-facelift styling", () => {
  const look = vehicleLookFromPictureRow({
    id: "p1",
    look_key: "toyota|roomy|1st gen|hatchback|pre_facelift|white",
    make: "toyota",
    model: "roomy",
    generation: "1st gen",
    body_type: "hatchback",
    facelift_stage: "pre_facelift",
    start_year: 2016,
    end_year: 2020,
    color: "white",
    example_catalog_id: null,
    status: "queued",
    lane: "live",
    r2_key: null,
    version: 1,
    source: "ai",
    provider: null,
    ai_model: null,
    prompt: null,
    prompt_version: null,
    cost_usd: null,
    attempts: 0,
    next_attempt_at: null,
    lease_until: null,
    last_error: null,
    staff_rating: null,
    made_at: null,
    made_by: null,
    deleted_at: null,
    queued_by_org: "org",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  const prompt = buildPicturePrompt(look);
  assert(prompt.includes("pre-facelift styling"));
});

Deno.test("claim sets lease_until about now + 3 minutes", async () => {
  const mem = createMemoryVehiclePictureDb();
  const look = buildLook(defaultTestCatalog(), "white");
  if ("error" in look) throw new Error("bad look");
  await mem.db.insertQueuedPicture(look, "org-w", "cat-1");
  const fixedNow = new Date("2026-01-15T12:00:00.000Z");
  const leaseIso = new Date(fixedNow.getTime() + ROW_CLAIM_LEASE_MS).toISOString();
  const claimed = await mem.db.claimQueuedRows("live", 1, leaseIso);
  assertEquals(claimed.length, 1);
  const leaseMs = Date.parse(claimed[0].lease_until!) - fixedNow.getTime();
  assert(Math.abs(leaseMs - ROW_CLAIM_LEASE_MS) < 2000, `lease was ${leaseMs}ms`);
});

Deno.test("batch enrichment uses at most 8 db ops for 50 vehicles", async () => {
  const mem = createMemoryVehiclePictureDb();
  const catalog = defaultTestCatalog("cat-batch");
  mem.catalogs.set("cat-batch", catalog);
  const look = buildLook(catalog, "white");
  if ("error" in look) throw new Error("bad look");
  seedReadyLook(mem.pictures, look, "org-b");

  const vehicles = Array.from({ length: 50 }, (_, i) => ({
    vehicleId: `v${i}`,
    organizationId: "org-b",
    vehicleCatalogId: "cat-batch",
    colorStandard: "white",
    pictureId: null as string | null,
  }));

  let dbOps = 0;
  const wrap = <T extends (...args: never[]) => unknown>(fn: T): T => {
    return ((...args: Parameters<T>) => {
      dbOps++;
      return fn(...args);
    }) as T;
  };

  const raw = mem.db;
  const db = {
    ...raw,
    getCatalogRowsIn: wrap(raw.getCatalogRowsIn.bind(raw)),
    getPicturesByIdsIn: wrap(raw.getPicturesByIdsIn.bind(raw)),
    getLivePicturesByLookKeysIn: wrap(raw.getLivePicturesByLookKeysIn.bind(raw)),
    countOrgQueuedToday: wrap(raw.countOrgQueuedToday.bind(raw)),
    getCatalogRow: wrap(raw.getCatalogRow.bind(raw)),
    getPictureById: wrap(raw.getPictureById.bind(raw)),
    getLivePictureByLookKey: wrap(raw.getLivePictureByLookKey.bind(raw)),
  };

  const deps: PictureLookupDeps = {
    now: () => new Date(),
    loadSettings: async () => defaultSettings(),
    db,
    kickWorker: async () => {},
    geminiBudgetBlocked: async () => false,
  };

  await readPicturesForVehiclesBatch(deps, vehicles);
  assert(dbOps <= 8, `db ops was ${dbOps}`);
});
Deno.test("document checks: newest per type, names resolved, no file or fields returned", async () => {
  const rows = [
    { doc_type: "registration", issue_date: "2026-10-01", expiry_date: "2027-09-30", read_at: "2026-11-16T10:00:00Z", read_by: "u1" },
    { doc_type: "fitness", issue_date: "2025-08-25", expiry_date: "2028-08-24", read_at: "2026-11-16T09:00:00Z", read_by: "u1" },
    { doc_type: "fitness", issue_date: "2024-08-25", expiry_date: "2025-08-24", read_at: "2025-08-25T09:00:00Z", read_by: "u2" },
  ];
  let selected = "";
  // No `schema()` on the fake: production does not expose the fleet schema (use the public view).
  const fake = {
    from: (table: string) => {
      assertEquals(table, "fleet_vehicle_document_check");
      const q = {
        select: (s: string) => {
          selected = s;
          return q;
        },
        eq: () => q,
        order: () => q,
        limit: () => Promise.resolve({ data: rows, error: null }),
      };
      return q;
    },
    auth: { admin: { getUserById: (id: string) => Promise.resolve({ data: { user: { user_metadata: { full_name: id === "u1" ? "Deeki T" : "Other" } } } }) } },
  };
  const out = await loadLatestDocumentChecks(fake as never, "5179KZ", "org-1");
  assertEquals(out.map((c) => c.docType), ["fitness", "registration"]);
  assertEquals(out[0].expiryDate, "2028-08-24");
  assertEquals(out[0].readByName, "Deeki T");
  assertEquals(selected.includes("fields_json"), false);
  assertEquals(selected.includes("file_sha256"), false);
});
