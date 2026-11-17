/**
 * deno test --no-check --allow-env --allow-read vehicle_picture_admin_routes.test.ts
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { buildLook } from "../_shared/vehiclePictures/lookKey.ts";
import { PROMPT_VERSION } from "../_shared/vehiclePictures/prompt.ts";
import { registerVehiclePictureRoutes } from "./vehicle_picture_routes.ts";
import { runPictureLookupAfterCatalogLink } from "./vehicle_picture_catalog_hook.ts";
import {
  dominionPictureJsonLeak,
  registerVehiclePictureAdminRoutes,
  setVehiclePictureAdminAuditForTests,
  setVehiclePictureAdminDbForTests,
  setVehiclePictureAdminSettingsForTests,
  setVehiclePictureKickWorkerForTests,
  setVehiclePictureRegenLimitForTests,
  setVehiclePictureSpendForTests,
} from "./vehicle_picture_admin_routes.ts";
import {
  createMemoryVehiclePictureDb,
  createSettingsStore,
  defaultTestCatalog,
  seedReadyLook,
} from "./vehicle_picture_test_harness.ts";

type RouteRow = {
  method: string;
  path: string;
  handler: (c: unknown) => Promise<Response>;
};

function mockRoute() {
  const registered: RouteRow[] = [];
  return {
    registered,
    route: {
      get(path: string, ...handlers: unknown[]) {
        registered.push({
          method: "GET",
          path,
          handler: handlers[handlers.length - 1] as RouteRow["handler"],
        });
      },
      post(path: string, ...handlers: unknown[]) {
        registered.push({
          method: "POST",
          path,
          handler: handlers[handlers.length - 1] as RouteRow["handler"],
        });
      },
      delete(path: string, ...handlers: unknown[]) {
        registered.push({
          method: "DELETE",
          path,
          handler: handlers[handlers.length - 1] as RouteRow["handler"],
        });
      },
    },
  };
}

function aal2Token() {
  return `Bearer x.${btoa(JSON.stringify({ aal: "aal2" }))}.y`;
}

function mockContext(opts: {
  role: string;
  organizationId?: string | null;
  jsonBody?: unknown;
  param?: Record<string, string>;
  query?: Record<string, string>;
}) {
  const token = aal2Token();
  const userId = "11111111-1111-4111-8111-111111111111";
  return {
    get: (key: string) => {
      if (key === "rbacUser") {
        return {
          userId,
          id: userId,
          email: "staff@test",
          resolvedRole: opts.role,
          rawRole: opts.role,
          organizationId: opts.organizationId ?? null,
        };
      }
      return undefined;
    },
    json: (body: unknown, status?: number) =>
      new Response(JSON.stringify(body), { status: status ?? 200 }),
    req: {
      raw: new Request("http://test"),
      header: (name: string) => (name.toLowerCase() === "authorization" ? token : ""),
      json: async () => opts.jsonBody ?? {},
      query: (name: string) => opts.query?.[name] ?? "",
      param: (name: string) => opts.param?.[name] ?? "",
    },
    param: (name: string) => opts.param?.[name] ?? "",
  };
}

function stubSupabaseRpc(): SupabaseClient {
  return { rpc: async () => ({ error: null }) } as unknown as SupabaseClient;
}

function adminTestSetup(mem: ReturnType<typeof createMemoryVehiclePictureDb>) {
  const settings = createSettingsStore({ ai_vehicle_pictures: true });
  setVehiclePictureAdminDbForTests(mem.db);
  setVehiclePictureSpendForTests(async () => ({ usedUsd: 1, budgetUsd: 50 }));
  setVehiclePictureKickWorkerForTests(async () => {});
  setVehiclePictureAdminSettingsForTests({
    load: () => settings.load(),
    save: (p) => settings.save(p),
  });
  setVehiclePictureAdminAuditForTests(async () => {});
  return { settings };
}

function clearAdminTestHooks() {
  setVehiclePictureAdminDbForTests(null);
  setVehiclePictureSpendForTests(null);
  setVehiclePictureKickWorkerForTests(null);
  setVehiclePictureAdminSettingsForTests(null);
  setVehiclePictureAdminAuditForTests(null);
  setVehiclePictureRegenLimitForTests(null);
}

Deno.test("T15: dominion leak scanner", () => {
  assertEquals(dominionPictureJsonLeak('{"organizationId":"x"}'), "organizationid");
  assertEquals(dominionPictureJsonLeak('{"ok":true}'), null);
});

Deno.test("T16: fleet user forbidden on admin list", async () => {
  const { registered, route } = mockRoute();
  registerVehiclePictureAdminRoutes(route, stubSupabaseRpc());
  const list = registered.find((r) => r.method === "GET" && r.path.endsWith("/admin/vehicle-pictures"));
  if (!list) throw new Error("list route missing");
  const res = await list.handler(mockContext({ role: "fleet_owner", organizationId: "org-1" }));
  assertEquals(res.status, 403);
});

Deno.test("T16: analyst forbidden on writes", async () => {
  clearAdminTestHooks();
  const mem = createMemoryVehiclePictureDb();
  adminTestSetup(mem);
  try {
    const { registered, route } = mockRoute();
    registerVehiclePictureAdminRoutes(route, stubSupabaseRpc());
    const writes = registered.filter((r) => r.method !== "GET");
    for (const row of writes) {
      const res = await row.handler(mockContext({ role: "platform_analyst", param: { id: "x" } }));
      assertEquals(res.status, 403, row.path);
    }
  } finally {
    clearAdminTestHooks();
  }
});

Deno.test("T16: support forbidden on owner routes", async () => {
  clearAdminTestHooks();
  const mem = createMemoryVehiclePictureDb();
  adminTestSetup(mem);
  try {
    const { registered, route } = mockRoute();
    registerVehiclePictureAdminRoutes(route, stubSupabaseRpc());
    for (const suffix of ["/toggle", "/remake-outdated", "/remake-outdated/preview"]) {
      const row = registered.find((r) => r.path.endsWith(suffix));
      if (!row) throw new Error(`missing ${suffix}`);
      const res = await row.handler(mockContext({
        role: "platform_support",
        jsonBody: { enabled: true },
      }));
      assertEquals(res.status, 403, suffix);
    }
  } finally {
    clearAdminTestHooks();
  }
});

Deno.test("T11: DELETE in use → 409", async () => {
  clearAdminTestHooks();
  const mem = createMemoryVehiclePictureDb();
  const look = buildLook(defaultTestCatalog(), "white");
  if ("error" in look) throw new Error("bad look");
  const row = seedReadyLook(mem.pictures, look, "org-hidden");
  mem.fleetVehicles.set("v1", { id: "v1", organization_id: "org-hidden", picture_id: row.id } as never);
  adminTestSetup(mem);
  try {
    const { registered, route } = mockRoute();
    registerVehiclePictureAdminRoutes(route, stubSupabaseRpc());
    const del = registered.find((r) => r.method === "DELETE");
    if (!del) throw new Error("delete missing");
    const res = await del.handler(mockContext({ role: "platform_owner", param: { id: row.id } }));
    assertEquals(res.status, 409);
    assertEquals((await res.json() as { code: string }).code, "PICTURE_IN_USE");
  } finally {
    clearAdminTestHooks();
  }
});

Deno.test("T11: DELETE unused → 200", async () => {
  clearAdminTestHooks();
  const mem = createMemoryVehiclePictureDb();
  const look = buildLook(defaultTestCatalog(), "white");
  if ("error" in look) throw new Error("bad look");
  const row = seedReadyLook(mem.pictures, look, "org-hidden");
  adminTestSetup(mem);
  try {
    const { registered, route } = mockRoute();
    registerVehiclePictureAdminRoutes(route, stubSupabaseRpc());
    const del = registered.find((r) => r.method === "DELETE");
    if (!del) throw new Error("delete missing");
    const res = await del.handler(mockContext({ role: "platform_owner", param: { id: row.id } }));
    assertEquals(res.status, 200);
    assert(mem.pictures.get(row.id)?.deleted_at);
  } finally {
    clearAdminTestHooks();
  }
});

Deno.test("T15: admin GET JSON has no fleet leak", async () => {
  clearAdminTestHooks();
  const mem = createMemoryVehiclePictureDb();
  mem.catalogs.set("cat-1", defaultTestCatalog());
  const look = buildLook(defaultTestCatalog(), "white");
  if ("error" in look) throw new Error("bad look");
  const row = seedReadyLook(mem.pictures, look, "org-hidden");
  adminTestSetup(mem);
  try {
    const { registered, route } = mockRoute();
    registerVehiclePictureAdminRoutes(route, stubSupabaseRpc());
    for (const rowRoute of registered.filter((r) => r.method === "GET")) {
      const res = await rowRoute.handler(mockContext({
        role: "platform_owner",
        param: { id: row.id },
        query: { page: "1" },
      }));
      const text = await res.text();
      assertEquals(dominionPictureJsonLeak(text), null, `${rowRoute.path}: ${text.slice(0, 120)}`);
    }
  } finally {
    clearAdminTestHooks();
  }
});

Deno.test("toggle sets global ai flag", async () => {
  clearAdminTestHooks();
  const mem = createMemoryVehiclePictureDb();
  const { settings } = adminTestSetup(mem);
  settings.save({ ai_vehicle_pictures: false });
  try {
    const { registered, route } = mockRoute();
    registerVehiclePictureAdminRoutes(route, stubSupabaseRpc());
    const toggle = registered.find((r) => r.path.endsWith("/toggle"));
    if (!toggle) throw new Error("toggle missing");
    const res = await toggle.handler(mockContext({
      role: "platform_owner",
      jsonBody: { enabled: true },
    }));
    assertEquals(res.status, 200);
    assertEquals(settings.snapshot().ai_vehicle_pictures, true);
    assertEquals("organizationId" in (await res.json() as object), false);
  } finally {
    clearAdminTestHooks();
  }
});

Deno.test("regenerate 31st → 429", async () => {
  clearAdminTestHooks();
  const mem = createMemoryVehiclePictureDb();
  const look = buildLook(defaultTestCatalog(), "white");
  if ("error" in look) throw new Error("bad look");
  const row = seedReadyLook(mem.pictures, look, "org-x");
  adminTestSetup(mem);
  let n = 0;
  setVehiclePictureRegenLimitForTests(async () => {
    n += 1;
    return n <= 30;
  });
  const { r2 } = await import("./vehicle_picture_test_harness.ts").then((m) => m.fakeR2WithCopy());
  try {
    const { registered, route } = mockRoute();
    registerVehiclePictureAdminRoutes(route, stubSupabaseRpc());
    const regen = registered.find((r) => r.path.endsWith("/regenerate"));
    if (!regen) throw new Error("regen missing");
    for (let i = 0; i < 30; i++) {
      const res = await regen.handler(mockContext({
        role: "platform_owner",
        param: { id: row.id },
      }));
      assertEquals(res.status, 200, `run ${i + 1}`);
    }
    assertEquals((await regen.handler(mockContext({
      role: "platform_owner",
      param: { id: row.id },
    }))).status, 429);
  } finally {
    clearAdminTestHooks();
    void r2;
  }
});

Deno.test("write route logs audit", async () => {
  clearAdminTestHooks();
  const mem = createMemoryVehiclePictureDb();
  const look = buildLook(defaultTestCatalog(), "white");
  if ("error" in look) throw new Error("bad look");
  const row = seedReadyLook(mem.pictures, look, "org-x");
  adminTestSetup(mem);
  const audits: string[] = [];
  setVehiclePictureAdminAuditForTests(async (p) => {
    audits.push(p.action);
  });
  setVehiclePictureRegenLimitForTests(async () => true);
  try {
    const { registered, route } = mockRoute();
    registerVehiclePictureAdminRoutes(route, stubSupabaseRpc());
    const rate = registered.find((r) => r.path.endsWith("/rate"));
    if (!rate) throw new Error("rate missing");
    await rate.handler(mockContext({
      role: "platform_owner",
      param: { id: row.id },
      jsonBody: { rating: "good" },
    }));
    assertEquals(audits, ["vehicle_picture_rate"]);
  } finally {
    clearAdminTestHooks();
  }
});

Deno.test("T32: catalog relink clears picture_id in same write", async () => {
  let updatePayload: Record<string, unknown> | null = null;
  const vehicleId = "VPCHK999";
  const supabase = {
    from: (table: string) => {
      if (table !== "fleet_vehicles") return {};
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: vehicleId,
                organization_id: "org-a",
                license_plate: "VPCHK999",
                vehicle_catalog_id: "cat-old",
                color_standard: "white",
                picture_id: "pic-old",
                make: "toyota",
                model: "roomy",
                year: 2020,
                legacy_kv_id: "legacy",
              },
              error: null,
            }),
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: () => {
            updatePayload = patch;
            return Promise.resolve({ error: null });
          },
        }),
      };
    },
    rpc: () => Promise.resolve({ error: null }),
  } as unknown as SupabaseClient;
  try {
    await runPictureLookupAfterCatalogLink(supabase, vehicleId, "cat-new", "cat-old", "matched");
  } catch {
    // lookup may fail without full env after update
  }
  assertEquals(updatePayload?.vehicle_catalog_id, "cat-new");
  assertEquals(updatePayload?.picture_id, null);
});

Deno.test("T31: fleet color Grey→White clears picture_id in same write", async () => {
  const orgA = "org-a";
  const vehicleId = "VEH123";
  let lastUpdate: Record<string, unknown> | null = null;
  const supabase = {
    from: (table: string) => {
      if (table !== "fleet_vehicles") return {};
      return {
        select: () => ({
          eq: (_col: string, id: string) => ({
            maybeSingle: async () => {
              if (id !== vehicleId) return { data: null, error: null };
              return {
                data: {
                  id: vehicleId,
                  organization_id: orgA,
                  vehicle_catalog_id: "cat-1",
                  color_standard: "grey",
                  picture_id: "pic-1",
                },
                error: null,
              };
            },
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: () => {
            lastUpdate = patch;
            return Promise.resolve({ error: null });
          },
        }),
      };
    },
    rpc: () => Promise.resolve({ error: null }),
  } as unknown as SupabaseClient;

  const registered: RouteRow[] = [];
  const fakeApp = {
    post(path: string, ...handlers: unknown[]) {
      registered.push({
        method: "POST",
        path,
        handler: handlers[handlers.length - 1] as RouteRow["handler"],
      });
    },
    get: () => {},
  };
  registerVehiclePictureRoutes(fakeApp as never, supabase);
  const colorRoute = registered.find((r) => r.path.includes("/vehicles/:id/color"));
  if (!colorRoute) throw new Error("color route missing");

  try {
    await colorRoute.handler({
      get: (key: string) =>
        key === "rbacUser" ? { organizationId: orgA, resolvedRole: "fleet_owner", userId: "u1" } : undefined,
      json: (body: unknown, status?: number) => new Response(JSON.stringify(body), { status: status ?? 200 }),
      req: {
        param: () => vehicleId,
        json: async () => ({ colorStandard: "white" }),
      },
    } as never);
  } catch {
    // lookup needs full Supabase env in integration tests
  }
  assertEquals(lastUpdate?.color_standard, "white");
  assertEquals(lastUpdate?.picture_id, null);
});

Deno.test("T31: fleet color route 404 for other org", async () => {
  const orgB = "org-b";
  const vehicleId = "VEH123";
  const supabase = {
    from: (table: string) => {
      if (table !== "fleet_vehicles") return {};
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: vehicleId,
                organization_id: "org-a",
                vehicle_catalog_id: "cat-1",
                color_standard: "grey",
                picture_id: "pic-1",
              },
              error: null,
            }),
          }),
        }),
      };
    },
  } as unknown as SupabaseClient;
  const registered: RouteRow[] = [];
  const fakeApp = { post(path: string, ...handlers: unknown[]) {
    registered.push({ method: "POST", path, handler: handlers.at(-1) as RouteRow["handler"] });
  }, get: () => {} };
  registerVehiclePictureRoutes(fakeApp as never, supabase);
  const colorRoute = registered.find((r) => r.path.includes("/vehicles/:id/color"));
  if (!colorRoute) throw new Error("color route missing");
  const deny = await colorRoute.handler({
    get: (key: string) =>
      key === "rbacUser" ? { organizationId: orgB, resolvedRole: "fleet_owner", userId: "u2" } : undefined,
    json: (body: unknown, status?: number) => new Response(JSON.stringify(body), { status: status ?? 200 }),
    req: {
      param: () => vehicleId,
      json: async () => ({ colorStandard: "white" }),
    },
  } as never);
  assertEquals(deny.status, 404);
});

Deno.test("stale=1 list uses stale column filter only", async () => {
  clearAdminTestHooks();
  const mem = createMemoryVehiclePictureDb();
  const look = buildLook(defaultTestCatalog(), "white");
  if ("error" in look) throw new Error("bad look");
  const fresh = seedReadyLook(mem.pictures, look, "org-x");
  const staleLook = buildLook({
    ...defaultTestCatalog(),
    make: "honda",
    model: "civic",
    generation: "10th gen",
    body_type: "sedan",
  }, "blue");
  if ("error" in staleLook) throw new Error("bad look");
  const stale = seedReadyLook(mem.pictures, staleLook, "org-x");
  mem.pictures.set(fresh.id, { ...fresh, stale: false });
  mem.pictures.set(stale.id, { ...stale, stale: true });

  const filtersLog: Array<{ staleOnly?: boolean }> = [];
  const tracedDb = new Proxy(mem.db, {
    get(target, prop, receiver) {
      if (prop === "listAdminPictures") {
        return async (filters: { staleOnly?: boolean }) => {
          filtersLog.push(filters);
          return Reflect.apply(target.listAdminPictures, target, [filters]);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
  adminTestSetup(mem);
  setVehiclePictureAdminDbForTests(tracedDb);
  try {
    const { registered, route } = mockRoute();
    registerVehiclePictureAdminRoutes(route, stubSupabaseRpc());
    const list = registered.find((r) => r.method === "GET" && r.path.endsWith("/admin/vehicle-pictures"));
    if (!list) throw new Error("list route missing");
    const res = await list.handler(mockContext({
      role: "platform_owner",
      query: { page: "1", stale: "1" },
    }));
    assertEquals(res.status, 200);
    assertEquals(filtersLog.length, 1);
    assertEquals(filtersLog[0]?.staleOnly, true);
    const body = await res.json() as { items: unknown[]; total: number };
    assertEquals(body.total, 1);
  } finally {
    clearAdminTestHooks();
  }
});

Deno.test("gallery list makes bounded db calls", async () => {
  clearAdminTestHooks();
  const mem = createMemoryVehiclePictureDb();
  const look = buildLook(defaultTestCatalog(), "white");
  if ("error" in look) throw new Error("bad look");
  seedReadyLook(mem.pictures, look, "org-x");
  let listCalls = 0;
  let countCalls = 0;
  const tracedDb = new Proxy(mem.db, {
    get(target, prop, receiver) {
      if (prop === "listAdminPictures") {
        return async (...args: unknown[]) => {
          listCalls += 1;
          return Reflect.apply(target.listAdminPictures, target, args);
        };
      }
      if (prop === "adminPictureCounts") {
        return async () => {
          countCalls += 1;
          return target.adminPictureCounts();
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
  adminTestSetup(mem);
  setVehiclePictureAdminDbForTests(tracedDb);
  try {
    const { registered, route } = mockRoute();
    registerVehiclePictureAdminRoutes(route, stubSupabaseRpc());
    const list = registered.find((r) => r.method === "GET" && r.path.endsWith("/admin/vehicle-pictures"));
    if (!list) throw new Error("list route missing");
    const res = await list.handler(mockContext({ role: "platform_owner", query: { page: "1" } }));
    assertEquals(res.status, 200);
    assertEquals(listCalls, 1);
    assertEquals(countCalls, 1);
  } finally {
    clearAdminTestHooks();
  }
});

Deno.test("remake preview counts outdated ready rows", async () => {
  clearAdminTestHooks();
  const mem = createMemoryVehiclePictureDb();
  const look = buildLook(defaultTestCatalog(), "white");
  if ("error" in look) throw new Error("bad look");
  const row = seedReadyLook(mem.pictures, look, "org-x");
  mem.pictures.set(row.id, {
    ...mem.pictures.get(row.id)!,
    prompt_version: PROMPT_VERSION - 1,
    status: "ready",
  });
  adminTestSetup(mem);
  try {
    const { registered, route } = mockRoute();
    registerVehiclePictureAdminRoutes(route, stubSupabaseRpc());
    const preview = registered.find((r) => r.path.includes("remake-outdated/preview"));
    if (!preview) throw new Error("preview missing");
    const res = await preview.handler(mockContext({ role: "platform_owner" }));
    assertEquals(res.status, 200);
    const body = await res.json() as { count: number };
    assertEquals(body.count, 1);
  } finally {
    clearAdminTestHooks();
  }
});