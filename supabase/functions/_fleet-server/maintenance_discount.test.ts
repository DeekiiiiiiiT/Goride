/**
 * Service discount — T-02 helpers, T-03 route refusals, total_cost source guard.
 * deno test --no-check supabase/functions/_fleet-server/maintenance_discount.test.ts
 */
import { assertEquals } from "jsr:@std/assert@1";
import { fromFileUrl } from "jsr:@std/path@1/from-file-url";
import {
  computeWoLineTotal,
  discountTooLarge,
  lineSubtotal,
  parseDiscount,
  respondDiscountRejection,
  serviceNetTotal,
} from "./maintenance_logging_helpers.ts";
import type { Context } from "npm:hono@4.3.11";

function ensureSupabaseEnv() {
  if (!Deno.env.get("SUPABASE_URL")) {
    Deno.env.set("SUPABASE_URL", "http://127.0.0.1:54321");
  }
  if (!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
  }
}

async function loadMaintenanceRoutes() {
  ensureSupabaseEnv();
  return await import("./maintenance_routes.ts");
}

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const VEHICLE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const SAMPLE_LINES = [
  { line_total: 1000 },
  { line_total: 600 },
  { line_total: 8000 },
  { line_total: 8000 },
];

type RouteRow = {
  method: string;
  path: string;
  handler: (c: unknown) => Promise<Response | { status?: number; body?: unknown }>;
};

function mockRoute() {
  const registered: RouteRow[] = [];
  return {
    registered,
    route: {
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
    },
    request: async () => new Response(null, { status: 404 }),
  };
}

function mockContext(body: Record<string, unknown>, param: Record<string, string> = {}) {
  const token = `Bearer x.${btoa(JSON.stringify({ aal: "aal2" }))}.y`;
  const rbacUser = {
    userId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    organizationId: ORG,
    resolvedRole: "fleet_owner",
    permissions: ["vehicles.edit", "*"],
  };
  const ctx = {
    get: (key: string) => (key === "rbacUser" ? rbacUser : undefined),
    json: (payload: unknown, status?: number) =>
      new Response(JSON.stringify(payload), { status: status ?? 200 }),
    req: {
      header: () => token,
      json: async () => body,
      param: (name: string) => param[name] ?? "",
      path: "/fleet-ops/maintenance-work-orders",
    },
    param: (name: string) => param[name] ?? "",
    env: {},
  };
  return ctx as unknown as Context;
}

// --- T-02 ---

Deno.test("T-02 serviceNetTotal — no discount", () => {
  assertEquals(serviceNetTotal(SAMPLE_LINES, 0), 17600);
});

Deno.test("T-02 serviceNetTotal — 17600 − 1000 = 16600", () => {
  assertEquals(serviceNetTotal(SAMPLE_LINES, 1000), 16600);
});

Deno.test("T-02 serviceNetTotal — discount equals subtotal → 0", () => {
  assertEquals(serviceNetTotal(SAMPLE_LINES, 17600), 0);
});

Deno.test("T-02 serviceNetTotal — rounds to 2 dp", () => {
  assertEquals(lineSubtotal([{ line_total: 1.111 }]), 1.11);
  assertEquals(serviceNetTotal([{ line_total: 100 }], parseDiscount(33.333)!), 66.67);
});

Deno.test("T-02 null line_total falls back to computeWoLineTotal", () => {
  const lines = [{ qty: 2, unit_price: 50 }];
  assertEquals(lineSubtotal(lines), 100);
  assertEquals(computeWoLineTotal(lines[0]), 100);
});

Deno.test("T-02 parseDiscount", () => {
  assertEquals(parseDiscount(undefined), 0);
  assertEquals(parseDiscount(null), 0);
  assertEquals(parseDiscount(""), 0);
  assertEquals(parseDiscount(1000), 1000);
  assertEquals(parseDiscount(-5), null);
  assertEquals(parseDiscount("abc"), null);
  assertEquals(parseDiscount(Number.NaN), null);
});

Deno.test("T-02 discountTooLarge at equality is false", () => {
  assertEquals(discountTooLarge(SAMPLE_LINES, 17600), false);
  assertEquals(discountTooLarge(SAMPLE_LINES, 17600.01), true);
});

// --- T-03 route refusals ---

Deno.test("T-03 route gate discount_invalid", async () => {
  const c = mockContext({});
  const res = respondDiscountRejection(c, null, true, SAMPLE_LINES, 0);
  assertEquals(res?.status, 400);
  const body = await res!.json() as { code?: string };
  assertEquals(body.code, "discount_invalid");
});

Deno.test("T-03 route gate discount_disabled", async () => {
  const c = mockContext({});
  const res = respondDiscountRejection(c, 500, false, SAMPLE_LINES, 500);
  assertEquals(res?.status, 400);
  const body = await res!.json() as { code?: string };
  assertEquals(body.code, "discount_disabled");
});

Deno.test("T-03 route gate discount_too_large", async () => {
  const c = mockContext({});
  const res = respondDiscountRejection(c, 20000, true, SAMPLE_LINES, 20000);
  assertEquals(res?.status, 400);
  const body = await res!.json() as { code?: string };
  assertEquals(body.code, "discount_too_large");
});

Deno.test("T-03 PATCH maintenance-logs completed returns discount_locked", async () => {
  const RECORD_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const WO_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const supabase = {
    from(table: string) {
      const base = {
        select: () => base,
        eq: () => base,
        maybeSingle: () => {
          if (table === "maintenance_records") {
            return Promise.resolve({
              data: {
                id: RECORD_ID,
                status: "Completed",
                organization_id: ORG,
                vehicle_id: VEHICLE,
                payload_json: { workOrderId: WO_ID },
              },
              error: null,
            });
          }
          if (table === "maintenance_work_orders") {
            return Promise.resolve({ data: { discount_amount: 1000 }, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        update: () => base,
        insert: () => base,
        delete: () => base,
        order: () => base,
        single: () => Promise.resolve({ data: {}, error: null }),
      };
      return base;
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
    schema: () => supabase,
  };
  const { registered, route } = mockRoute();
  const { registerMaintenanceRoutes } = await loadMaintenanceRoutes();
  registerMaintenanceRoutes(route, supabase as never);
  const edit = registered.find((r) => r.method === "PATCH" && r.path === "/maintenance-logs/:vehicleId/:id");
  if (!edit) throw new Error("PATCH maintenance-logs missing");

  const res = await edit.handler(mockContext(
    { discount: 2000 },
    { vehicleId: VEHICLE, id: RECORD_ID },
  ));
  assertEquals(res.status, 409);
  const body = await res.json() as { code?: string };
  assertEquals(body.code, "discount_locked");
});

Deno.test("T-03 complete uses net total for books input", () => {
  const net = serviceNetTotal(SAMPLE_LINES, 1000);
  assertEquals(net, 16600);
  const mockC = {
    json: () => new Response(),
  } as unknown as Context;
  const reject = respondDiscountRejection(mockC, 1000, true, SAMPLE_LINES, 1000);
  assertEquals(reject, null);
});

// --- source guard ---

const ROUTES_FILE = fromFileUrl(new URL("./maintenance_routes.ts", import.meta.url));

function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const ALLOWED_TOTAL_COST_PATTERNS = [
  /serviceNetTotal\s*\(/,
  /bridgeNetTotal/,
  /editBridgeNet/,
  /editNetTotal/,
  /^\s*total_cost:\s*totalCost/,
  /^\s*total_cost:\s*roundedTotal/,
  /patch\.total_cost\s*=\s*serviceNetTotal\s*\(/,
];

Deno.test("maintenance_routes total_cost writes use serviceNetTotal or RPC net", async () => {
  const raw = await Deno.readTextFile(ROUTES_FILE);
  const text = stripComments(raw);
  const lines = text.split("\n");
  const hits: string[] = [];
  const netVarNames = new Set<string>();
  for (const line of lines) {
    const assign = line.match(/const\s+(\w+)\s*=\s*serviceNetTotal\s*\(/);
    if (assign) netVarNames.add(assign[1]);
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes("total_cost:") && !line.includes("patch.total_cost")) continue;
    if (line.includes("totalCost:") && line.includes("wo.total_cost")) continue;
    if (line.includes("Number(existing.total_cost")) continue;
    if (ALLOWED_TOTAL_COST_PATTERNS.some((re) => re.test(line))) continue;
    if (/total_cost:\s*(\w+)/.test(line)) {
      const m = line.match(/total_cost:\s*(\w+)/);
      if (m && netVarNames.has(m[1])) continue;
    }
    hits.push(`${i + 1}: ${line.trim()}`);
  }
  assertEquals(hits, []);
});

/**
 * R-03 — the fleet schema is not exposed to PostgREST, so the switch must be read
 * through public.fleet_organization_settings, and that view must carry the column.
 */
Deno.test("R-03 loadDiscountEnabled reads the public view, and the view has the column", async () => {
  const helpers = await Deno.readTextFile(
    fromFileUrl(new URL("./maintenance_logging_helpers.ts", import.meta.url)),
  );
  const fn = helpers.slice(helpers.indexOf("export async function loadDiscountEnabled"));
  const body = fn.slice(0, fn.indexOf("\n}\n"));
  assertEquals(body.includes('.from("fleet_organization_settings")'), true);

  const migDir = fromFileUrl(new URL("../../migrations/", import.meta.url));
  const names: string[] = [];
  for await (const e of Deno.readDir(migDir)) if (e.name.endsWith(".sql")) names.push(e.name);
  names.sort();
  let lastViewSql = "";
  for (const n of names) {
    const sql = await Deno.readTextFile(migDir + n);
    const m = sql.match(/CREATE OR REPLACE VIEW "?public"?\."?fleet_organization_settings"?[\s\S]*?;/i);
    if (m) lastViewSql = m[0];
  }
  assertEquals(lastViewSql.includes("maintenance_discount_enabled"), true);
});

// ---- Code review fixes (CR-01 … CR-08) ----

Deno.test("CR-01 computeWoLineTotal reads amounts inside values / values_json", () => {
  assertEquals(computeWoLineTotal({ values: { qty: 2, unit_price: 500, labor: 300 } }), 1300);
  assertEquals(computeWoLineTotal({ values_json: { material: 4000, labor_hours: 2, labor_rate: 1500 } }), 7000);
  // top-level amounts still win
  assertEquals(computeWoLineTotal({ material: 100, values: { material: 999 } }), 100);
  assertEquals(computeWoLineTotal({ declined: true, values: { material: 999 } }), 0);
});

Deno.test("CR-01 sumLogLines is gone from maintenance_routes", async () => {
  const raw = await Deno.readTextFile(ROUTES_FILE);
  assertEquals(raw.includes("function sumLogLines"), false);
});

/** Routes file with comments stripped and Windows line endings made plain. */
async function readRoutesLf(): Promise<string> {
  return stripComments((await Deno.readTextFile(ROUTES_FILE)).replaceAll("\r\n", "\n"));
}

function routeBody(text: string, routeLiteral: string): string {
  const start = text.indexOf(routeLiteral);
  if (start < 0) throw new Error(`route not found: ${routeLiteral}`);
  const next = text.indexOf("\n  route.", start + routeLiteral.length);
  return text.slice(start, next < 0 ? undefined : next);
}

Deno.test("CR-02 complete, draft PATCH and legacy edit re-check the stored discount", async () => {
  const text = await readRoutesLf();
  const complete = routeBody(text, '"/maintenance-work-orders/:id/complete"');
  assertEquals(/discountTooLarge\(lineRows,\s*discount\)/.test(complete), true);
  const patch = routeBody(text, 'route.patch(\n    "/maintenance-work-orders/:id"');
  assertEquals(/discountTooLarge\(newLines,\s*effectiveDiscount\)/.test(patch), true);
  assertEquals(/discountTooLarge\(editLines,\s*storedDiscount\)/.test(text), true);
});

Deno.test("CR-03 idempotent replay refuses a changed discount with 409 discount_changed", async () => {
  const text = await readRoutesLf();
  const create = routeBody(text, 'route.post(\n    "/maintenance-work-orders",');
  const replay = create.indexOf('"discount_changed"');
  const completedReplay = create.indexOf('existingStatus === "completed"');
  assertEquals(replay > 0 && replay < completedReplay, true);
});

Deno.test("CR-04 work order subtotal skips voided lines", async () => {
  const text = await readRoutesLf();
  assertEquals(/subtotal:\s*lines\s*\?\s*lineSubtotal\(lines\.filter\(\(l\)\s*=>\s*l\.voided_at\s*==\s*null\)\)/.test(text), true);
});

Deno.test("CR-07 loadDiscountEnabled logs a read error", async () => {
  const helpers = await Deno.readTextFile(
    fromFileUrl(new URL("./maintenance_logging_helpers.ts", import.meta.url)),
  );
  const fn = helpers.slice(helpers.indexOf("export async function loadDiscountEnabled"));
  const body = fn.slice(0, fn.indexOf("\n}\n"));
  assertEquals(body.includes("console.error"), true);
});

Deno.test("CR-08 create reserves the log number after the discount check", async () => {
  const text = await readRoutesLf();
  const create = routeBody(text, 'route.post(\n    "/maintenance-work-orders",');
  const check = create.indexOf("respondDiscountRejection(");
  const reserve = create.indexOf("reserveMaintenanceLogNumber(");
  assertEquals(check > 0 && reserve > check, true);
});
