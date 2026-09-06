/**
 * Driver notes — KV-backed list per driver.
 * GET  /drivers/:id/notes
 * POST /drivers/:id/notes
 */
import type { Context, Hono } from "npm:hono";
import * as kv from "./kv_store.tsx";
import { requireAuth, requirePermission } from "./rbac_middleware.ts";
import { filterByOrgSafe, getOrgId, stampOrg } from "./org_scope.ts";
import { shouldReadTable, listByOrg } from "./repos/baseRepo.ts";

const PREFIX = "/make-server-37f42386";

function asStr(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : v != null ? String(v) : fallback;
}

function notesKey(driverId: string): string {
  return `driver_notes:${driverId}`;
}

export type DriverNote = {
  id: string;
  driverId: string;
  text: string;
  createdAt: string;
  createdBy: string;
  /** Optional YYYY-MM-DD follow-up for ops reminders. */
  followUpDate?: string | null;
  organizationId?: string | null;
};

async function assertDriverInOrg(c: Context, driverId: string): Promise<boolean> {
  const id = asStr(driverId).trim();
  if (!id) return false;
  if (shouldReadTable("drivers")) {
    const orgId = getOrgId(c);
    const rows = await listByOrg("drivers", orgId, { limit: 2000 });
    return (rows || []).some((d: any) => asStr(d?.id) === id);
  }
  const fromKv = await kv.get(`driver:${id}`);
  if (!fromKv) return false;
  const scoped = await filterByOrgSafe([fromKv as Record<string, unknown>], c, {
    endpoint: "/drivers/:id/notes",
  });
  return scoped.length > 0;
}

async function handleGetNotes(c: Context) {
  const driverId = c.req.param("id");
  try {
    if (!(await assertDriverInOrg(c, driverId))) {
      return c.json({ error: "Driver not found" }, 404);
    }
    const bag = (await kv.get(notesKey(driverId))) as { notes?: DriverNote[] } | null;
    const notes = Array.isArray(bag?.notes) ? bag!.notes! : [];
    notes.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return c.json({ success: true, notes });
  } catch (e: any) {
    console.error("[drivers/notes] GET failed:", e?.message || e);
    return c.json({ error: e?.message || "Notes fetch failed" }, 500);
  }
}

async function handlePostNote(c: Context) {
  const driverId = c.req.param("id");
  try {
    if (!(await assertDriverInOrg(c, driverId))) {
      return c.json({ error: "Driver not found" }, 404);
    }
    const body = await c.req.json().catch(() => ({}));
    const text = asStr(body?.text).trim();
    if (!text) return c.json({ error: "text is required" }, 400);
    if (text.length > 4000) return c.json({ error: "text too long (max 4000)" }, 400);

    const rbacUser = c.get("rbacUser") as { userId?: string; email?: string } | undefined;
    const createdBy = asStr(body?.createdBy) || asStr(rbacUser?.email) || asStr(rbacUser?.userId) || "unknown";
    const followUpRaw = asStr(body?.followUpDate).trim();
    const followUpDate =
      followUpRaw && /^\d{4}-\d{2}-\d{2}$/.test(followUpRaw) ? followUpRaw : null;
    const note: DriverNote = stampOrg(
      {
        id: crypto.randomUUID(),
        driverId,
        text,
        createdAt: new Date().toISOString(),
        createdBy,
        followUpDate,
      },
      c,
    ) as DriverNote;

    const bag = (await kv.get(notesKey(driverId))) as { notes?: DriverNote[] } | null;
    const prev = Array.isArray(bag?.notes) ? bag!.notes! : [];
    const next = [note, ...prev].slice(0, 200);
    await kv.set(notesKey(driverId), stampOrg({ notes: next, driverId, updatedAt: note.createdAt }, c));

    return c.json({ success: true, note, notes: next });
  } catch (e: any) {
    console.error("[drivers/notes] POST failed:", e?.message || e);
    return c.json({ error: e?.message || "Note create failed" }, 500);
  }
}

export function registerDriversNotesRoutes(app: Hono) {
  app.get(
    `${PREFIX}/drivers/:id/notes`,
    requireAuth({ requireOrg: true }),
    handleGetNotes,
  );
  app.post(
    `${PREFIX}/drivers/:id/notes`,
    requireAuth({ requireOrg: true }),
    requirePermission("drivers.edit"),
    handlePostNote,
  );
}
