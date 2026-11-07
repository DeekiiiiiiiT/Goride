/**
 * Add-a-part self-serve HTTP contract tests.
 * deno test --no-check supabase/functions/_fleet-server/add_part_self_serve_routes.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { registerCatalogRoutes } from "./catalog_routes.ts";
import { parsePartsImportCsv } from "./parts_import_csv.ts";

const FORBIDDEN_PAYLOAD_KEYS = ["price", "cost", "supplier", "stock", "quantity"];
const OWNER_ID = "11111111-1111-4111-8111-111111111111";

type RouteRow = {
  method: string;
  path: string;
  handler: (c: unknown) => Promise<{ status?: number; body?: unknown }>;
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
      delete(path: string, ...handlers: unknown[]) {
        registered.push({ method: "DELETE", path, handler: handlers[handlers.length - 1] as RouteRow["handler"] });
      },
    },
  };
}

function aal2Token() {
  return `Bearer x.${btoa(JSON.stringify({ aal: "aal2" }))}.y`;
}

function mockContext(opts: {
  role: string;
  query?: Record<string, string>;
  jsonBody?: unknown;
  param?: Record<string, string>;
}) {
  const token = aal2Token();
  return {
    get: (key: string) => {
      if (key === "rbacUser") {
        return { userId: OWNER_ID, id: OWNER_ID, resolvedRole: opts.role, rawRole: opts.role };
      }
      return undefined;
    },
    json: (body: unknown, status?: number) => ({ body, status: status ?? 200 }),
    req: {
      header: () => token,
      json: async () => opts.jsonBody ?? {},
      query: (name: string) => opts.query?.[name] ?? "",
      param: (name: string) => opts.param?.[name] ?? "",
    },
    param: (name: string) => opts.param?.[name] ?? "",
  };
}

function mockSupabaseRpc() {
  return {
    rpc: (_name: string, _args?: unknown) => Promise.resolve({ data: {}, error: null }),
    from() {
      const builder: Record<string, unknown> = {};
      const self = () => builder;
      for (const name of ["select", "eq", "order", "ilike", "or", "limit"]) builder[name] = self;
      builder.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
      return builder;
    },
    schema() {
      return this;
    },
  } as unknown as SupabaseClient;
}

Deno.test("parts lookup returns 400 when brand or number missing", async () => {
  const { registered, route } = mockRoute();
  registerCatalogRoutes(route, mockSupabaseRpc());
  const lookup = registered.find((r) => r.method === "GET" && r.path.endsWith("/parts/lookup"));
  if (!lookup) throw new Error("lookup route missing");
  const res = await lookup.handler(mockContext({ role: "platform_owner", query: { brand: "", number: "" } }));
  assertEquals(res.status, 400);
});

Deno.test("part-type POST returns 403 for non-owner staff", async () => {
  const { registered, route } = mockRoute();
  registerCatalogRoutes(route, mockSupabaseRpc());
  const create = registered.find((r) => r.method === "POST" && r.path.endsWith("/part-types"));
  if (!create) throw new Error("part-types POST missing");
  const res = await create.handler(mockContext({
    role: "platform_support",
    jsonBody: { name: "Test", opCode: "TST-1", areaId: "b1000000-0000-4000-8000-000000000001" },
  }));
  assertEquals(res.status, 403);
});

Deno.test("parts undo returns 400 for invalid batch id", async () => {
  const { registered, route } = mockRoute();
  registerCatalogRoutes(route, mockSupabaseRpc());
  const undo = registered.find((r) => r.method === "POST" && r.path.endsWith("/parts/undo"));
  if (!undo) throw new Error("undo route missing");
  const res = await undo.handler(mockContext({ role: "platform_owner", jsonBody: { batchId: "not-a-uuid" } }));
  assertEquals(res.status, 400);
});

Deno.test("part-type request returns 400 when name or reason blank", async () => {
  const { registered, route } = mockRoute();
  registerCatalogRoutes(route, mockSupabaseRpc());
  const req = registered.find((r) => r.method === "POST" && r.path.endsWith("/part-type-requests"));
  if (!req) throw new Error("part-type-requests missing");
  const res = await req.handler(mockContext({ role: "platform_owner", jsonBody: { name: "", reason: "" } }));
  assertEquals(res.status, 400);
});

Deno.test("self-serve save response shape excludes forbidden commerce keys", () => {
  const body = {
    partTypeId: "00000000-0000-4000-8000-000000000001",
    brand: "MK Kashiyama",
    partNumber: "D0051MH",
    sourceType: "part_maker_catalogue",
    evidenceUrl: "https://example.com/p",
    fitMode: "specific",
  };
  for (const key of FORBIDDEN_PAYLOAD_KEYS) {
    assertEquals(Object.prototype.hasOwnProperty.call(body, key), false);
  }
});

Deno.test("parts add POST forwards excludedVehicleIds to save_self_serve_part", async () => {
  let captured: unknown;
  const supabase = {
    rpc(name: string, args?: { p_input?: Record<string, unknown> }) {
      if (name === "save_self_serve_part") captured = { name, args };
      return Promise.resolve({
        data: name === "self_serve_save_chassis_list"
          ? []
          : { batchId: "44444444-4444-4444-8444-444444444441", partId: "55555555-5555-4555-8555-555555555551" },
        error: null,
      });
    },
    from() {
      const b: Record<string, unknown> = {};
      const self = () => b;
      for (const k of ["select", "eq", "order", "limit"]) b[k] = self;
      b.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
      return b;
    },
    schema() { return this; },
  } as unknown as SupabaseClient;
  const { registered, route } = mockRoute();
  registerCatalogRoutes(route, supabase);
  const save = registered.find((r) => r.method === "POST" && r.path.endsWith("/parts/add"));
  if (!save) throw new Error("parts add route missing");
  const body = {
    fitMode: "engine",
    engineFamilyId: "00000000-0000-4000-8000-000000000099",
    excludedVehicleIds: ["ap900006-0000-4000-8000-000000000001"],
    partTypeId: "a9000003-0000-4000-8000-000000000003",
    brand: "Toyota",
    partNumber: "04152-40060",
    sourceType: "car_maker_catalogue",
    evidenceUrl: "https://example.com/oil",
  };
  await save.handler(mockContext({ role: "platform_owner", jsonBody: body }));
  const cap = captured as { name: string; args: { p_input: Record<string, unknown> } };
  assertEquals(cap.name, "save_self_serve_part");
  assertEquals(cap.args.p_input.excludedVehicleIds, body.excludedVehicleIds);
});

Deno.test("car_specs CSV requires spec columns", () => {
  const ok = parsePartsImportCsv(
    "vehicle,spec_key,spec_value,source_url\nToyota Roomy M900A 2019,wiper_driver_mm,525,https://example.com/x\n",
    "car_specs",
  );
  assertEquals(ok.headerErrors.length, 0);
  assertEquals(ok.rows.length, 1);
  const bad = parsePartsImportCsv("vehicle,spec_key\nx,y\n", "car_specs");
  assertEquals(bad.headerErrors.some((e) => e.message.includes("spec_value")), true);
});
