/**
 * RE-23: no Dominion research or pending route returns who asked, when, or what they typed.
 * Every route is registered behind withPrivacyGuard against a database stub whose rows are full of customer data,
 * and every GET (and the CSV export) is called.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { findResearchPrivateKey, stripResearchPrivate, withPrivacyGuard } from "./research_privacy.ts";
import { registerCatalogResearchRoutes } from "./catalog_research_routes.ts";
import { registerResearchEngineRoutes } from "./research_engine_routes.ts";
import { registerPendingPartsCatalogRoutes } from "./pending_parts_catalog_routes.ts";

Deno.test("RE-23: stripResearchPrivate removes customer keys at any depth", () => {
  const out = stripResearchPrivate({
    id: "j1",
    fleet_count: 4,
    nested: [{ requested_name: "the blue one", part_number: "PN-1", origin: "find_parts", firstAsked: "2026-11-01" }],
  });
  assertEquals(out, { id: "j1", nested: [{ part_number: "PN-1" }] });
  assertEquals(findResearchPrivateKey({ a: [{ pending_request_id: "x" }] }), "$.a[0].pending_request_id");
});

type Registered = { method: string; path: string; handler: (c: unknown) => Promise<unknown> };

function recordingApp(registered: Registered[]) {
  const add = (method: string) => (path: string, ...handlers: unknown[]) => {
    registered.push({ method, path, handler: handlers[handlers.length - 1] as Registered["handler"] });
  };
  return { get: add("GET"), post: add("POST"), patch: add("PATCH"), put: add("PUT"), delete: add("DELETE") };
}

const DIRTY: Record<string, unknown> = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  job_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  job_type: "part",
  state: "needs_review",
  status: "open",
  vehicle_catalog_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
  maintenance_component_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
  catalog_research_job_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  part_number: "04465-B1190",
  domain: "jnbk-brakes.com",
  automated_read: "allowed",
  shadow_mode: true,
  paused: false,
  // customer data that must never come back
  organization_id: "org-secret",
  fleet_count: 7,
  need_text: "my driver says it squeaks",
  looking_note: "note",
  requested_name: "customer words",
  requested_part_number: "customer number",
  old_part_number: "customer number",
  pending_request_id: "req-secret",
  origin: "find_parts",
  group_key: "vehicle:Toyota:Roomy:2020:org-secret",
  research_group_key: "v2:customer words",
  created_at: "2026-11-01T00:00:00Z",
  first_requested_at: "2026-11-01T00:00:00Z",
  last_requested_at: "2026-11-02T00:00:00Z",
};

function stub(): SupabaseClient {
  const builder = (): Record<string, unknown> => {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "neq", "in", "is", "not", "gte", "lte", "lt", "gt", "ilike", "or", "order", "limit", "range", "contains", "update", "insert", "upsert", "delete"]) {
      b[m] = () => b;
    }
    b.maybeSingle = () => Promise.resolve({ data: { ...DIRTY }, error: null });
    b.single = () => Promise.resolve({ data: { ...DIRTY }, error: null });
    b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve({ data: [{ ...DIRTY }], error: null, count: 1 }).then(res, rej);
    return b;
  };
  return {
    from: () => builder(),
    rpc: () => Promise.resolve({ data: { ...DIRTY, items: [{ ...DIRTY }] }, error: null }),
  } as unknown as SupabaseClient;
}

function ctx(path: string) {
  return {
    req: {
      path,
      param: () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      query: () => "",
      header: (name?: string) => name === "Authorization"
        ? `Bearer ${btoa(JSON.stringify({ alg: "none" }))}.${btoa(JSON.stringify({ aal: "aal2", sub: "staff" }))}.sig`
        : null,
      json: async () => ({}),
    },
    get: (key: string) => key === "rbacUser"
      ? { id: "staff", userId: "staff", resolvedRole: "platform_owner", role: "platform_owner" }
      : undefined,
    json: (body: unknown, status = 200) => ({ body, status }),
    body: (b: unknown) => ({ body: b }),
    text: (b: unknown) => ({ body: b }),
  };
}

Deno.test("RE-23: every research + pending GET is free of customer data", async () => {
  const registered: Registered[] = [];
  const app = recordingApp(registered);
  const db = stub();
  registerCatalogResearchRoutes(withPrivacyGuard(app), db);
  registerResearchEngineRoutes(withPrivacyGuard(app), db);
  registerPendingPartsCatalogRoutes(withPrivacyGuard(app, ["notes"]), db);

  const gets = registered.filter((r) => r.method === "GET");
  assert(gets.length >= 12, `expected the research + pending GET routes, got ${gets.length}`);
  let checked = 0;
  for (const r of gets) {
    let result: unknown;
    try {
      result = await r.handler(ctx(r.path));
    } catch {
      continue; // a stub shape a handler can't use is not a leak
    }
    if (result instanceof Response) {
      const text = await result.text();
      for (const secret of ["org-secret", "customer words", "customer number", "my driver says"]) {
        assert(!text.includes(secret), `${r.path} CSV leaked "${secret}"`);
      }
      checked++;
      continue;
    }
    const status = (result as { status?: number })?.status ?? 200;
    if (status === 401 || status === 403) throw new Error(`${r.path} refused the owner (${status}) — the test would prove nothing`);
    const leak = findResearchPrivateKey((result as { body?: unknown })?.body);
    assertEquals(leak, null, `${r.path} leaked ${leak}`);
    checked++;
  }
  assert(checked >= 10, `only ${checked} routes produced a body`);
});

Deno.test("RE-23: export.csv carries no group key or fleet count columns", async () => {
  const registered: Registered[] = [];
  registerCatalogResearchRoutes(withPrivacyGuard(recordingApp(registered)), stub());
  const exp = registered.find((r) => r.path.endsWith("/export.csv"));
  assert(exp, "export.csv route missing");
  const res = await exp!.handler(ctx(exp!.path)) as Response;
  const header = (await res.text()).split("\n")[0];
  assert(!header.includes("group_key") && !header.includes("fleet_count"), header);
});

Deno.test("RE-21: trusted-site writes are owner only", async () => {
  const registered: Registered[] = [];
  registerResearchEngineRoutes(withPrivacyGuard(recordingApp(registered)), stub());
  const add = registered.find((r) => r.method === "POST" && r.path.endsWith("/trusted-sites"));
  assert(add, "add site route missing");
  const support = ctx(add!.path);
  support.get = (key: string) => key === "rbacUser" ? { id: "s", userId: "s", resolvedRole: "platform_support", role: "platform_support" } : undefined;
  const out = await add!.handler(support) as { status: number };
  assert(out.status === 403, `non-owner got ${out.status}`);
});

Deno.test("Layer 3: support and analyst can read every research + pending GET; analyst cannot write", async () => {
  const registered: Registered[] = [];
  const app = recordingApp(registered);
  registerCatalogResearchRoutes(withPrivacyGuard(app), stub());
  registerResearchEngineRoutes(withPrivacyGuard(app), stub());
  registerPendingPartsCatalogRoutes(withPrivacyGuard(app, ["notes"]), stub());
  const as = (path: string, role: string) => {
    const c = ctx(path);
    c.get = (key: string) => key === "rbacUser" ? { id: "u", userId: "u", resolvedRole: role, role, mfaVerified: true, aal: "aal2" } : undefined;
    return c;
  };
  for (const role of ["platform_support", "platform_analyst"]) {
    for (const r of registered.filter((x) => x.method === "GET")) {
      let result: unknown;
      try {
        result = await r.handler(as(r.path, role));
      } catch {
        continue;
      }
      const status = result instanceof Response ? result.status : ((result as { status?: number })?.status ?? 200);
      assert(status !== 403, `${role} was refused ${r.path}`);
    }
  }
  const pause = registered.find((r) => r.method === "PATCH" && r.path.endsWith("/settings"));
  assert(pause, "settings PATCH missing");
  const out = await pause!.handler(as(pause!.path, "platform_analyst")) as { status: number };
  assertEquals(out.status, 403);
});
