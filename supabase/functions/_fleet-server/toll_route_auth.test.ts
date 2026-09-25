import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

/**
 * Access-control guard for every toll route on the fleet-toll controllers.
 *
 * `POST /toll-reconciliation/reset-for-reconciliation` (destructive reset) and
 * money-mutating recon routes must carry `requirePermission('toll.manage')` in
 * addition to the controller-wide `requireAuth({ strict: true })` blanket.
 *
 * Reading the source is deliberate: importing the boot module starts the whole
 * server and needs a live database, so the registration site is the cheapest
 * honest assertion available.
 *
 * Routes live in toll_controller.tsx / toll_period_controller.tsx and register
 * as template literals (`${BASE}/approve`), not double-quoted monolith paths.
 */

const REGISTRATION_RE = /app\.(get|post|put|patch|delete)\(/g;
/** Where the middleware chain ends and the route handler begins. */
const HANDLER_RE = /async\s*\(c|Handler\s*[,)]/;
const TOLL_MANAGE_RE = /requirePermission\(\s*['"]toll\.manage['"]\s*\)/;
const BLANKET_AUTH_RE =
  /app\.use\(\s*"\*"\s*,\s*requireAuth\(\{\s*strict:\s*true\s*\}\)\s*\)/;

const MUTATING = new Set(["post", "put", "patch", "delete"]);

const CONTROLLER_FILES = [
  "./toll_controller.tsx",
  "./toll_period_controller.tsx",
] as const;

interface Route {
  method: string;
  path: string;
  /** Just the middleware chain, so a mention inside a handler body cannot fake a pass. */
  middleware: string;
  file: string;
  blanketAuth: boolean;
}

interface PathEnv {
  BASE: string;
  TOLL_HTTP_PREFIX: string;
}

async function loadPathEnv(): Promise<PathEnv> {
  const prefixSource = await Deno.readTextFile(
    new URL("./toll_http_prefix.ts", import.meta.url),
  );
  const prefixMatch = prefixSource.match(
    /export\s+const\s+TOLL_HTTP_PREFIX\s*=\s*["']([^"']*)["']/,
  );
  const TOLL_HTTP_PREFIX = prefixMatch?.[1] ?? "";
  // Controllers: const BASE = `${TOLL_HTTP_PREFIX}/toll-reconciliation`
  const BASE = `${TOLL_HTTP_PREFIX}/toll-reconciliation`;
  return { BASE, TOLL_HTTP_PREFIX };
}

/** First path argument of `app.<method>(…)` — string literal or `${BASE|TOLL_HTTP_PREFIX}…` template. */
function extractPathArg(chunk: string, env: PathEnv): string | null {
  const open = chunk.indexOf("(");
  if (open < 0) return null;
  let i = open + 1;
  while (i < chunk.length && /\s/.test(chunk[i]!)) i++;

  const ch = chunk[i];
  if (ch === '"' || ch === "'") {
    const end = chunk.indexOf(ch, i + 1);
    if (end < 0) return null;
    return chunk.slice(i + 1, end);
  }

  if (ch === "`") {
    const end = chunk.indexOf("`", i + 1);
    if (end < 0) return null;
    const raw = chunk.slice(i + 1, end);
    // Only allow known interpolations so we never silently invent paths.
    if (/\$\{(?!BASE\})(?!TOLL_HTTP_PREFIX\})[^}]+\}/.test(raw)) return null;
    return raw
      .replaceAll("${BASE}", env.BASE)
      .replaceAll("${TOLL_HTTP_PREFIX}", env.TOLL_HTTP_PREFIX);
  }

  return null;
}

function isTollPath(path: string): boolean {
  return (
    path.startsWith("/toll-reconciliation") ||
    path.startsWith("/toll-ledger") ||
    path.startsWith("/toll/") ||
    path.startsWith("/toll-") ||
    // Legacy monolith prefix still used by residual string-literal twins if scanned.
    path.startsWith("/make-server-37f42386/toll")
  );
}

async function tollRoutesFromFile(
  rel: string,
  env: PathEnv,
): Promise<Route[]> {
  const source = await Deno.readTextFile(new URL(rel, import.meta.url));
  const blanketAuth = BLANKET_AUTH_RE.test(source);
  const starts: Array<{ index: number; method: string }> = [];
  for (const m of source.matchAll(REGISTRATION_RE)) {
    starts.push({ index: m.index!, method: m[1]! });
  }

  const routes: Route[] = [];
  for (let i = 0; i < starts.length; i++) {
    const chunk = source.slice(starts[i]!.index, starts[i + 1]?.index ?? source.length);
    const path = extractPathArg(chunk, env);
    if (!path || !isTollPath(path)) continue;
    const handlerAt = chunk.search(HANDLER_RE);
    routes.push({
      method: starts[i]!.method,
      path,
      middleware: handlerAt > 0 ? chunk.slice(0, handlerAt) : chunk,
      file: rel,
      blanketAuth,
    });
  }
  return routes;
}

async function tollRoutes(): Promise<Route[]> {
  const env = await loadPathEnv();
  const batches = await Promise.all(
    CONTROLLER_FILES.map((rel) => tollRoutesFromFile(rel, env)),
  );
  return batches.flat();
}

function routeKey(r: Route): string {
  return `${r.method.toUpperCase()} ${r.path}`;
}

function hasTollManage(middleware: string): boolean {
  return TOLL_MANAGE_RE.test(middleware);
}

Deno.test("every toll route is registered with requireAuth", async () => {
  // Controllers use app.use("*", requireAuth({ strict: true })); per-route
  // middleware often omits requireAuth. Either blanket or per-route is enough.
  const unguarded = (await tollRoutes())
    .filter((r) => !r.blanketAuth && !r.middleware.includes("requireAuth"))
    .map(routeKey);

  assertEquals(unguarded, [], `Toll routes missing requireAuth(): ${unguarded.join(", ")}`);
});

Deno.test("every toll route that changes state requires the toll.manage permission", async () => {
  const unpermissioned = (await tollRoutes())
    .filter((r) => MUTATING.has(r.method))
    .filter((r) => !hasTollManage(r.middleware))
    .map(routeKey);

  assertEquals(
    unpermissioned,
    [],
    `Mutating toll routes missing requirePermission('toll.manage'): ${unpermissioned.join(", ")}`,
  );
});

Deno.test("toll controllers keep their blanket auth gate", async () => {
  for (const rel of CONTROLLER_FILES) {
    const source = await Deno.readTextFile(new URL(rel, import.meta.url));
    assertEquals(
      BLANKET_AUTH_RE.test(source),
      true,
      `${rel} no longer applies requireAuth({ strict: true }) to every route`,
    );
  }
});

Deno.test("the guard actually sees the toll routes it claims to cover", async () => {
  const routes = await tollRoutes();
  const paths = routes.map((r) => r.path);
  // A scan that silently matched nothing would make both tests above pass.
  for (
    const expected of [
      "/toll-reconciliation/approve",
      "/toll-reconciliation/reset-for-reconciliation",
      "/toll-reconciliation/reconcile",
      "/toll-ledger/:id/void",
      "/toll/periods/:weekKey/seal",
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

/**
 * Frozen inventory of every mutating toll route. Adding a route requires updating
 * this list — which forces the author to also satisfy the toll.manage check above.
 */
const MUTATING_ROUTE_INVENTORY = [
  "PATCH /toll-reconciliation/edit",
  "POST /toll-ledger/:id/void",
  "POST /toll-reconciliation/approve",
  "POST /toll-reconciliation/auto-match",
  "POST /toll-reconciliation/auto-resolve-refunds",
  "POST /toll-reconciliation/backfill-linked-trip-resolutions",
  "POST /toll-reconciliation/bridge-rides",
  "POST /toll-reconciliation/bulk-reconcile",
  "POST /toll-reconciliation/claims-toll-sync/repair",
  "POST /toll-reconciliation/match-index/backfill",
  "POST /toll-reconciliation/periods/:weekKey/finish",
  "POST /toll-reconciliation/periods/:weekKey/reopen",
  "POST /toll-reconciliation/personal-rematch/backfill",
  "POST /toll-reconciliation/personal-use/auto-charge",
  "POST /toll-reconciliation/reconcile",
  "POST /toll-reconciliation/reject",
  "POST /toll-reconciliation/rematch-candidates/:id/dismiss",
  "POST /toll-reconciliation/repair-dispute-partial-claims",
  "POST /toll-reconciliation/reset-for-reconciliation",
  "POST /toll-reconciliation/reset-period",
  "POST /toll-reconciliation/resolve",
  "POST /toll-reconciliation/resolve-refund",
  "POST /toll-reconciliation/resolve-refund/bulk",
  "POST /toll-reconciliation/settlement-allocations/backfill",
  "POST /toll-reconciliation/toll-ledger/:id/plaza",
  "POST /toll-reconciliation/toll-ledger/:id/void",
  "POST /toll-reconciliation/toll-ledger/backfill",
  "POST /toll-reconciliation/toll-ledger/plaza-backfill",
  "POST /toll-reconciliation/toll-ledger/repair-dates",
  "POST /toll-reconciliation/toll-ledger/tag-backfill",
  "POST /toll-reconciliation/toll-pnl-offset-backfill/backfill",
  "POST /toll-reconciliation/toll-pnl-offset-backfill/repair-orphans",
  "POST /toll-reconciliation/unlinked-refunds/apply-to-claim",
  "POST /toll-reconciliation/unlinked-refunds/repair-split",
  "POST /toll-reconciliation/unlinked-refunds/undo-apply",
  "POST /toll-reconciliation/unreconcile",
  "POST /toll-reconciliation/workflow-stage/backfill",
  "POST /toll/periods/:weekKey/ineligible-usage-report",
  "POST /toll/periods/:weekKey/repair-orphan-events",
  "POST /toll/periods/:weekKey/seal",
  "PUT /toll-reconciliation/automation-settings",
];

Deno.test("mutating toll route inventory snapshot", async () => {
  const mutating = (await tollRoutes())
    .filter((r) => MUTATING.has(r.method))
    .map(routeKey)
    .sort();

  assertEquals(
    mutating,
    MUTATING_ROUTE_INVENTORY,
    "Mutating toll route inventory changed — update MUTATING_ROUTE_INVENTORY and ensure the new route has requirePermission('toll.manage')",
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
