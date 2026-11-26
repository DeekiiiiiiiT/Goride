/**
 * S1b: G9 must not break the Log service. A used draft part type (still in a package or a schedule) stays in both
 * Log service reads; an unused draft (made by Roam, then "Don't track") is hidden there and from Find parts.
 * Made-up ids and names only. deno test --no-check supabase/functions/_fleet-server/maintenance_category_visibility.test.ts
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { readPartsBrowse } from "./parts_catalog_read.ts";
import {
  readUsedDraftTypeIds,
  visiblePartTypes,
} from "./maintenance_category_visibility.ts";

// maintenance_routes.ts loads a Supabase client at import time; a made-up local URL is enough for these read handlers.
Deno.env.set("SUPABASE_URL", "http://127.0.0.1:54321");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "made-up-service-role-key");
// The key name main reads since the 24 Nov key rotation (_shared/serviceKey.ts).
Deno.env.set("SUPABASE_SECRET_KEYS", JSON.stringify({ default: "made-up-secret-key" }));
const { registerMaintenanceRoutes } = await import("./maintenance_routes.ts");

type Row = Record<string, unknown>;

function tables(): Record<string, Row[]> {
  return {
    maintenance_service_categories: [
      { id: "11111111-1111-4111-8111-111111111111", name: "Example system", kind: "system", is_part: true, part_type_status: "active", parent_id: null, sort_order: 1, status: "active" },
      { id: "comp-active", name: "Example active part", plain_name: "Example active part", kind: "component", is_part: true, part_type_status: "active", parent_id: "11111111-1111-4111-8111-111111111111", sort_order: 2, status: "active" },
      { id: "draft-used", name: "Example used draft", plain_name: "Example used draft", kind: "component", is_part: true, part_type_status: "draft", parent_id: "11111111-1111-4111-8111-111111111111", sort_order: 3, status: "active" },
      { id: "draft-unused", name: "Example unused draft", plain_name: "Example unused draft", kind: "component", is_part: true, part_type_status: "draft", parent_id: "11111111-1111-4111-8111-111111111111", sort_order: 4, status: "active" },
    ],
    maintenance_package_categories: [{ id: "pkg-1", category_id: "draft-used" }],
    maintenance_job_section_members: [],
    vehicle_component_schedule: [{ id: "sched-1", category_id: "draft-used" }],
    maintenance_job_item: [],
    maintenance_task_templates: [],
  };
}

class FakeQuery {
  private filters: Array<["eq" | "in", string, unknown]> = [];
  constructor(private db: FakeDb, private table: string) {}
  select(cols = "*") {
    this.db.selects.push({ table: this.table, cols });
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push(["eq", column, value]);
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push(["in", column, values]);
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }
  maybeSingle() {
    return this.exec(true);
  }
  single() {
    return this.exec(true);
  }
  then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
    return this.exec().then(resolve, reject);
  }
  private exec(single = false): Promise<{ data: unknown; error: null; count: number }> {
    const rows = (this.db.tables[this.table] ?? []).filter((row) =>
      this.filters.every(([op, column, value]) =>
        op === "eq" ? row[column] === value : Array.isArray(value) && (value as unknown[]).includes(row[column])
      )
    );
    return Promise.resolve({
      data: single ? rows[0] ?? null : rows,
      error: null,
      count: rows.length,
    });
  }
}

class FakeDb {
  selects: Array<{ table: string; cols: string }> = [];
  constructor(public tables: Record<string, Row[]>) {}
  from(table: string) {
    return new FakeQuery(this, table);
  }
}

function ctx(opts: { param?: Record<string, string>; query?: Record<string, string> } = {}) {
  return {
    req: {
      path: "/maintenance-categories",
      param: (name: string) => opts.param?.[name] ?? "",
      query: (name: string) => opts.query?.[name] ?? "",
      header: () => "Bearer made-up",
    },
    get: (key: string) =>
      key === "rbacUser"
        ? { id: "made-up-user", email: "made-up@example.com", roles: [], organizationId: null }
        : undefined,
    json: (body: unknown, status = 200) => ({ body, status }),
  };
}

function appWithRoutes(db: FakeDb) {
  const routes: Array<{ path: string; handler: (c: never) => Promise<{ body: any; status: number }> }> = [];
  const record = (path: string, ...handlers: unknown[]) =>
    routes.push({ path, handler: handlers[handlers.length - 1] as never });
  registerMaintenanceRoutes(
    {
      get: record,
      post: record,
      put: record,
      patch: record,
      delete: record,
    } as never,
    db as unknown as SupabaseClient,
  );
  return routes;
}

Deno.test("S1b: a used draft is kept, an unused draft is hidden, an active type is always kept", () => {
  const rows = [
    { id: "active", part_type_status: "active" },
    { id: "used", part_type_status: "draft" },
    { id: "unused", part_type_status: "draft" },
  ];
  assertEquals(visiblePartTypes(rows, new Set(["used"])).map((r) => r.id), ["active", "used"]);
  // Fail open: if the usage check could not run, no draft is dropped.
  assertEquals(visiblePartTypes(rows, null).map((r) => r.id), ["active", "used", "unused"]);
});

Deno.test("S1b: the usage check reads only the draft ids and explicit columns, once per table", async () => {
  const db = new FakeDb(tables());
  const used = await readUsedDraftTypeIds(db as unknown as SupabaseClient);
  assertEquals([...used], ["draft-used"]);
  const usage = db.selects.filter((s) => s.table !== "maintenance_service_categories");
  assertEquals(usage.every((s) => s.cols !== "*"), true);
  assertEquals(usage.map((s) => s.table).sort(), [
    "maintenance_job_item",
    "maintenance_job_item",
    "maintenance_job_section_members",
    "maintenance_package_categories",
    "maintenance_task_templates",
    "vehicle_component_schedule",
  ]);
});

Deno.test("S1b: both Log service reads keep a used draft and hide an unused one", async () => {
  const db = new FakeDb(tables());
  const routes = appWithRoutes(db);

  const list = routes.find((r) => r.path === "/maintenance-categories")!;
  const listed = await list.handler(ctx({ query: { kind: "component" } }) as never);
  const listIds = (listed.body.items as Array<{ id: string }>).map((i) => i.id);
  assert(listIds.includes("draft-used"), JSON.stringify(listIds));
  assert(listIds.includes("comp-active"));
  assert(!listIds.includes("draft-unused"), JSON.stringify(listIds));

  const system = routes.find((r) => r.path === "/maintenance-categories/systems/:systemId/components")!;
  const grouped = await system.handler(ctx({ param: { systemId: "11111111-1111-4111-8111-111111111111" } }) as never);
  const groupIds = (grouped.body.items as Array<{ id: string }>).map((i) => i.id);
  assert(groupIds.includes("draft-used"), JSON.stringify(groupIds));
  assert(groupIds.includes("comp-active"));
  assert(!groupIds.includes("draft-unused"), JSON.stringify(groupIds));
});

Deno.test("S1b: Find parts stays strict — a used draft is not in the browse either", async () => {
  const db = new FakeDb(tables());
  const browse = await readPartsBrowse(db as unknown as SupabaseClient);
  const ids = browse.systems.flatMap((system) => system.components.map((c) => c.id));
  assert(!ids.includes("draft-used"), JSON.stringify(ids));
  assert(ids.includes("comp-active"));
});
