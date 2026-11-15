/**
 * Powertrain job fit — fleet + Dominion route tests (Round S1 fix).
 * deno test --allow-all supabase/functions/_fleet-server/maintenance_powertrain_fit.test.ts
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { Context } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { FEATURE_FLAGS } from "./feature_flags.ts";
import { featureFlagCache } from "./memory_cache.ts";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_ORG = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PLATE = "5179KZ";
const CATALOG = "11111111-1111-4111-8111-111111111101";
const SYS = "22222222-2222-4222-8222-222222222201";
const SG = "33333333-3333-4333-8333-333333333301";
const SEC = "44444444-4444-4444-8444-444444444401";
const JOB_Y = "55555555-5555-4555-8555-555555555501";
const JOB_N = "66666666-6666-4666-8666-666666666601";
const JOB_U = "77777777-7777-4777-8777-777777777701";
const JOB_REL = "88888888-8888-4888-8888-888888888801";
const JOB_RETIRED = "99999999-9999-4999-8999-999999999901";
const USED_JOB = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01";
const GROUP_SYS = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const CATALOG_ROW = "dddddddd-dddd-4ddd-8ddd-dddddddddd01";
const RECORD_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const WO_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const LINE_ID = "12121212-1212-4121-8121-121212121212";

const FIT_KEYS = new Set(["fits", "fitJobCount", "hiddenJobCount", "jobFit"]);

function ensureSupabaseEnv() {
  if (!Deno.env.get("SUPABASE_URL")) Deno.env.set("SUPABASE_URL", "http://127.0.0.1:54321");
  if (!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
  }
}

function setJobFitFlag(on: boolean) {
  const key = `flag:${FEATURE_FLAGS.JOB_FIT_FILTER}`;
  if (on) {
    featureFlagCache.set(key, { enabled: true, updatedAt: new Date().toISOString() });
  } else {
    featureFlagCache.invalidate(key);
  }
}

type RouteRow = {
  method: string;
  path: string;
  handler: (c: unknown) => Promise<Response>;
};

function mockRoute() {
  const registered: RouteRow[] = [];
  const route = {
    get(path: string, ...handlers: unknown[]) {
      registered.push({ method: "GET", path, handler: handlers[handlers.length - 1] as RouteRow["handler"] });
    },
    post(path: string, ...handlers: unknown[]) {
      registered.push({ method: "POST", path, handler: handlers[handlers.length - 1] as RouteRow["handler"] });
    },
    patch(path: string, ...handlers: unknown[]) {
      registered.push({ method: "PATCH", path, handler: handlers[handlers.length - 1] as RouteRow["handler"] });
    },
    put(path: string, ...handlers: unknown[]) {
      registered.push({ method: "PUT", path, handler: handlers[handlers.length - 1] as RouteRow["handler"] });
    },
    delete(path: string, ...handlers: unknown[]) {
      registered.push({ method: "DELETE", path, handler: handlers[handlers.length - 1] as RouteRow["handler"] });
    },
    request: async () => new Response(null, { status: 404 }),
  };
  return { registered, route };
}

type MockContextOpts = {
  body?: Record<string, unknown>;
  param?: Record<string, string>;
  query?: Record<string, string>;
  role?: string;
  orgId?: string;
  userId?: string;
};

function mockContext(opts: MockContextOpts = {}) {
  const token = `Bearer x.${btoa(JSON.stringify({ aal: "aal2" }))}.y`;
  const rbacUser = {
    userId: opts.userId ?? USER,
    organizationId: opts.orgId ?? ORG,
    resolvedRole: opts.role ?? "fleet_owner",
    permissions: ["vehicles.edit", "*"],
  };
  const query = opts.query ?? {};
  const param = opts.param ?? {};
  return {
    get: (key: string) => (key === "rbacUser" ? rbacUser : undefined),
    json: (payload: unknown, status?: number) =>
      new Response(JSON.stringify(payload), { status: status ?? 200 }),
    req: {
      header: () => token,
      json: async () => opts.body ?? {},
      param: (name: string) => param[name] ?? "",
      query: (name: string) => query[name] ?? "",
      path: "/fleet-ops/maintenance",
    },
    param: (name: string) => param[name] ?? "",
    env: {},
  } as unknown as Context;
}

function assertNoFitKeys(obj: unknown, path = ""): void {
  if (obj == null || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const x of obj) assertNoFitKeys(x, path);
    return;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    assertEquals(FIT_KEYS.has(k), false, `unexpected key ${k} at ${path || "root"}`);
    assertNoFitKeys(v, path ? `${path}.${k}` : k);
  }
}

type ChainState = {
  table: string;
  eqs: Array<[string, string]>;
  selectOpts?: { count?: string; head?: boolean };
};

function makeThenableChain(
  resolve: (s: ChainState) => Promise<{ data: unknown; error: unknown; count?: number }>,
) {
  const state: ChainState = { table: "", eqs: [] };
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const m of ["eq", "order", "in", "is", "not", "like", "limit", "filter"]) {
    chain[m] = (...args: unknown[]) => {
      if (m === "eq" && typeof args[0] === "string") {
        state.eqs.push([args[0], String(args[1])]);
      }
      if (m === "in" && typeof args[0] === "string") {
        state.eqs.push([`in:${args[0]}`, (args[1] as string[]).join(",")]);
      }
      return chain;
    };
  }
  chain.select = (_cols?: unknown, opts?: { count?: string; head?: boolean }) => {
    state.selectOpts = opts;
    return chain;
  };
  chain.maybeSingle = () => resolve(state);
  chain.single = () => resolve(state);
  (chain as { then: typeof Promise.prototype.then }).then = (onFulfilled, onRejected) =>
    resolve(state).then(onFulfilled, onRejected);
  return { chain, state };
}

async function loadMaintenanceRoutes() {
  ensureSupabaseEnv();
  return await import("./maintenance_routes.ts");
}

async function loadJobsAdminRoutes() {
  ensureSupabaseEnv();
  return await import("./maintenance_jobs_admin_routes.ts");
}

async function loadVehicleCatalogWriteRoutes() {
  ensureSupabaseEnv();
  return await import("./vehicle_catalog_write_routes.ts");
}

function baselineCategories() {
  return [
    { id: SYS, kind: "system", name: "Engine", code: "sys_engine", sort_order: 1, quick_job_eligible: true, status: "active", parent_id: null },
    { id: JOB_Y, kind: "component", name: "Oil", code: "oil", sort_order: 1, status: "active", parent_id: SYS },
    { id: JOB_N, kind: "component", name: "Spark", code: "spark_plugs", sort_order: 2, status: "active", parent_id: SYS },
    { id: JOB_U, kind: "component", name: "Inspect", code: "inspect", sort_order: 3, status: "active", parent_id: SYS },
    { id: JOB_REL, kind: "component", name: "Filter", code: "oil_filter", sort_order: 4, status: "active", parent_id: SYS },
    { id: JOB_RETIRED, kind: "component", name: "Old", code: "old_job", sort_order: 5, status: "retired", parent_id: SYS },
  ];
}

function defaultFitRows() {
  return [
    { job_id: JOB_Y, fits: "yes" },
    { job_id: JOB_N, fits: "no" },
    { job_id: JOB_U, fits: "unknown" },
    { job_id: JOB_REL, fits: "yes" },
  ];
}

type FleetMockOpts = {
  categories?: Record<string, unknown>[];
  vehicle?: { orgId: string; plate: string; catalogId: string | null } | null;
  vehicleErr?: boolean;
  fitRows?: Array<{ job_id: string; fits: string }>;
  jobFitsCarErr?: boolean;
  catalog?: { powertrain: string; fuel: string; powertrain_status: string } | null;
  sectionsMode?: boolean;
  rpcLog?: { jobFitsCarCalls: number; lastJobFitsCarArgs: Record<string, unknown> | null };
};

function buildFleetSupabase(opts: FleetMockOpts) {
  const categories = opts.categories ?? baselineCategories();
  const fitRows = opts.fitRows ?? defaultFitRows();
  const rpcLog = opts.rpcLog ?? { jobFitsCarCalls: 0, lastJobFitsCarArgs: null };

  const sectionsFixture = () => ({
    sg: [{ id: SG, code: "ext", name: "External", sort_order: 10, system_id: SYS }],
    sec: [{
      id: SEC,
      group_id: SG,
      code: "lube",
      name: "Lube",
      description: "d",
      icon_key: "droplet",
      sort_order: 10,
      system_id: SYS,
    }],
    mem: [
      { section_id: SEC, category_id: JOB_Y, sort_order: 10, system_id: SYS },
      { section_id: SEC, category_id: JOB_N, sort_order: 20, system_id: SYS },
    ],
    rel: [{ from_category_id: JOB_Y, to_category_id: JOB_REL, note: "Also" }],
  });

  const resolveCategories = (state: ChainState): { data: unknown; error: unknown } => {
    let rows = [...categories];
    for (const [k, v] of state.eqs) {
      if (k === "kind") rows = rows.filter((r) => String(r.kind) === v);
      if (k === "parent_id") rows = rows.filter((r) => String(r.parent_id ?? "") === v);
      if (k === "quick_job_eligible") rows = rows.filter((r) => r.quick_job_eligible === true);
    }
    const idEq = state.eqs.find(([k]) => k === "id");
    if (idEq) rows = rows.filter((r) => String(r.id) === idEq[1]);
    if (state.selectOpts?.head) {
      return { data: null, error: null, count: rows.length };
    }
    return { data: rows, error: null };
  };

  const client = {
    from(table: string) {
      const { chain, state } = makeThenableChain(async (s) => {
        s.table = table;
        if (table === "maintenance_service_categories") {
          return resolveCategories(s);
        }
        if (table === "maintenance_job_section_groups") {
          return { data: sectionsFixture().sg, error: null };
        }
        if (table === "maintenance_job_sections") {
          return { data: sectionsFixture().sec, error: null };
        }
        if (table === "maintenance_job_section_members") {
          return { data: sectionsFixture().mem, error: null };
        }
        if (table === "maintenance_job_relations") {
          return { data: sectionsFixture().rel, error: null };
        }
        if (table === "maintenance_job_item") {
          return { data: [], error: null };
        }
        if (table === "maintenance_supply") {
          return { data: [], error: null };
        }
        if (table === "maintenance_unit") {
          return { data: [], error: null };
        }
        if (table === "vehicle_catalog") {
          if (opts.catalog) {
            const id = s.eqs.find(([k]) => k === "id")?.[1];
            if (id === CATALOG || !id) {
              return { data: { id: CATALOG, ...opts.catalog }, error: null };
            }
          }
          return { data: null, error: null };
        }
        if (table === "vehicles") {
          if (opts.vehicleErr) return { data: null, error: { message: "vehicles down" } };
          const v = opts.vehicle;
          if (!v) return { data: null, error: null };
          const orgEq = s.eqs.find(([k]) => k === "organization_id")?.[1];
          const plateEq = s.eqs.find(([k]) => k === "id")?.[1];
          if (orgEq === v.orgId && plateEq === v.plate) {
            return {
              data: { id: v.plate, vehicle_catalog_id: v.catalogId },
              error: null,
            };
          }
          return { data: null, error: null };
        }
        return { data: [], error: null };
      });
      state.table = table;
      return chain;
    },
    rpc(name: string, args?: Record<string, unknown>) {
      if (name === "job_fits_car") {
        rpcLog.jobFitsCarCalls += 1;
        rpcLog.lastJobFitsCarArgs = args ?? null;
        if (opts.jobFitsCarErr) return Promise.resolve({ data: null, error: { message: "rpc fail" } });
        const catalogId = args?.p_vehicle_catalog_id;
        if (catalogId == null) {
          const unknownRows = categories
            .filter((r) => r.kind === "component" && String(r.status ?? "active") !== "retired")
            .map((r) => ({ job_id: String(r.id), fits: "unknown" }));
          return Promise.resolve({ data: unknownRows, error: null });
        }
        return Promise.resolve({ data: fitRows, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    schema: () => client,
  };
  return { client, rpcLog };
}

function urlEqParam(url: string, column: string): string | null {
  const m = url.match(new RegExp(`${column}=eq\\.([^&]+)`));
  if (!m) return null;
  let v = decodeURIComponent(m[1]);
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  return v;
}

function vehicleFetchMatches(url: string, v: NonNullable<FleetMockOpts["vehicle"]>): boolean {
  const org = urlEqParam(url, "organization_id");
  const plate = urlEqParam(url, "id");
  if (org === v.orgId && plate === v.plate) return true;
  return url.includes(`organization_id=eq.${v.orgId}`) && url.includes(`id=eq.${v.plate}`);
}

type VehicleFetchCfg = { vehicle?: FleetMockOpts["vehicle"]; vehicleErr?: boolean };

let vehicleFetchCfg: VehicleFetchCfg | null = null;
let nativeFetch: typeof fetch | null = null;

function ensureFetchInterceptor() {
  if (nativeFetch) return;
  nativeFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const isVehicle = url.includes("/rest/v1/") && url.includes("vehicles");
    const cfg = vehicleFetchCfg;
    if (isVehicle && cfg) {
      if (cfg.vehicleErr) {
        return await Promise.reject(new TypeError("vehicle fetch failed"));
      }
      const v = cfg.vehicle;
      if (v && vehicleFetchMatches(url, v)) {
        return new Response(JSON.stringify([{
          id: v.plate,
          vehicle_catalog_id: v.catalogId,
        }]), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return nativeFetch!(input, init);
  };
}

function installVehicleFetchMock(cfg: VehicleFetchCfg) {
  ensureFetchInterceptor();
  vehicleFetchCfg = cfg;
  return () => {
    vehicleFetchCfg = null;
  };
}

const FLEET_LIST_ROUTES: Array<{ path: string; param?: Record<string, string>; query?: Record<string, string> }> = [
  { path: "/maintenance-categories" },
  { path: "/maintenance-categories", query: { vehicleId: PLATE } },
  { path: "/maintenance-categories/quick-jobs" },
  { path: "/maintenance-categories/systems/:systemId/components", param: { systemId: SYS } },
  { path: "/maintenance-categories/systems/:systemId/sections", param: { systemId: SYS } },
];

async function registerFleetHandlers(client: unknown) {
  const { registered, route } = mockRoute();
  const { registerMaintenanceRoutes } = await loadMaintenanceRoutes();
  registerMaintenanceRoutes(route, client as SupabaseClient);
  return registered;
}

function findHandler(registered: RouteRow[], method: string, path: string) {
  const r = registered.find((x) => x.method === method && x.path === path);
  if (!r) throw new Error(`missing route ${method} ${path}`);
  return r.handler;
}

function collectJobsWithFit(body: Record<string, unknown>): Array<{ id: string; fits: string }> {
  const out: Array<{ id: string; fits: string }> = [];
  const items = body.items as Record<string, unknown>[] | undefined;
  if (Array.isArray(items)) {
    for (const row of items) {
      if (row.fits != null) out.push({ id: String(row.id), fits: String(row.fits) });
    }
  }
  const groups = body.groups as Array<{ sections: Array<{ jobs: Record<string, unknown>[] }> }> | undefined;
  if (Array.isArray(groups)) {
    for (const g of groups) {
      for (const sec of g.sections ?? []) {
        for (const job of sec.jobs ?? []) {
          if (job.fits != null) out.push({ id: String(job.id), fits: String(job.fits) });
          const rec = job.recommendedWith as Record<string, unknown>[] | undefined;
          if (Array.isArray(rec)) {
            for (const r of rec) {
              if (r.fits != null) out.push({ id: String(r.categoryId ?? r.id), fits: String(r.fits) });
            }
          }
        }
      }
    }
  }
  const other = body.otherJobs as Record<string, unknown>[] | undefined;
  if (Array.isArray(other)) {
    for (const job of other) {
      if (job.fits != null) out.push({ id: String(job.id), fits: String(job.fits) });
    }
  }
  return out;
}

Deno.test("JOB_FIT_FILTER flag name", () => {
  assertEquals(FEATURE_FLAGS.JOB_FIT_FILTER, "job_fit_filter");
});

// --- Fleet job-list routes (done-tests 11, 9, 13) ---

const MODEL_CASES = [
  { powertrain: "ice", fuel: "petrol", catalogStatus: "confirmed", expectStatus: "known" as const },
  { powertrain: "ice", fuel: "diesel", catalogStatus: "confirmed", expectStatus: "known" as const },
  { powertrain: "hev", fuel: "petrol", catalogStatus: "confirmed", expectStatus: "known" as const },
  { powertrain: "phev", fuel: "petrol", catalogStatus: "confirmed", expectStatus: "known" as const },
  { powertrain: "bev", fuel: "electric", catalogStatus: "confirmed", expectStatus: "known" as const },
  { powertrain: "ice", fuel: "petrol", catalogStatus: "needs_check", expectStatus: "unknown" as const },
];

function seedFeatureFlags(jobFitOn: boolean) {
  setJobFitFlag(jobFitOn);
  featureFlagCache.set(`flag:${FEATURE_FLAGS.SERVICE_ITEMS}`, {
    enabled: false,
    updatedAt: new Date().toISOString(),
  });
}

Deno.test("Done-test 11: flag off or no vehicleId — no fit keys (4 routes)", async () => {
  seedFeatureFlags(false);
  const { client } = buildFleetSupabase({
    vehicle: { orgId: ORG, plate: PLATE, catalogId: CATALOG },
    catalog: { powertrain: "ice", fuel: "petrol", powertrain_status: "confirmed" },
  });
  const restoreFetch = installVehicleFetchMock({ vehicle: { orgId: ORG, plate: PLATE, catalogId: CATALOG } });
  try {
    const registered = await registerFleetHandlers(client);
    const routes = [
      { method: "GET", path: "/maintenance-categories", query: { vehicleId: PLATE } },
      { method: "GET", path: "/maintenance-categories/quick-jobs", query: { vehicleId: PLATE } },
      { method: "GET", path: "/maintenance-categories/systems/:systemId/components", param: { systemId: SYS }, query: { vehicleId: PLATE } },
      { method: "GET", path: "/maintenance-categories/systems/:systemId/sections", param: { systemId: SYS }, query: { vehicleId: PLATE } },
    ] as const;
    for (const spec of routes) {
      const handler = findHandler(registered, spec.method, spec.path);
      const without = await handler(mockContext({ query: {} , param: spec.param ?? {} }));
      const withVeh = await handler(mockContext({ query: spec.query ?? {}, param: spec.param ?? {} }));
      assertEquals(without.status, 200);
      assertEquals(withVeh.status, 200);
      const a = await without.json();
      const b = await withVeh.json();
      assertEquals(JSON.stringify(a), JSON.stringify(b));
      assertNoFitKeys(a);
    }
    setJobFitFlag(true);
    const h = findHandler(registered, "GET", "/maintenance-categories");
    const flagOnNoVehicle = await h(mockContext({ query: {} }));
    assertEquals(flagOnNoVehicle.status, 200);
    assertNoFitKeys(await flagOnNoVehicle.json());
  } finally {
    restoreFetch();
    setJobFitFlag(false);
  }
});

Deno.test("Done-test 9: fits match job_fits_car for 6 model kinds (4 routes)", async () => {
  for (const modelCase of MODEL_CASES) {
    seedFeatureFlags(true);
    const { client, rpcLog } = buildFleetSupabase({
      vehicle: { orgId: ORG, plate: PLATE, catalogId: CATALOG },
      catalog: {
        powertrain: modelCase.powertrain,
        fuel: modelCase.fuel,
        powertrain_status: modelCase.catalogStatus,
      },
    });
    const restoreFetch = installVehicleFetchMock({
      vehicle: { orgId: ORG, plate: PLATE, catalogId: CATALOG },
    });
    try {
      const registered = await registerFleetHandlers(client);
      const fitByJob = new Map(defaultFitRows().map((r) => [r.job_id, r.fits]));
      const handlers: Array<{ path: string; param?: Record<string, string> }> = [
        { path: "/maintenance-categories" },
        { path: "/maintenance-categories/quick-jobs" },
        { path: "/maintenance-categories/systems/:systemId/components", param: { systemId: SYS } },
        { path: "/maintenance-categories/systems/:systemId/sections", param: { systemId: SYS } },
      ];
      for (const h of handlers) {
        rpcLog.jobFitsCarCalls = 0;
        const res = await findHandler(registered, "GET", h.path)(
          mockContext({ query: { vehicleId: PLATE }, param: h.param ?? {} }),
        );
        assertEquals(res.status, 200);
        assertEquals(rpcLog.jobFitsCarCalls, 1);
        const body = await res.json() as Record<string, unknown>;
        assertEquals((body.jobFit as { status?: string })?.status, modelCase.expectStatus);
        for (const { id, fits } of collectJobsWithFit(body)) {
          assertEquals(fits, fitByJob.get(id) ?? "unknown");
        }
      }
    } finally {
      restoreFetch();
      setJobFitFlag(false);
    }
  }
});

Deno.test("Done-test 13: unlinked car → unknown fit, null RPC catalog", async () => {
  seedFeatureFlags(true);
  const { client, rpcLog } = buildFleetSupabase({});
  const restoreFetch = installVehicleFetchMock({
    vehicle: { orgId: ORG, plate: PLATE, catalogId: null },
  });
  try {
    const registered = await registerFleetHandlers(client);
    const res = await findHandler(registered, "GET", "/maintenance-categories")(
      mockContext({ query: { vehicleId: PLATE } }),
    );
    assertEquals(res.status, 200);
    assertEquals(rpcLog.lastJobFitsCarArgs?.p_vehicle_catalog_id ?? null, null);
    const body = await res.json() as Record<string, unknown>;
    assertEquals((body.jobFit as { status?: string })?.status, "unknown");
    for (const row of (body.items ?? []) as Record<string, unknown>[]) {
      if (row.kind === "component") assertEquals(row.fits, "unknown");
    }
  } finally {
    restoreFetch();
    setJobFitFlag(false);
  }
});

Deno.test("Done-test 13b: malformed catalog link → unknown fit, null RPC catalog", async () => {
  seedFeatureFlags(true);
  const { client, rpcLog } = buildFleetSupabase({});
  const restoreFetch = installVehicleFetchMock({
    vehicle: { orgId: ORG, plate: PLATE, catalogId: "not-a-uuid" },
  });
  try {
    const registered = await registerFleetHandlers(client);
    const res = await findHandler(registered, "GET", "/maintenance-categories")(
      mockContext({ query: { vehicleId: PLATE } }),
    );
    assertEquals(res.status, 200);
    assertEquals(rpcLog.lastJobFitsCarArgs?.p_vehicle_catalog_id ?? null, null);
    const body = await res.json() as Record<string, unknown>;
    assertEquals((body.jobFit as { status?: string })?.status, "unknown");
  } finally {
    restoreFetch();
    setJobFitFlag(false);
  }
});

Deno.test("Fallback: job_fits_car or vehicle lookup error → error jobFit, no fits", async () => {
  seedFeatureFlags(true);
  const { client } = buildFleetSupabase({
    vehicle: { orgId: ORG, plate: PLATE, catalogId: CATALOG },
    jobFitsCarErr: true,
    catalog: { powertrain: "ice", fuel: "petrol", powertrain_status: "confirmed" },
  });
  const restoreFetch = installVehicleFetchMock({ vehicle: { orgId: ORG, plate: PLATE, catalogId: CATALOG } });
  try {
    const registered = await registerFleetHandlers(client);
    let res = await findHandler(registered, "GET", "/maintenance-categories")(
      mockContext({ query: { vehicleId: PLATE } }),
    );
    assertEquals(res.status, 200);
    let body = await res.json() as Record<string, unknown>;
    assertEquals((body.jobFit as { status?: string })?.status, "error");
    for (const row of (body.items ?? []) as Record<string, unknown>[]) {
      assertEquals("fits" in row, false);
    }
  } finally {
    restoreFetch();
  }
  const { client: client2 } = buildFleetSupabase({
    vehicle: { orgId: ORG, plate: PLATE, catalogId: CATALOG },
    vehicleErr: true,
  });
  const restoreFetch2 = installVehicleFetchMock({ vehicleErr: true });
  try {
    const registered = await registerFleetHandlers(client2);
    const res = await findHandler(registered, "GET", "/maintenance-categories")(
      mockContext({ query: { vehicleId: PLATE } }),
    );
    assertEquals(res.status, 200);
    const body = await res.json() as Record<string, unknown>;
    assertEquals((body.jobFit as { status?: string })?.status, "error");
  } finally {
    restoreFetch2();
    setJobFitFlag(false);
  }
});

Deno.test("Car in another organisation → 404", async () => {
  seedFeatureFlags(true);
  const { client } = buildFleetSupabase({
    vehicle: { orgId: OTHER_ORG, plate: PLATE, catalogId: CATALOG },
  });
  const restoreFetch = installVehicleFetchMock({
    vehicle: { orgId: OTHER_ORG, plate: PLATE, catalogId: CATALOG },
  });
  try {
    const registered = await registerFleetHandlers(client);
    const res = await findHandler(registered, "GET", "/maintenance-categories")(
      mockContext({ query: { vehicleId: PLATE }, orgId: ORG }),
    );
    assertEquals(res.status, 404);
    const body = await res.json() as { error?: string };
    assertEquals(body.error, "Car not found.");
  } finally {
    restoreFetch();
    setJobFitFlag(false);
  }
});

Deno.test("Group fitJobCount and hiddenJobCount on quick-jobs", async () => {
  seedFeatureFlags(true);
  const threeActive = baselineCategories().filter(
    (r) => r.id === SYS || r.id === JOB_Y || r.id === JOB_N || r.id === JOB_U || r.id === JOB_RETIRED,
  );
  const { client } = buildFleetSupabase({
    categories: threeActive,
    vehicle: { orgId: ORG, plate: PLATE, catalogId: CATALOG },
    catalog: { powertrain: "ice", fuel: "petrol", powertrain_status: "confirmed" },
  });
  const restoreFetch = installVehicleFetchMock({ vehicle: { orgId: ORG, plate: PLATE, catalogId: CATALOG } });
  try {
    const registered = await registerFleetHandlers(client);
    const res = await findHandler(registered, "GET", "/maintenance-categories/quick-jobs")(
      mockContext({ query: { vehicleId: PLATE } }),
    );
    assertEquals(res.status, 200);
    const body = await res.json() as { items?: Record<string, unknown>[] };
    const sys = (body.items ?? []).find((r) => String(r.id) === SYS);
    assert(sys);
    assertEquals(sys!.fitJobCount, 2);
    assertEquals(sys!.hiddenJobCount, 1);
  } finally {
    restoreFetch();
    setJobFitFlag(false);
  }
});

// --- Dominion maintenance jobs admin ---

function adminContext(body: Record<string, unknown>, param: Record<string, string> = {}, query: Record<string, string> = {}) {
  return mockContext({ body, param, query, role: "platform_owner", orgId: ORG, userId: USER });
}

function buildJobsAdminSupabase(capture?: {
  lastJobPatch?: Record<string, unknown>;
  lastRpc?: { name: string; args: Record<string, unknown> };
}) {
  const jobRow = {
    id: USED_JOB,
    kind: "component",
    name: "Used job",
    code: "used_job",
    parent_id: SYS,
    status: "active",
    description: "Desc",
    default_action: "replace",
    field_schema: {},
    icon_key: "wrench",
    is_part: false,
    fits_powertrains: null,
    fits_fuels: null,
    is_high_voltage: false,
  };
  return {
    from(table: string) {
      if (table === "maintenance_service_categories") {
        return {
          select: () => ({
            eq: (col: string, val: string) => ({
              eq: (col2: string, val2: string) => ({
                maybeSingle: () => {
                  if (val === USED_JOB || val === GROUP_SYS) {
                    return Promise.resolve({
                      data: val === GROUP_SYS
                        ? { id: GROUP_SYS, kind: "system" }
                        : jobRow,
                      error: null,
                    });
                  }
                  return Promise.resolve({ data: jobRow, error: null });
                },
              }),
              maybeSingle: () => Promise.resolve({
                data: val === GROUP_SYS ? { id: GROUP_SYS, kind: "system", code: "g", name: "G", fits_powertrains: null, fits_fuels: null } : jobRow,
                error: null,
              }),
              single: () => Promise.resolve({ data: jobRow, error: null }),
            }),
            in: () => Promise.resolve({ data: [jobRow], error: null }),
          }),
          update: (patch: Record<string, unknown>) => {
            if (capture) capture.lastJobPatch = patch;
            return { eq: () => Promise.resolve({ error: null }) };
          },
        };
      }
      if (table === "maintenance_job_relations") {
        return { select: () => Promise.resolve({ data: [], error: null }) };
      }
      if (table === "maintenance_supply" || table === "maintenance_unit" || table === "maintenance_job_item") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
            is: () => ({ eq: () => Promise.resolve({ count: 0 }) }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
        }),
      };
    },
    rpc(name: string, args?: Record<string, unknown>) {
      if (capture) capture.lastRpc = { name, args: args ?? {} };
      if (name === "maintenance_job_used_ids") {
        return Promise.resolve({ data: [USED_JOB], error: null });
      }
      if (name === "job_fit_count") {
        return Promise.resolve({
          data: [{ fits: 1, unknown: 0, total: 2 }],
          error: null,
        });
      }
      if (name === "job_fit_models") {
        return Promise.resolve({ data: [], error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    schema: () => buildJobsAdminSupabase(capture),
  };
}

async function registerAdminHandlers(sb: unknown) {
  const { registered, route } = mockRoute();
  const { registerMaintenanceJobsAdminRoutes } = await loadJobsAdminRoutes();
  registerMaintenanceJobsAdminRoutes(route, sb as SupabaseClient);
  return registered;
}

Deno.test("PATCH job fitsPowertrains validation and used job", async () => {
  const registered = await registerAdminHandlers(buildJobsAdminSupabase());
  const patchJob = findHandler(registered, "PATCH", "/admin/maintenance/jobs/:id");

  for (const [body, expectStatus] of [
    [{ fitsPowertrains: [] }, 400],
    [{ fitsPowertrains: ["ice", "banana"] }, 400],
    [{ isHighVoltage: "yes" }, 400],
  ] as const) {
    const res = await patchJob(adminContext(body, { id: USED_JOB }));
    assertEquals(res.status, expectStatus);
  }

  const capture: { lastJobPatch?: Record<string, unknown> } = {};
  const reg2 = await registerAdminHandlers(buildJobsAdminSupabase(capture));
  const patchJob2 = findHandler(reg2, "PATCH", "/admin/maintenance/jobs/:id");
  let res = await patchJob2(adminContext({ fitsPowertrains: null }, { id: USED_JOB }));
  assertEquals(res.status, 200);
  assertEquals(capture.lastJobPatch?.fits_powertrains, null);

  capture.lastJobPatch = undefined;
  res = await patchJob2(adminContext({ fitsPowertrains: ["ice", "ice", "hev"] }, { id: USED_JOB }));
  assertEquals(res.status, 200);
  assertEquals(capture.lastJobPatch?.fits_powertrains, ["ice", "hev"]);

  capture.lastJobPatch = undefined;
  res = await patchJob2(adminContext({ description: "Still valid description here." }, { id: USED_JOB }));
  assertEquals(res.status, 200);
  assertEquals("fits_powertrains" in (capture.lastJobPatch ?? {}), false);
});

Deno.test("PATCH group fits validation", async () => {
  const registered = await registerAdminHandlers(buildJobsAdminSupabase());
  const patchGroup = findHandler(registered, "PATCH", "/admin/maintenance/groups/:id/fits");

  let res = await patchGroup(adminContext({ isHighVoltage: true }, { id: GROUP_SYS }));
  assertEquals(res.status, 400);
  const b1 = await res.json() as { error?: string };
  assertEquals(b1.error, "Groups can't be marked high-voltage.");

  res = await patchGroup(adminContext({ fitsPowertrains: ["ice"] }, { id: USED_JOB }));
  assertEquals(res.status, 400);

  res = await patchGroup(adminContext({}, { id: GROUP_SYS }));
  assertEquals(res.status, 400);
  const b3 = await res.json() as { error?: string };
  assertEquals(b3.error, "No fit fields to update.");
});

Deno.test("GET fit-count bad override JSON and DB code", async () => {
  const registered = await registerAdminHandlers(buildJobsAdminSupabase());
  const fitCount = findHandler(registered, "GET", "/admin/maintenance/jobs/:id/fit-count");

  let res = await fitCount(adminContext({}, { id: USED_JOB }, { overrides: "not-json" }));
  assertEquals(res.status, 400);
  const bad = await res.json() as { code?: string };
  assertEquals(bad.code, "job_fit_count_bad_override");

  const sb = {
    ...buildJobsAdminSupabase(),
    rpc(name: string) {
      if (name === "job_fit_count") {
        return Promise.resolve({
          data: null,
          error: { message: "job_fit_count_bad_override", hint: "Bad override hint" },
        });
      }
      return Promise.resolve({ data: [USED_JOB], error: null });
    },
    schema() { return sb; },
  };
  const reg2 = await registerAdminHandlers(sb);
  const h2 = findHandler(reg2, "GET", "/admin/maintenance/jobs/:id/fit-count");
  res = await h2(adminContext({}, { id: USED_JOB }));
  assertEquals(res.status, 400);
  const dbBad = await res.json() as { code?: string; error?: string };
  assertEquals(dbBad.code, "job_fit_count_bad_override");
  assertEquals(dbBad.error, "Bad override hint");
});

Deno.test("GET fit-models caps limit at 200", async () => {
  const capture: { lastRpc?: { name: string; args: Record<string, unknown> } } = {};
  const registered = await registerAdminHandlers(buildJobsAdminSupabase(capture));
  const fitModels = findHandler(registered, "GET", "/admin/maintenance/jobs/:id/fit-models");
  const res = await fitModels(adminContext({}, { id: USED_JOB }, { limit: "5000" }));
  assertEquals(res.status, 200);
  assertEquals(capture.lastRpc?.args.p_limit, 200);
});

// --- Vehicle catalog powertrain ---

function buildCatalogSupabase(capture?: {
  lastUpdate?: Record<string, unknown>;
  selectCalls?: Array<{ head?: boolean; count?: string }>;
}) {
  const self = {
    from(table: string) {
      if (table !== "vehicle_catalog") {
        return { select: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }) };
      }
      return {
        update: (patch: Record<string, unknown>) => {
          if (capture) capture.lastUpdate = patch;
          return {
            eq: () => ({
              select: () => ({
                maybeSingle: () => Promise.resolve({
                  data: {
                    id: CATALOG_ROW,
                    make: "Toyota",
                    model: "Roomy",
                    powertrain: patch.powertrain,
                    fuel: patch.fuel,
                    powertrain_status: patch.powertrain_status,
                    powertrain_note: patch.powertrain_note,
                    powertrain_last_confirmed_by: patch.powertrain_last_confirmed_by,
                    powertrain_last_confirmed_at: patch.powertrain_last_confirmed_at,
                  },
                  error: null,
                }),
              }),
            }),
          };
        },
        select: (_c?: unknown, opts?: { count?: string; head?: boolean }) => {
          if (capture) capture.selectCalls = capture.selectCalls ?? [];
          capture.selectCalls.push({ head: opts?.head, count: opts?.count });
          const chain = {
            eq: () => chain,
          };
          (chain as { then: typeof Promise.prototype.then }).then = (onFulfilled) =>
            Promise.resolve({ count: 100, error: null }).then(onFulfilled);
          return chain;
        },
      };
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
    schema: () => self,
  };
  return self;
}

async function registerCatalogHandlers(sb: unknown) {
  const { registered, route } = mockRoute();
  const { registerVehicleCatalogWriteRoutes } = await loadVehicleCatalogWriteRoutes();
  registerVehicleCatalogWriteRoutes(route, sb as SupabaseClient);
  return registered;
}

Deno.test("PATCH vehicle-catalog powertrain codes and confirm", async () => {
  const registered = await registerCatalogHandlers(buildCatalogSupabase());
  const patchPowertrain = findHandler(registered, "PATCH", "/make-server-37f42386/admin/vehicle-catalog/:id/powertrain");

  let res = await patchPowertrain(adminContext({ powertrain: "nope", fuel: "petrol" }, { id: CATALOG_ROW }));
  assertEquals(res.status, 400);

  const capture: { lastUpdate?: Record<string, unknown> } = {};
  const reg2 = await registerCatalogHandlers(buildCatalogSupabase(capture));
  const h2 = findHandler(reg2, "PATCH", "/make-server-37f42386/admin/vehicle-catalog/:id/powertrain");
  res = await h2(adminContext({ powertrain: "hev", fuel: "petrol" }, { id: CATALOG_ROW }));
  assertEquals(res.status, 200);
  assertEquals(capture.lastUpdate?.powertrain_status, "confirmed");
  assertEquals(capture.lastUpdate?.powertrain_note, null);
  assertEquals(capture.lastUpdate?.powertrain_last_confirmed_by, USER);
});

Deno.test("GET powertrain-summary uses count queries and 7 codes", async () => {
  const capture: { selectCalls?: Array<{ head?: boolean; count?: string }> } = {};
  const registered = await registerCatalogHandlers(buildCatalogSupabase(capture));
  const powertrainSummary = findHandler(registered, "GET", "/make-server-37f42386/admin/vehicle-catalog/powertrain-summary");
  const res = await powertrainSummary(adminContext({}));
  assertEquals(res.status, 200);
  const body = await res.json() as { total?: number; needsCheck?: number; byPowertrain?: Record<string, number> };
  assert(capture.selectCalls?.length);
  assert(capture.selectCalls!.every((c) => c.head === true && c.count === "exact"));
  assertEquals(Object.keys(body.byPowertrain ?? {}).sort().join(","), "bev,erev,fcev,hev,ice,mhev,phev");
});

// --- Done-test 8: save edit preserves old line ---

Deno.test("Done-test 8: PATCH service edit with old line returns 200 intact", async () => {
  const componentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac";
  let saveCalled = false;
  const recordRow = {
    id: RECORD_ID,
    status: "In progress",
    organization_id: ORG,
    vehicle_id: PLATE,
    work_order_id: WO_ID,
    payload_json: { lines: [{ id: LINE_ID, componentId }] },
    currency: "JMD",
    performed_at_date: "2026-01-01",
    performed_at_miles: 1000,
  };
  const supabase = {
    from(table: string) {
      if (table === "maintenance_work_order_lines") {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: [{ id: LINE_ID }], error: null }),
            in: () => Promise.resolve({ data: [], error: null }),
          }),
        };
      }
      const chain: Record<string, unknown> = {};
      const mk = () => chain;
      chain.select = mk;
      chain.eq = mk;
      chain.in = () => Promise.resolve({ data: [], error: null });
      chain.order = () => Promise.resolve({ data: [], error: null });
      chain.maybeSingle = () => {
        if (table === "maintenance_records") {
          return Promise.resolve({ data: recordRow, error: null });
        }
        if (table === "maintenance_work_orders") {
          return Promise.resolve({ data: { id: WO_ID, discount_amount: 0, version: 1 }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      };
      const updateChain = {
        eq: () => updateChain,
        select: () => ({
          single: () => Promise.resolve({ data: recordRow, error: null }),
        }),
      };
      chain.update = () => updateChain;
      return chain;
    },
    rpc: (name: string) => {
      if (name === "fleet_save_work_order") {
        saveCalled = true;
        return Promise.resolve({
          data: {
            work_order: { id: WO_ID, version: 2 },
            lines: [{ id: LINE_ID, sort_order: 0, fit_at_log: null, component_id: componentId }],
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    },
    schema: () => supabase,
  };
  try {
    setJobFitFlag(false);
    featureFlagCache.set(`flag:${FEATURE_FLAGS.SERVICE_ITEMS}`, {
      enabled: false,
      updatedAt: new Date().toISOString(),
    });
    const registered = await registerFleetHandlers(supabase);
    const edit = findHandler(registered, "PATCH", "/maintenance-logs/:vehicleId/:id");
    const res = await edit(mockContext({
      body: {
        expectedVersion: 1,
        lines: [{ id: LINE_ID, componentId, qty: 1 }],
      },
      param: { vehicleId: PLATE, id: RECORD_ID },
      userId: USER,
    }));
    if (res.status !== 200) {
      const errBody = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(`PATCH failed ${res.status}: ${errBody.error ?? JSON.stringify(errBody)}`);
    }
    assertEquals(res.status, 200);
    assertEquals(saveCalled, true);
    const body = await res.json() as { lines?: Array<{ id?: string }> };
    assertEquals(body.lines?.[0]?.id, LINE_ID);
  } finally {
    setJobFitFlag(false);
  }
});

Deno.test("groupFitCounts treats unknown as fitting", async () => {
  ensureSupabaseEnv();
  const { groupFitCounts } = await loadMaintenanceRoutes();
  const map = new Map<string, "yes" | "no" | "unknown">([
    ["a", "yes"],
    ["b", "no"],
    ["c", "unknown"],
  ]);
  const c = groupFitCounts(map, ["a", "b", "c"]);
  assertEquals(c.fitJobCount, 2);
  assertEquals(c.hiddenJobCount, 1);
});

Deno.test("groupFitCounts empty children", async () => {
  ensureSupabaseEnv();
  const { groupFitCounts } = await loadMaintenanceRoutes();
  const map = new Map<string, "yes" | "no" | "unknown">();
  const c = groupFitCounts(map, []);
  assertEquals(c.fitJobCount, 0);
  assertEquals(c.hiddenJobCount, 0);
});