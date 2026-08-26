import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

/**
 * Access-control guard for every toll route on the fleet server.
 *
 * `POST /toll-info` (the rate card that drives reconciliation expected cost,
 * driver charges and Rides fares) and `POST /toll-reconciliation/reset-for-reconciliation`
 * (a destructive reset) both shipped completely open — anyone with the anon key
 * could publish pricing or wipe a reconciliation. This test is what stops that
 * from coming back, and what forces a new toll route to declare its guards.
 *
 * Reading the source is deliberate: importing index.tsx boots the whole server
 * and needs a live database, so the registration site is the cheapest honest
 * assertion available.
 */

const REGISTRATION_RE = /app\.(get|post|put|patch|delete)\(/g;
const PATH_RE = /"(\/make-server-37f42386\/[^"]*)"/;
/** Where the middleware chain ends and the route handler begins. */
const HANDLER_RE = /async\s*\(c|Handler\s*[,)]/;

const MUTATING = new Set(["post", "put", "patch", "delete"]);

interface Route {
  method: string;
  path: string;
  /** Just the middleware chain, so a mention inside a handler body cannot fake a pass. */
  middleware: string;
}

async function tollRoutes(): Promise<Route[]> {
  const source = await Deno.readTextFile(new URL("./index.tsx", import.meta.url));

  const starts: Array<{ index: number; method: string }> = [];
  for (const m of source.matchAll(REGISTRATION_RE)) {
    starts.push({ index: m.index!, method: m[1] });
  }

  const routes: Route[] = [];
  for (let i = 0; i < starts.length; i++) {
    const chunk = source.slice(starts[i].index, starts[i + 1]?.index ?? source.length);
    const path = chunk.match(PATH_RE)?.[1];
    if (!path || !path.startsWith("/make-server-37f42386/toll")) continue;
    const handlerAt = chunk.search(HANDLER_RE);
    routes.push({
      method: starts[i].method,
      path,
      middleware: handlerAt > 0 ? chunk.slice(0, handlerAt) : chunk,
    });
  }
  return routes;
}

Deno.test("every toll route is registered with requireAuth", async () => {
  const unguarded = (await tollRoutes())
    .filter((r) => !r.middleware.includes("requireAuth"))
    .map((r) => `${r.method.toUpperCase()} ${r.path}`);

  assertEquals(unguarded, [], `Toll routes missing requireAuth(): ${unguarded.join(", ")}`);
});

Deno.test("every toll route that changes state requires the toll.manage permission", async () => {
  const unpermissioned = (await tollRoutes())
    .filter((r) => MUTATING.has(r.method))
    .filter((r) => !r.middleware.includes("requirePermission('toll.manage')"))
    .map((r) => `${r.method.toUpperCase()} ${r.path}`);

  assertEquals(
    unpermissioned,
    [],
    `Mutating toll routes missing requirePermission('toll.manage'): ${unpermissioned.join(", ")}`,
  );
});

Deno.test("toll_controller keeps its blanket auth gate", async () => {
  // Its ~60 routes rely entirely on this one line instead of per-route middleware,
  // so removing it would silently open all of them at once.
  const source = await Deno.readTextFile(new URL("./toll_controller.tsx", import.meta.url));
  assertEquals(
    /app\.use\(\s*"\*"\s*,\s*requireAuth\(\{\s*strict:\s*true\s*\}\)\s*\)/.test(source),
    true,
    "toll_controller.tsx no longer applies requireAuth({ strict: true }) to every route",
  );
});


Deno.test("the guard actually sees the toll routes it claims to cover", async () => {
  const routes = await tollRoutes();
  const paths = routes.map((r) => r.path);
  // A scan that silently matched nothing would make both tests above pass.
  for (
    const expected of [
      "/make-server-37f42386/toll-info",
      "/make-server-37f42386/toll-plazas",
      "/make-server-37f42386/toll-tags/assign",
      "/make-server-37f42386/toll-reconciliation/reset-for-reconciliation",
    ]
  ) {
    assertEquals(paths.includes(expected), true, `route scan missed ${expected}`);
  }
  assertEquals(
    routes.filter((r) => MUTATING.has(r.method)).length > 0,
    true,
    "route scan found no mutating toll routes",
  );
});
Deno.test("toll_controller binds org context and stamps ledger writes", async () => {
  const source = await Deno.readTextFile(new URL("./toll_controller.tsx", import.meta.url));
  assertEquals(
    /runWithTollContext/.test(source),
    true,
    "toll_controller must bind runWithTollContext so all routes get organization_id",
  );
  assertEquals(
    /from\s+[\"']\.\/org_scope\.ts[\"']/.test(source),
    true,
    "toll_controller must import org_scope helpers",
  );
  assertEquals(
    /stampOrg\s*\(/.test(source),
    true,
    "toll_controller must call stampOrg on write paths",
  );
  assertEquals(
    /tollOrgSqlFilters/.test(source),
    true,
    "toll_controller must push organization_id into SQL via tollOrgSqlFilters",
  );
});
