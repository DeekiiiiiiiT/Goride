/**
 * Service items Round S5 — code-review fixes (F1–F4, F6, F8, F10).
 * deno test --no-check supabase/functions/_fleet-server/service_items_s5.test.ts
 */
import { assertEquals } from "jsr:@std/assert@1";
import type { Context } from "npm:hono@4.3.11";
import { resolveMaintenanceLogIdempotencyKey } from "../../../packages/types/src/maintenanceLogIdempotency.ts";
import {
  buildClientPayloadLines,
  prepareWorkOrderLines,
} from "./service_items_save.ts";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const VEHICLE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const RECORD_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const WO_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const LINE_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const LOG_ID = "11111111-1111-4111-8111-111111111101";

function ensureSupabaseEnv() {
  if (!Deno.env.get("SUPABASE_URL")) Deno.env.set("SUPABASE_URL", "http://127.0.0.1:54321");
  if (!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
  }
}

async function loadMaintenanceRoutes() {
  ensureSupabaseEnv();
  return await import("./maintenance_routes.ts");
}

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
      patch(path: string, ...handlers: unknown[]) {
        registered.push({
          method: "PATCH",
          path,
          handler: handlers[handlers.length - 1] as RouteRow["handler"],
        });
      },
      put(path: string, ...handlers: unknown[]) {
        registered.push({
          method: "PUT",
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
    request: async () => new Response(null, { status: 404 }),
  };
}

function mockContext(
  body: Record<string, unknown>,
  param: Record<string, string> = {},
  query: Record<string, string> = {},
) {
  const token = `Bearer x.${btoa(JSON.stringify({ aal: "aal2" }))}.y`;
  const rbacUser = {
    userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab",
    organizationId: ORG,
    resolvedRole: "fleet_owner",
    permissions: ["vehicles.edit", "*"],
  };
  return {
    get: (key: string) => (key === "rbacUser" ? rbacUser : undefined),
    json: (payload: unknown, status?: number) =>
      new Response(JSON.stringify(payload), { status: status ?? 200 }),
    req: {
      header: () => token,
      json: async () => body,
      param: (name: string) => param[name] ?? "",
      query: (name: string) => query[name] ?? "",
      path: "/fleet-ops/maintenance-logs",
    },
    param: (name: string) => param[name] ?? "",
    env: {},
  } as unknown as Context;
}

Deno.test("F6 resolveMaintenanceLogIdempotencyKey uses log id when uuid", () => {
  assertEquals(resolveMaintenanceLogIdempotencyKey({ id: LOG_ID }), LOG_ID);
  assertEquals(
    resolveMaintenanceLogIdempotencyKey({ id: LOG_ID, idempotencyKey: "keep-me" }),
    "keep-me",
  );
  const noId = resolveMaintenanceLogIdempotencyKey({ vehicleId: VEHICLE });
  assertEquals(noId.length > 10, true);
  assertEquals(noId === LOG_ID, false);
});

Deno.test("F8 prepareWorkOrderLines rejects non-object line", async () => {
  const sb = { from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }) } as never;
  const r = await prepareWorkOrderLines(sb, {
    orgId: ORG,
    vehicleId: VEHICLE,
    workOrderId: null,
    rawLines: [null],
    itemsEnabled: true,
  });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.code, "line_invalid");
});

Deno.test("F3 buildClientPayloadLines pairs by sort_order", () => {
  const client = [{ componentId: "j1", qty: 1 }, { componentId: "j2" }];
  const saved = [
    { id: LINE_ID, sort_order: 0 },
    { id: "ffffffff-ffff-4fff-8fff-ffffffffffff", sort_order: 1 },
  ];
  const merged = buildClientPayloadLines(client, saved);
  assertEquals(merged[0].id, LINE_ID);
  assertEquals(merged[1].id, "ffffffff-ffff-4fff-8fff-ffffffffffff");
});

Deno.test("F1 POST idempotent replay returns enriched lines", async () => {
  const supabase = {
    from(table: string) {
      const chain = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        order: () => chain,
        maybeSingle: () => {
          if (table === "maintenance_work_orders") {
            return Promise.resolve({
              data: { id: WO_ID, status: "completed", maintenance_record_id: RECORD_ID },
              error: null,
            });
          }
          if (table === "maintenance_records") {
            return Promise.resolve({ data: { id: RECORD_ID }, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        single: () => Promise.resolve({ data: {}, error: null }),
        insert: () => chain,
        update: () => chain,
        delete: () => chain,
      };
      if (table === "maintenance_work_order_lines") {
        return {
          select: () => ({
            eq: () => ({
              order: () => Promise.resolve({
                data: [{
                  id: LINE_ID,
                  sort_order: 0,
                  component_name: "Oil change",
                  items_amount: 12,
                  line_total: 100,
                }],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "maintenance_work_order_line_item") {
        return {
          select: () => ({
            in: () => ({
              order: () => Promise.resolve({
                data: [{
                  work_order_line_id: LINE_ID,
                  item_name: "Filter",
                  source: "other",
                  item_kind: "supply",
                  qty: "1",
                }],
                error: null,
              }),
            }),
          }),
        };
      }
      return chain;
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
    schema: () => supabase,
  };
  const { registered, route } = mockRoute();
  const { registerMaintenanceRoutes } = await loadMaintenanceRoutes();
  registerMaintenanceRoutes(route, supabase as never);
  const create = registered.find((r) => r.method === "POST" && r.path === "/maintenance-logs");
  if (!create) throw new Error("POST maintenance-logs missing");

  const res = await create.handler(mockContext({
    vehicleId: VEHICLE,
    id: LOG_ID,
    odo: 1000,
    idempotencyKey: LOG_ID,
    lines: [{ componentId: "j", qty: 1 }],
  }));
  assertEquals(res.status, 200);
  const body = await res.json() as { lines?: Record<string, unknown>[]; idempotentReplay?: boolean };
  assertEquals(body.idempotentReplay, true);
  const line = body.lines?.[0] as Record<string, unknown> | undefined;
  assertEquals(line?.componentName, "Oil change");
  assertEquals(line?.itemsAmount, 12);
  assertEquals(Array.isArray(line?.items), true);
  assertEquals((line?.items as unknown[])?.length, 1);
});

Deno.test("F2 PATCH without work order does not require version", async () => {
  let saveCalled = false;
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
                status: "In progress",
                organization_id: ORG,
                vehicle_id: VEHICLE,
                work_order_id: null,
                payload_json: { lines: [] },
                currency: "JMD",
              },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        },
        update: () => base,
        insert: () => base,
        single: () => Promise.resolve({ data: {}, error: null }),
        order: () => base,
      };
      return base;
    },
    rpc: (name: string) => {
      if (name === "fleet_save_work_order") saveCalled = true;
      return Promise.resolve({
        data: {
          work_order: { id: WO_ID },
          lines: [{ id: LINE_ID, sort_order: 0 }],
        },
        error: null,
      });
    },
    schema: () => supabase,
  };
  const { registered, route } = mockRoute();
  const { registerMaintenanceRoutes } = await loadMaintenanceRoutes();
  registerMaintenanceRoutes(route, supabase as never);
  const edit = registered.find((r) => r.method === "PATCH" && r.path === "/maintenance-logs/:vehicleId/:id");
  if (!edit) throw new Error("PATCH missing");

  const res = await edit.handler(mockContext(
    {
      odo: 1000,
      lines: [{ componentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac", qty: 1 }],
    },
    { vehicleId: VEHICLE, id: RECORD_ID },
  ));
  assertEquals(res.status !== 428, true);
  assertEquals(saveCalled, true);
});

Deno.test("F4 PATCH package_complete only when body includes flag", () => {
  const routesUrl = new URL("./maintenance_routes.ts", import.meta.url);
  const src = Deno.readTextFileSync(routesUrl);
  assertEquals(
    src.includes("body.packageComplete !== undefined || body.package_complete !== undefined"),
    true,
  );
  const patchBlock = src.slice(
    src.indexOf("const pWorkOrder: Record<string, unknown> = {"),
    src.indexOf("const saveRes = await callSaveWorkOrder", src.indexOf("rawEditLines.length || isUuid(editWorkOrderId)")),
  );
  assertEquals(patchBlock.includes("package_complete: body.packageComplete === true"), false);
});

Deno.test("F10 GET maintenance-requests returns version on rows", async () => {
  const supabase = {
    from(table: string) {
      if (table === "maintenance_records") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => Promise.resolve({
                    data: [{
                      id: RECORD_ID,
                      work_order_id: WO_ID,
                      payload_json: { workOrderId: WO_ID },
                    }],
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "maintenance_work_orders") {
        return {
          select: () => ({
            in: () => Promise.resolve({
              data: [{ id: WO_ID, version: 3 }],
              error: null,
            }),
          }),
        };
      }
      return {
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
      };
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
    schema: () => supabase,
  };
  const { registered, route } = mockRoute();
  const { registerMaintenanceRoutes } = await loadMaintenanceRoutes();
  registerMaintenanceRoutes(route, supabase as never);
  const list = registered.find((r) => r.method === "GET" && r.path === "/maintenance-requests");
  if (!list) throw new Error("GET maintenance-requests missing");

  const res = await list.handler(mockContext({}, {}, { status: "Requested" }));
  assertEquals(res.status, 200);
  const body = await res.json() as { data?: Array<{ version?: number }> };
  assertEquals(body.data?.[0]?.version, 3);
});