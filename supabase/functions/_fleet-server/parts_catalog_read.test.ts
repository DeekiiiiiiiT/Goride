/**
 * T8, T9, T10. deno test --no-check supabase/functions/_fleet-server/parts_catalog_read.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { registerCatalogRoutes } from "./catalog_routes.ts";
import { rankTermResults, shapeBrowse, tallyCoverage } from "./parts_catalog_read.ts";

Deno.test("o2 returns the oxygen sensor, and a part number ranks first", () => {
  const words = rankTermResults("o2", {
    components: [{ id: "sensor", name: "Oxygen sensor", plain_name: "Oxygen sensor" }],
    synonyms: [{ term: "o2 sensor", maintenance_component_id: "sensor" }],
    parts: [],
  });
  assertEquals(words.hits[0].plainName, "Oxygen sensor");
  assertEquals(words.hits[0].kind, "synonym");
  assertEquals(words.synonyms[0].plainName, "Oxygen sensor");

  const number = rankTermResults("04152-40060", {
    components: [],
    synonyms: [],
    parts: [{
      id: "oil",
      name: "Oil filter",
      oem_part_number: "04152-40060",
      oem_part_number_norm: "0415240060",
    }],
  });
  assertEquals(number.hits[0].kind, "part");
  assertEquals(number.hits[0].id, "oil");
});

Deno.test("browse hides service rows that are not parts", () => {
  const tree = shapeBrowse([
    { id: "sys", name: "Brakes", parent_id: null, kind: "system", is_part: true },
    { id: "pads", name: "Brake pads", plain_name: "Brake pads", parent_id: "sys", kind: "component", is_part: true, position_aware: true },
    { id: "check", name: "Lights Check", parent_id: "sys", kind: "component", is_part: false },
  ]);
  assertEquals(tree.systems[0].components.map((row) => row.id), ["pads"]);
});

Deno.test("coverage counts through the part, not a missing listing column", () => {
  const areas = tallyCoverage(
    [{ interchange_group_id: "g1" }, { interchange_group_id: "g1" }, { interchange_group_id: "g2" }],
    [
      { interchange_group_id: "g1", maintenance_component_id: "pads" },
      { interchange_group_id: "g2", maintenance_component_id: "oil" },
    ],
  );
  assertEquals(areas.find((row) => row.id === "pads")?.count, 2);
  assertEquals(areas.find((row) => row.id === "oil")?.count, 1);
});

Deno.test("a staff member cannot save a problem", async () => {
  const registered: Array<{ method: string; path: string; handler: (c: unknown) => Promise<{ status?: number }> }> = [];
  const route = {
    get(path: string, ...handlers: unknown[]) {
      registered.push({ method: "GET", path, handler: handlers[handlers.length - 1] as (c: unknown) => Promise<{ status?: number }> });
    },
    post(path: string, ...handlers: unknown[]) {
      registered.push({ method: "POST", path, handler: handlers[handlers.length - 1] as (c: unknown) => Promise<{ status?: number }> });
    },
    patch() {},
    delete() {},
  };
  registerCatalogRoutes(route, {} as SupabaseClient);
  const save = registered.find((row) => row.method === "POST" && row.path.endsWith("/symptoms"));
  if (!save) throw new Error("symptoms route missing");
  const token = `Bearer x.${btoa(JSON.stringify({ aal: "aal2" }))}.y`;
  const response = await save.handler({
    get: () => ({ userId: "staff", resolvedRole: "platform_support", rawRole: "platform_support" }),
    json: (body: unknown, status?: number) => ({ body, status }),
    req: {
      header: () => token,
      json: async () => ({ label: "Squeaks", reason: "because", components: [] }),
    },
  });
  assertEquals(response.status, 403);
});

Deno.test("saving a problem writes the master change log", async () => {
  const writes: Array<{ table: string; row: unknown }> = [];
  const token = `Bearer x.${btoa(JSON.stringify({ aal: "aal2" }))}.y`;
  function chain() {
    const builder: Record<string, unknown> = {};
    const self = () => builder;
    for (const name of ["select", "eq", "in", "order"]) builder[name] = self;
    builder.maybeSingle = () => Promise.resolve({ data: null, error: null });
    builder.upsert = () => Promise.resolve({ error: null });
    builder.delete = () => ({ eq: () => Promise.resolve({ error: null }) });
    builder.insert = (row: unknown) => {
      writes.push({ table: String(builder.table || ""), row });
      return Promise.resolve({ error: null });
    };
    builder.then = (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null });
    return builder;
  }
  const supabase = {
    from(table: string) {
      const builder = chain();
      builder.table = table;
      builder.insert = (row: unknown) => {
        writes.push({ table, row });
        return Promise.resolve({ error: null });
      };
      return builder;
    },
    schema() {
      return this;
    },
  };
  const registered: Array<{ method: string; path: string; handler: (c: unknown) => Promise<unknown> }> = [];
  const route = {
    get(path: string, ...handlers: unknown[]) {
      registered.push({ method: "GET", path, handler: handlers[handlers.length - 1] as (c: unknown) => Promise<unknown> });
    },
    post(path: string, ...handlers: unknown[]) {
      registered.push({ method: "POST", path, handler: handlers[handlers.length - 1] as (c: unknown) => Promise<unknown> });
    },
    patch() {},
    delete() {},
  };
  registerCatalogRoutes(route, supabase as unknown as SupabaseClient);
  const save = registered.find((row) => row.method === "POST" && row.path.endsWith("/symptoms"));
  if (!save) throw new Error("symptoms route missing");
  await save.handler({
    get: () => ({ userId: "owner", resolvedRole: "platform_owner", rawRole: "platform_owner" }),
    json: (body: unknown, status?: number) => ({ body, status }),
    req: {
      header: () => token,
      json: async () => ({ label: "Squeaks or grinds when I brake", reason: "Starter list", components: [] }),
    },
  });
  assertEquals(writes.some((row) => row.table === "master_change_log"), true);
});
