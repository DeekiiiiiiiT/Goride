/**
 * Dominion vehicle-database responses must not carry a customer.
 * deno test supabase/functions/_fleet-server/catalog_privacy.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { findCustomerIdentityLeak } from "./catalog_parts_shape.ts";
import { registerCatalogRoutes } from "./catalog_routes.ts";
import { registerPartsEnterpriseRoutes } from "./parts_enterprise_routes.ts";

const CUSTOMER_TABLES = new Set([
  "part_rule_review",
  "part_number_link_review",
  "parts_sourcing_requests",
  "fleet_vehicles",
  "organizations",
  "part_fit_feedback",
  "maintenance_work_order_lines",
]);

const FORBIDDEN = [
  "organization_id",
  "organizationId",
  "work_order_line_id",
  "latest_need_text",
  "need_text",
  "fleetVehicle",
  "customer_name",
  "vehicle_id",
  "fleet_vehicle_id",
];

Deno.test("catalog answers hide a customer", () => {
  assertEquals(findCustomerIdentityLeak({
    id: "lead-request",
    proposed_make: "Toyota",
    fleet_count: 3,
  }), null);
  assertEquals(findCustomerIdentityLeak({ organization_id: "org" }) != null, true);
  assertEquals(findCustomerIdentityLeak({ fleetVehicle: { id: "v" } }) != null, true);
  assertEquals(findCustomerIdentityLeak({
    universal: [{ specKey: "wiper_driver_mm", label: "Wiper, driver side", value: "525", unit: "mm", items: [] }],
  }), null);
  assertEquals(findCustomerIdentityLeak({ work_order_line_id: "line" }) != null, true);
  assertEquals(findCustomerIdentityLeak({ latest_need_text: "call me" }) != null, true);
});

Deno.test("Dominion vehicle-database routes hide customer rows", async () => {
  const registered: Array<{ method: string; path: string; handler: (c: unknown) => Promise<unknown> }> = [];
  const route = {
    get(path: string, ...handlers: unknown[]) {
      registered.push({ method: "GET", path, handler: handlers[handlers.length - 1] as (c: unknown) => Promise<unknown> });
    },
    post(path: string, ...handlers: unknown[]) {
      registered.push({ method: "POST", path, handler: handlers[handlers.length - 1] as (c: unknown) => Promise<unknown> });
    },
    patch(path: string, ...handlers: unknown[]) {
      registered.push({ method: "PATCH", path, handler: handlers[handlers.length - 1] as (c: unknown) => Promise<unknown> });
    },
    delete() {},
  };
  const supabase = stubSupabase() as unknown as SupabaseClient;
  registerCatalogRoutes(route, supabase);
  registerPartsEnterpriseRoutes(route, supabase);

  const paths = registered.map((row) => `${row.method} ${row.path}`);
  for (const banned of [
    "/admin/org-part-stock",
    "/admin/parts-sourcing-requests",
    "/admin/part-cores",
    "/admin/part-repeat-alerts",
    "/admin/part-warranty-claims",
    "/admin/part-quotes",
    "/admin/part-link-reviews",
  ]) {
    if (paths.some((path) => path.includes(banned))) {
      throw new Error(`Dominion still registers ${banned}`);
    }
  }

  const vehicleRoutes = registered.filter((row) =>
    row.method === "GET" && (
      row.path.includes("/catalog/")
      || row.path.includes("/admin/part-rule-reviews")
      || row.path.includes("/admin/part-rule-proposals")
      || row.path.includes("/admin/part-catalog-review")
      || row.path.includes("/admin/platform-family-review")
      || row.path.includes("/admin/vehicle-platforms")
      || row.path.includes("/admin/engine-families")
      || row.path.includes("/admin/service-components")
      || row.path.includes("/admin/catalog-variants")
    )
  );
  if (vehicleRoutes.length < 8) throw new Error("expected the Dominion vehicle-database routes");

  for (const row of vehicleRoutes) {
    const result = await row.handler(fakeContext(row.path)) as { body?: unknown; status?: number };
    const leak = findCustomerIdentityLeak(result?.body);
    if (leak) throw new Error(`${row.path} leaked ${leak}`);
    const error = (result?.body as { error?: string } | undefined)?.error ?? "";
    if (error.includes("customer field")) throw new Error(`${row.path} tried to return a customer`);
  }
});

function fakeContext(path: string) {
  const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
  return {
    req: {
      path,
      header: () => null,
      param: () => id,
      query: (key: string) => {
        if (key === "q") return "toyota";
        if (key === "variantId") return id;
        if (key === "kind") return "variant";
        if (key === "id") return id;
        return "";
      },
      json: async () => ({}),
    },
    get: (key: string) => key === "rbacUser"
      ? { userId: "staff", id: "staff", resolvedRole: "platform_owner", rawRole: "platform_owner" }
      : undefined,
    json: (body: unknown, status = 200) => ({ body, status }),
  };
}

function stubSupabase() {
  return {
    from(table: string) {
      return query(table, "*");
    },
    rpc(name: string) {
      if (name === "catalog_coverage_matrix") {
        return Promise.resolve({ data: { variants: [], inUseReadyPct: 0, allReadyPct: 0 }, error: null });
      }
      if (name === "catalog_blast_radius") {
        return Promise.resolve({ data: [{ variant_count: 1, make_count: 1 }], error: null });
      }
      if (name === "parts_for_vehicle") return Promise.resolve({ data: [], error: null });
      return Promise.resolve({ data: [], error: null });
    },
  };
}

function query(table: string, columns: string) {
  const payload = () => ({ data: [rowFor(table, columns)], error: null });
  const one = () => ({ data: rowFor(table, columns), error: null });
  const builder: Record<string, unknown> = {
    select: (cols: string) => query(table, cols),
    eq: () => builder,
    neq: () => builder,
    in: () => builder,
    or: () => builder,
    is: () => builder,
    order: () => builder,
    limit: () => builder,
    maybeSingle: () => Promise.resolve(one()),
    single: () => Promise.resolve(one()),
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(payload()).then(resolve, reject),
  };
  return builder;
}

function rowFor(table: string, columns: string) {
  const dirty: Record<string, unknown> = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    organization_id: "org-secret",
    work_order_line_id: "line-secret",
    latest_need_text: "customer wording",
    need_text: "customer wording",
    fleetVehicle: { id: "vehicle-secret" },
    customer_name: "Pat",
    vehicle_id: "vehicle-secret",
    fleet_vehicle_id: "vehicle-secret",
    make: "Toyota",
    model: "Noah",
    name: "Oil filter",
    code: "NZE141",
    label: "Noah",
    op_code: "BRK-PADS",
    chassis_code: "NZE141",
    notes: "Leave blank",
    share_body_parts: null,
    suggested_family: "NZE141",
    car_name: "Axio",
    group_key: "nze141",
    part_kind: "oem",
    catalog_decision: "pending",
    vehicle_class: "car",
    platform_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
    engine_family_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
    part_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4",
    vehicle_catalog_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    variant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    fit_count: 3,
    status: "proposed",
    kind: "component",
    oem_part_number: "90915",
    manufacturer: "Toyota",
    parent_id: null,
    ready: false,
    open_count: 2,
    fleet_count: 2,
    vehicle_count: 2,
    refreshed_at: null,
    part_number: "90915",
    component_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5",
    occurrences: 2,
    fitmentId: "fit",
    target_kind: "platform",
  };
  const clean = { ...dirty };
  for (const key of FORBIDDEN) delete clean[key];
  const source = CUSTOMER_TABLES.has(table) ? dirty : clean;
  const pieces = columns.split(",").map((piece) => piece.trim()).filter(Boolean);
  if (pieces.some((piece) => piece === "*")) return { ...source };
  const out: Record<string, unknown> = {};
  for (const piece of pieces) {
    const name = piece.split("(")[0].trim();
    if (!name) continue;
    if (FORBIDDEN.includes(name)) {
      out[name] = dirty[name];
      continue;
    }
    if (piece.includes("(")) {
      const inner = piece.slice(piece.indexOf("(") + 1, piece.lastIndexOf(")"));
      out[name] = rowFor(name, inner);
      continue;
    }
    if (name in source) out[name] = source[name];
  }
  return out;
}
