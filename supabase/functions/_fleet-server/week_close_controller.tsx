/**
 * Close-the-week API (audit §6.5 / Phase 7).
 *
 * Routes under /make-server-37f42386/settlements/week-close:
 *   GET  /week-close/preview?weekKey=YYYY-MM-DD  → read-only lanes + blockers
 *   POST /week-close  { weekKey, reason }        → run invariants and sign week
 *
 * The POST is the only place a week is truly closed: it runs the cross-system
 * invariants as a precondition and signs an immutable statement + freeze hash
 * per driver. A single blocking drift leaves that driver open with its blocker.
 */
import { Hono, type Context } from "npm:hono";
import { requireAuth, requirePermission, type RbacUser } from "./rbac_middleware.ts";
import { getOrgId } from "./org_scope.ts";
import { safeErrorResponse } from "./safe_error.ts";
import { closeWeek, previewWeekClose } from "./week_close.ts";

const app = new Hono();
app.use("*", requireAuth({ strict: true }));

const BASE = "/make-server-37f42386/settlements/week-close";

function requireOrg(c: Context): string | Response {
  const orgId = getOrgId(c);
  if (!orgId) {
    return c.json({ error: "ORG_REQUIRED", message: "organizationId is required to close a week" }, 400);
  }
  return orgId;
}

const WEEK_RE = /^\d{4}-\d{2}-\d{2}$/;

// ── GET /week-close/preview ─────────────────────────────────────────────────
app.get(`${BASE}/preview`, requirePermission("transactions.view"), async (c) => {
  try {
    const org = requireOrg(c);
    if (typeof org !== "string") return org;
    const weekKey = String(c.req.query("weekKey") || "").slice(0, 10);
    if (!WEEK_RE.test(weekKey)) {
      return c.json({ error: "weekKey (YYYY-MM-DD) is required" }, 400);
    }
    const preview = await previewWeekClose(org, weekKey);
    return c.json(preview);
  } catch (e) {
    return safeErrorResponse(c, e, "week-close");
  }
});

// ── POST /week-close ────────────────────────────────────────────────────────
app.post(BASE, requirePermission("transactions.edit"), async (c) => {
  try {
    const org = requireOrg(c);
    if (typeof org !== "string") return org;
    const user = c.get("rbacUser") as RbacUser;
    const body = (await c.req.json()) as { weekKey?: string; reason?: string };
    const weekKey = String(body.weekKey || "").slice(0, 10);
    if (!WEEK_RE.test(weekKey)) {
      return c.json({ error: "weekKey (YYYY-MM-DD) is required" }, 400);
    }
    const reason = String(body.reason || "").trim() || "Manual week close";
    const result = await closeWeek(org, weekKey, user.userId, reason);
    return c.json(result);
  } catch (e) {
    return safeErrorResponse(c, e, "week-close");
  }
});

export default app;
