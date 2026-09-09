/**
 * Close-the-week API (audit §6.5 / Phase 7).
 *
 * Routes under /make-server-37f42386/settlements/week-close:
 *   GET  /week-close/preview?weekKey=YYYY-MM-DD  → read-only lanes + blockers
 *   POST /week-close  { weekKey, reason }        → run invariants and sign week
 *   POST /week-close/reopen { weekKey, reason, acknowledgeSettlementRisk? }
 *                                               → admin unfreeze (audit trail)
 *
 * The POST is the only place a week is truly closed: it runs the cross-system
 * invariants as a precondition and signs an immutable statement + freeze hash
 * per driver. A single blocking drift leaves that driver open with its blocker.
 */
import { Hono, type Context } from "npm:hono";
import { requireAuth, requirePermission, type RbacUser } from "./rbac_middleware.ts";
import { getOrgId } from "./org_scope.ts";
import { safeErrorResponse } from "./safe_error.ts";
import { closeWeek, previewWeekClose, prepareWeekClose, reopenWeek, retryFreezeWeek, WeekCloseError } from "./week_close.ts";
import { sealFuelWeek } from "./fuel_week_seal.ts";
import {
  listPendingRestatements,
  requestRestatement,
} from "./week_statements.ts";

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

// ── POST /week-close/prepare — seal lanes + persist drifts (H-1) ─────────────
app.post(`${BASE}/prepare`, requirePermission("transactions.edit"), async (c) => {
  try {
    const org = requireOrg(c);
    if (typeof org !== "string") return org;
    const user = c.get("rbacUser") as RbacUser;
    const body = (await c.req.json().catch(() => ({}))) as { weekKey?: string };
    const weekKey = String(body.weekKey || c.req.query("weekKey") || "").slice(0, 10);
    if (!WEEK_RE.test(weekKey)) {
      return c.json({ error: "weekKey (YYYY-MM-DD) is required" }, 400);
    }
    const preview = await prepareWeekClose(org, weekKey, user.userId);
    return c.json(preview);
  } catch (e) {
    return safeErrorResponse(c, e, "week-close-prepare");
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
    if (e instanceof WeekCloseError) {
      return c.json({ error: e.code, message: e.message, details: e.details }, e.status);
    }
    return safeErrorResponse(c, e, "week-close");
  }
});

/** N-11: calendar freeze only after statements were sealed but freeze RPC failed. */
app.post(`${BASE}/retry-freeze`, requirePermission("transactions.edit"), async (c) => {
  try {
    const org = requireOrg(c);
    if (typeof org !== "string") return org;
    const user = c.get("rbacUser") as RbacUser;
    const body = (await c.req.json().catch(() => ({}))) as { weekKey?: string; reason?: string };
    const weekKey = String(body.weekKey || "").slice(0, 10);
    if (!WEEK_RE.test(weekKey)) {
      return c.json({ error: "weekKey (YYYY-MM-DD) is required" }, 400);
    }
    const reason = String(body.reason || "").trim() || "Retry freeze after ATOMIC_FREEZE_FAILED";
    const result = await retryFreezeWeek(org, weekKey, user.userId, reason);
    return c.json(result);
  } catch (e) {
    if (e instanceof WeekCloseError) {
      return c.json({ error: e.code, message: e.message, details: e.details }, e.status);
    }
    return safeErrorResponse(c, e, "week-close-retry-freeze");
  }
});

// ── POST /week-close/reopen ─────────────────────────────────────────────────
app.post(`${BASE}/reopen`, requirePermission("transactions.edit"), async (c) => {
  try {
    const org = requireOrg(c);
    if (typeof org !== "string") return org;
    const user = c.get("rbacUser") as RbacUser;
    const body = (await c.req.json()) as {
      weekKey?: string;
      reason?: string;
      acknowledgeSettlementRisk?: boolean;
    };
    const weekKey = String(body.weekKey || "").slice(0, 10);
    if (!WEEK_RE.test(weekKey)) {
      return c.json({ error: "weekKey (YYYY-MM-DD) is required" }, 400);
    }
    const reason = String(body.reason || "").trim();
    if (!reason) {
      return c.json({ error: "REASON_REQUIRED", message: "A reopen reason is required" }, 400);
    }
    const result = await reopenWeek(
      org,
      weekKey,
      user.userId,
      reason,
      body.acknowledgeSettlementRisk === true,
    );
    return c.json(result);
  } catch (e) {
    if (e instanceof WeekCloseError) {
      return c.json({ error: e.code, message: e.message, details: e.details }, e.status);
    }
    return safeErrorResponse(c, e, "week-close-reopen");
  }
});

// ── POST /week-close/seal-fuel ──────────────────────────────────────────────
// Force-publish fuel week_statements from the live week rebuild (same engine as
// Consumption). Used to heal closed weeks sealed from stale DFP $0 deductions.
app.post(`${BASE}/seal-fuel`, requirePermission("transactions.edit"), async (c) => {
  try {
    const org = requireOrg(c);
    if (typeof org !== "string") return org;
    const user = c.get("rbacUser") as RbacUser;
    const body = (await c.req.json().catch(() => ({}))) as {
      weekKey?: string;
      force?: boolean;
      amountsByDriver?: Record<
        string,
        {
          driverShare?: number;
          companyShare?: number;
          totalSpend?: number;
          miscellaneousCost?: number;
        }
      >;
    };
    const weekKey = String(body.weekKey || "").slice(0, 10);
    if (!WEEK_RE.test(weekKey)) {
      return c.json({ error: "weekKey (YYYY-MM-DD) is required" }, 400);
    }
    const result = await sealFuelWeek({
      organizationId: org,
      weekKey,
      actorId: user.userId,
      force: body.force === true,
      amountsByDriver: body.amountsByDriver,
    });
    return c.json({ success: true, weekKey, ...result });
  } catch (e) {
    return safeErrorResponse(c, e, "week-close-seal-fuel");
  }
});

// ── Restatement queue (Pass E) ──────────────────────────────────────────────
app.get(`${BASE}/restatements`, requirePermission("transactions.view"), async (c) => {
  try {
    const org = requireOrg(c);
    if (typeof org !== "string") return org;
    const page = Math.max(1, Number(c.req.query("page") || 1));
    const pageSize = Math.min(Math.max(Number(c.req.query("pageSize") || 50), 1), 200);
    const offset = (page - 1) * pageSize;
    const rows = await listPendingRestatements(org, { limit: pageSize, offset });
    return c.json({
      success: true,
      rows: rows.map((s) => ({
        id: s.id,
        driverId: s.driverId,
        weekKey: s.weekKey,
        kind: s.kind,
        version: s.version,
        status: s.status,
        reason: s.closeReason,
        createdAt: s.createdAt,
      })),
      page: { page, pageSize, hasMore: rows.length >= pageSize },
    });
  } catch (e) {
    return safeErrorResponse(c, e, "week-close-restatements");
  }
});

app.post(`${BASE}/restatements`, requirePermission("transactions.edit"), async (c) => {
  try {
    const org = requireOrg(c);
    if (typeof org !== "string") return org;
    const user = c.get("rbacUser") as RbacUser;
    const body = (await c.req.json()) as {
      statementId?: string;
      reason?: string;
      amountsMinor?: Record<string, number>;
    };
    const statementId = String(body.statementId || "").trim();
    const reason = String(body.reason || "").trim();
    if (!statementId || !reason) {
      return c.json({ error: "statementId and reason are required" }, 400);
    }
    const draft = await requestRestatement({
      statementId,
      actorId: user.userId,
      reason,
      amountsMinor: body.amountsMinor,
    });
    if (draft.organizationId !== org) {
      return c.json({ error: "ORG_MISMATCH", message: "Statement belongs to another organization" }, 403);
    }
    return c.json({ success: true, data: draft });
  } catch (e) {
    return safeErrorResponse(c, e, "week-close-restatement-request");
  }
});

export default app;
