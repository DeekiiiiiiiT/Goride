/**
 * Phase 3a catalog trust routes.
 * deno test --check supabase/functions/_fleet-server/catalog_trust_routes.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { normalizeTrustedSourceDomain, registerCatalogRoutes } from "./catalog_routes.ts";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";

type RouteRow = {
  method: string;
  path: string;
  handler: (c: unknown) => Promise<Response | { body?: unknown; status?: number }>;
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
    json: (body: unknown, status?: number) =>
      new Response(JSON.stringify(body), { status: status ?? 200 }),
    req: {
      header: () => token,
      json: async () => opts.jsonBody ?? {},
      query: (_name: string) => "",
      param: (name: string) => opts.param?.[name] ?? "",
    },
    param: (name: string) => opts.param?.[name] ?? "",
  };
}

Deno.test("normalizeTrustedSourceDomain strips scheme and www", () => {
  const n = normalizeTrustedSourceDomain("https://www.SBparts.jp/catalogue/1?x=1");
  assertEquals(n.ok, true);
  if (n.ok) assertEquals(n.domain, "sbparts.jp");
});

Deno.test("trusted-sources POST 403 for non-owner staff", async () => {
  const { registered, route } = mockRoute();
  registerCatalogRoutes(route, {} as SupabaseClient);
  const r = registered.find((x) => x.method === "POST" && x.path.endsWith("/admin/catalog/trusted-sources"));
  if (!r) throw new Error("route missing");
  const res = await r.handler(mockContext({
    role: "platform_support",
    jsonBody: { kind: "car_maker", maker: "X", domain: "a.com" },
  })) as Response;
  assertEquals(res.status, 403);
});

Deno.test("trusted-sources POST 400 for bad domain", async () => {
  const { registered, route } = mockRoute();
  registerCatalogRoutes(route, {} as SupabaseClient);
  const r = registered.find((x) => x.method === "POST" && x.path.endsWith("/admin/catalog/trusted-sources"));
  if (!r) throw new Error("route missing");
  const res = await r.handler(mockContext({
    role: "platform_owner",
    jsonBody: { kind: "car_maker", maker: "Toyota", domain: "" },
  }));
  assertEquals(res instanceof Response, true);
  const body = await (res as Response).json() as { error?: string };
  assertEquals((res as Response).status, 400);
  assertEquals(body.error, "Type a website address, like amayama.com.");
});

Deno.test("trusted-sources POST 409 on duplicate", async () => {
  const supabase = {
    from: (table: string) => {
      if (table !== "trusted_source") return {};
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
                    error: null,
                  }),
              }),
            }),
          }),
        }),
        insert: () => ({ select: () => ({ single: () => ({ data: null, error: null }) }) }),
      };
    },
    rpc: (_name: string) => Promise.resolve({ data: null, error: null }),
    schema: () => ({ from: () => ({ insert: () => Promise.resolve({ error: null }) }) }),
  } as unknown as SupabaseClient;
  const { registered, route } = mockRoute();
  registerCatalogRoutes(route, supabase);
  const r = registered.find((x) => x.method === "POST" && x.path.endsWith("/admin/catalog/trusted-sources"));
  if (!r) throw new Error("route missing");
  const res = await r.handler(mockContext({
    role: "platform_owner",
    jsonBody: { kind: "car_maker", maker: "Toyota", domain: "amayama.com" },
  }));
  assertEquals(res instanceof Response, true);
  const body = await (res as Response).json() as { error?: string };
  assertEquals((res as Response).status, 409);
  assertEquals(body.error?.includes("already trusted"), true);
});

Deno.test("listings trust PATCH returns previous and current", async () => {
  const supabase = {
    rpc: (name: string) => {
      if (name === "admin_part_listing_patch_trust") {
        return Promise.resolve({
          data: {
            previous: { trust: "needs_checking", reason: null, setBy: "auto" },
            current: { trust: "confirmed", reason: "ok", setBy: "owner" },
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    },
  } as unknown as SupabaseClient;
  const { registered, route } = mockRoute();
  registerCatalogRoutes(route, supabase);
  const r = registered.find((x) => x.method === "PATCH" && x.path.includes("/admin/catalog/listings/") && x.path.endsWith("/trust"));
  if (!r) throw new Error("route missing");
  const res = await r.handler(mockContext({
    role: "platform_owner",
    jsonBody: { trust: "confirmed", reason: "ok" },
    param: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
  }));
  const body = await (res as Response).json() as { previous?: unknown; current?: unknown };
  assertEquals((res as Response).status, 200);
  assertEquals(body.previous != null, true);
  assertEquals(body.current != null, true);
});

Deno.test("listings years PATCH 400 when yearFrom > yearTo", async () => {
  const supabase = {} as unknown as SupabaseClient;
  const { registered, route } = mockRoute();
  registerCatalogRoutes(route, supabase);
  const r = registered.find((x) => x.method === "PATCH" && x.path.includes("/admin/catalog/listings/") && x.path.endsWith("/years"));
  if (!r) throw new Error("route missing");
  const res = await r.handler(mockContext({
    role: "platform_owner",
    jsonBody: { yearFrom: 2020, yearTo: 2010 },
    param: { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" },
  }));
  const body = await (res as Response).json() as { error?: string };
  assertEquals((res as Response).status, 400);
  assertEquals(body.error?.includes("yearFrom"), true);
});
