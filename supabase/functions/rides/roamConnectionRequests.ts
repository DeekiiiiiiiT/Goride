import type { Context, Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsonEdgeForbidden, ridesUserSurfaceRole } from "../_shared/authEdge.ts";
import type { RidesContactsDb } from "../_shared/ridesContactsDb.ts";
import { normalizePhoneE164 } from "./rideAccess.ts";
import { resolveRoamUserByPhone } from "./resolveRoamUserByPhone.ts";
import { isRoamConnectionsEnabled } from "./roamConnectionFlags.ts";
import {
  areUsersConnected,
  canonicalPair,
  connectionRequestExpiresAt,
  isBlockedEitherDirection,
  isConnectionRequestExpired,
  maskPhoneE164,
} from "./roamConnectionHelpers.ts";

type ConnectionDeps = {
  getContactsDb: () => Promise<RidesContactsDb>;
  requireUser: (authHeader: string | undefined) => Promise<
    { user: { id: string } } | { error: string; status: 401 }
  >;
  audit: (
    rideId: string | null,
    actor: string | undefined,
    eventType: string,
    payload: Record<string, unknown>,
  ) => Promise<void>;
  rateLimit?: (key: string, max: number, windowMs: number) => boolean;
};

const VALID_SOURCES = new Set([
  "manual", "roam_tag", "device_import", "book_for_someone", "contacts_page",
]);

function featureDisabled(c: Context) {
  return c.json({ error: "feature_disabled" }, 404);
}

function toRequestDto(row: Record<string, unknown>, extras?: Record<string, unknown>) {
  const phone = String(row.target_phone_e164);
  const targetUserId = row.target_user_id ? String(row.target_user_id) : null;
  return {
    id: String(row.id),
    requester_user_id: String(row.requester_user_id),
    target_user_id: targetUserId,
    target_phone_e164: phone,
    target_phone_masked: maskPhoneE164(phone),
    target_display_name: String(row.target_display_name),
    status: String(row.status),
    source: String(row.source),
    expires_at: String(row.expires_at),
    responded_at: row.responded_at ? String(row.responded_at) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    roam_account_linked: Boolean(targetUserId),
    is_invite: !targetUserId,
    ...extras,
  };
}

async function resolveDisplayNameForUser(userId: string): Promise<string | null> {
  try {
    const svc = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const { data } = await svc.auth.admin.getUserById(userId);
    const meta = data.user?.user_metadata as Record<string, unknown> | undefined;
    const name =
      (typeof meta?.full_name === "string" && meta.full_name.trim()) ||
      (typeof meta?.name === "string" && meta.name.trim()) ||
      null;
    return name;
  } catch {
    return null;
  }
}

async function loadCustomTagForUser(userId: string, db: RidesContactsDb["db"], table: string): Promise<string | null> {
  const { data } = await db.from(table).select("custom_tag_name")
    .eq("user_id", userId)
    .maybeSingle();
  const tag = data?.custom_tag_name;
  return typeof tag === "string" && tag.trim() ? tag.trim() : null;
}

async function expireStalePendingRequests(
  db: RidesContactsDb["db"],
  table: string,
  filter: { column: string; value: string },
): Promise<void> {
  const now = new Date().toISOString();
  const { data: rows } = await db.from(table).select("id, status, expires_at")
    .eq(filter.column, filter.value)
    .eq("status", "pending");
  if (!rows?.length) return;
  const expiredIds = rows
    .filter((r) => isConnectionRequestExpired(r as { status: string; expires_at: string }))
    .map((r) => r.id as string);
  if (!expiredIds.length) return;
  await db.from(table).update({ status: "expired", updated_at: now }).in("id", expiredIds);
}

async function upsertRequesterContactOnAccept(
  db: RidesContactsDb["db"],
  tables: RidesContactsDb["tables"],
  requesterUserId: string,
  targetUserId: string,
  displayName: string,
  phoneE164: string,
): Promise<string | null> {
  const { data: existing } = await db.from(tables.rider_contacts).select("id")
    .eq("owner_user_id", requesterUserId)
    .eq("linked_user_id", targetUserId)
    .maybeSingle();
  if (existing?.id) {
    await db.from(tables.rider_contacts).update({
      display_name: displayName,
      phone_e164: phoneE164,
      source: "roam_user",
      bookable: true,
      updated_at: new Date().toISOString(),
    }).eq("id", existing.id);
    return String(existing.id);
  }

  const { data: byPhone } = await db.from(tables.rider_contacts).select("id")
    .eq("owner_user_id", requesterUserId)
    .eq("phone_e164", phoneE164)
    .maybeSingle();

  if (byPhone?.id) {
    await db.from(tables.rider_contacts).update({
      display_name: displayName,
      linked_user_id: targetUserId,
      source: "roam_user",
      bookable: true,
      updated_at: new Date().toISOString(),
    }).eq("id", byPhone.id);
    return String(byPhone.id);
  }

  const { data: inserted, error } = await db.from(tables.rider_contacts).insert({
    owner_user_id: requesterUserId,
    display_name: displayName,
    phone_e164: phoneE164,
    relation: "friend",
    source: "roam_user",
    linked_user_id: targetUserId,
    bookable: true,
    trusted_for_safety: false,
    updated_at: new Date().toISOString(),
  }).select("id").single();

  if (error || !inserted) return null;
  return String(inserted.id);
}

export function registerRoamConnectionRoutes(app: Hono, deps: ConnectionDeps) {
  const requirePassenger = async (c: Context) => {
    const auth = await deps.requireUser(c.req.header("Authorization"));
    if ("error" in auth) return { error: auth, response: c.json({ error: auth.error }, auth.status) };
    if (ridesUserSurfaceRole(auth.user) !== "passenger") {
      return { error: null, response: jsonEdgeForbidden(c, "forbidden_role") };
    }
    return { error: null, response: null, user: auth.user };
  };

  app.get("/v1/roam-connection-requests/outgoing", async (c) => {
    if (!isRoamConnectionsEnabled()) return featureDisabled(c);
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;

    const { db, tables: t } = await deps.getContactsDb();
    await expireStalePendingRequests(db, t.roam_connection_requests, {
      column: "requester_user_id",
      value: gate.user!.id,
    });

    const { data: rows } = await db.from(t.roam_connection_requests)
      .select("*")
      .eq("requester_user_id", gate.user!.id)
      .order("created_at", { ascending: false });

    return c.json({
      requests: (rows ?? []).map((r) => toRequestDto(r as Record<string, unknown>)),
    });
  });

  app.get("/v1/roam-connection-requests/incoming", async (c) => {
    if (!isRoamConnectionsEnabled()) return featureDisabled(c);
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;

    const { db, tables: t } = await deps.getContactsDb();
    await expireStalePendingRequests(db, t.roam_connection_requests, {
      column: "target_user_id",
      value: gate.user!.id,
    });

    const { data: rows } = await db.from(t.roam_connection_requests)
      .select("*")
      .eq("target_user_id", gate.user!.id)
      .in("status", ["pending"])
      .order("created_at", { ascending: false });

    const requests = await Promise.all((rows ?? []).map(async (row) => {
      const requesterId = String((row as Record<string, unknown>).requester_user_id);
      const [displayName, tag] = await Promise.all([
        resolveDisplayNameForUser(requesterId),
        loadCustomTagForUser(requesterId, db, t.roam_passenger_tags),
      ]);
      return toRequestDto(row as Record<string, unknown>, {
        requester_display_name: displayName,
        requester_custom_tag_name: tag,
      });
    }));

    return c.json({ requests });
  });

  app.post("/v1/roam-connection-requests", async (c) => {
    if (!isRoamConnectionsEnabled()) return featureDisabled(c);
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;

    if (deps.rateLimit) {
      const limited = !deps.rateLimit(`${gate.user!.id}:connection_create`, 20, 24 * 60 * 60_000);
      if (limited) return c.json({ error: "rate_limited" }, 429);
    }

    const body = await c.req.json().catch(() => ({}));
    const displayName = typeof body.target_display_name === "string" ? body.target_display_name.trim() : "";
    const rawPhone = typeof body.phone_e164 === "string" ? body.phone_e164.trim() : "";
    const explicitTarget = typeof body.target_user_id === "string" && body.target_user_id.trim()
      ? body.target_user_id.trim()
      : null;
    const source = typeof body.source === "string" && VALID_SOURCES.has(body.source)
      ? body.source
      : "manual";

    if (!displayName || !rawPhone) return c.json({ error: "invalid_body" }, 400);

    let phoneE164: string;
    try {
      phoneE164 = normalizePhoneE164(rawPhone);
    } catch {
      return c.json({ error: "invalid_phone" }, 400);
    }

    let targetUserId: string | null = explicitTarget;
    if (!targetUserId) {
      const resolved = await resolveRoamUserByPhone(phoneE164);
      targetUserId = resolved?.user_id ?? null;
    }

    if (targetUserId === gate.user!.id) {
      return c.json({ error: "cannot_request_self" }, 400);
    }

    const { db, tables: t } = await deps.getContactsDb();

    if (targetUserId) {
      if (await isBlockedEitherDirection(db, t, gate.user!.id, targetUserId)) {
        return c.json({ error: "blocked" }, 403);
      }
      if (await areUsersConnected(db, t, gate.user!.id, targetUserId)) {
        return c.json({ error: "already_connected" }, 409);
      }
      const { data: pendingDup } = await db.from(t.roam_connection_requests).select("id")
        .eq("requester_user_id", gate.user!.id)
        .eq("target_user_id", targetUserId)
        .eq("status", "pending")
        .maybeSingle();
      if (pendingDup?.id) return c.json({ error: "duplicate_pending" }, 409);
    } else {
      const { data: pendingInvite } = await db.from(t.roam_connection_requests).select("id")
        .eq("requester_user_id", gate.user!.id)
        .eq("target_phone_e164", phoneE164)
        .eq("status", "pending")
        .is("target_user_id", null)
        .maybeSingle();
      if (pendingInvite?.id) return c.json({ error: "duplicate_pending" }, 409);
    }

    const now = new Date().toISOString();
    const { data: row, error } = await db.from(t.roam_connection_requests).insert({
      requester_user_id: gate.user!.id,
      target_user_id: targetUserId,
      target_phone_e164: phoneE164,
      target_display_name: displayName,
      status: "pending",
      source,
      expires_at: connectionRequestExpiresAt(),
      updated_at: now,
    }).select("*").single();

    if (error || !row) {
      if (error?.code === "23505") return c.json({ error: "duplicate_pending" }, 409);
      return c.json({ error: "insert_failed" }, 500);
    }

    await deps.audit(null, gate.user!.id, "roam_connection_request_created", {
      request_id: row.id,
      target_user_id: targetUserId,
    });

    return c.json({ request: toRequestDto(row as Record<string, unknown>) });
  });

  app.post("/v1/roam-connection-requests/sync-phone", async (c) => {
    if (!isRoamConnectionsEnabled()) return featureDisabled(c);
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;

    const svc = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const { data: authData } = await svc.auth.admin.getUserById(gate.user!.id);
    const rawPhone = authData.user?.phone;
    if (!rawPhone) return c.json({ matched_count: 0 });

    let phoneE164: string;
    try {
      phoneE164 = normalizePhoneE164(rawPhone);
    } catch {
      return c.json({ matched_count: 0 });
    }

    const { db, tables: t } = await deps.getContactsDb();
    const now = new Date().toISOString();
    const { data: pendingInvites } = await db.from(t.roam_connection_requests)
      .select("id")
      .is("target_user_id", null)
      .eq("target_phone_e164", phoneE164)
      .eq("status", "pending");

    if (!pendingInvites?.length) return c.json({ matched_count: 0 });

    const ids = pendingInvites.map((r) => r.id as string);
    const { error } = await db.from(t.roam_connection_requests).update({
      target_user_id: gate.user!.id,
      updated_at: now,
    }).in("id", ids);

    if (error) return c.json({ error: "sync_failed" }, 500);

    await deps.audit(null, gate.user!.id, "roam_connection_invite_matched", {
      matched_count: ids.length,
      request_ids: ids,
    });

    return c.json({ matched_count: ids.length });
  });

  app.post("/v1/roam-connection-requests/:id/accept", async (c) => {
    if (!isRoamConnectionsEnabled()) return featureDisabled(c);
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;

    if (deps.rateLimit) {
      const limited = !deps.rateLimit(`${gate.user!.id}:connection_respond`, 60, 60 * 60_000);
      if (limited) return c.json({ error: "rate_limited" }, 429);
    }

    const id = c.req.param("id");
    const { db, tables: t } = await deps.getContactsDb();
    const { data: row } = await db.from(t.roam_connection_requests)
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (!row) return c.json({ error: "not_found" }, 404);
    if (String(row.target_user_id) !== gate.user!.id) {
      return c.json({ error: "forbidden" }, 403);
    }
    if (row.status !== "pending") return c.json({ error: "not_pending" }, 409);
    if (isConnectionRequestExpired(row as { status: string; expires_at: string })) {
      await db.from(t.roam_connection_requests).update({
        status: "expired",
        updated_at: new Date().toISOString(),
      }).eq("id", id);
      return c.json({ error: "expired" }, 410);
    }

    const requesterId = String(row.requester_user_id);
    if (await isBlockedEitherDirection(db, t, gate.user!.id, requesterId)) {
      return c.json({ error: "blocked" }, 403);
    }

    const now = new Date().toISOString();
    const pair = canonicalPair(requesterId, gate.user!.id);

    const { error: connErr } = await db.from(t.roam_connections).insert({
      user_a_id: pair.user_a_id,
      user_b_id: pair.user_b_id,
      established_at: now,
    });
    if (connErr && connErr.code !== "23505") {
      return c.json({ error: "connection_failed" }, 500);
    }

    const { error: updErr } = await db.from(t.roam_connection_requests).update({
      status: "accepted",
      responded_at: now,
      updated_at: now,
    }).eq("id", id).eq("status", "pending");

    if (updErr) return c.json({ error: "accept_failed" }, 500);

    const contactId = await upsertRequesterContactOnAccept(
      db,
      t,
      requesterId,
      gate.user!.id,
      String(row.target_display_name),
      String(row.target_phone_e164),
    );

    await deps.audit(null, gate.user!.id, "roam_connection_request_accepted", {
      request_id: id,
      requester_user_id: requesterId,
      contact_id: contactId,
    });

    const { data: updated } = await db.from(t.roam_connection_requests)
      .select("*")
      .eq("id", id)
      .single();

    return c.json({
      request: toRequestDto(updated as Record<string, unknown>),
      contact_id: contactId,
    });
  });

  app.post("/v1/roam-connection-requests/:id/reject", async (c) => {
    if (!isRoamConnectionsEnabled()) return featureDisabled(c);
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;

    if (deps.rateLimit) {
      const limited = !deps.rateLimit(`${gate.user!.id}:connection_respond`, 60, 60 * 60_000);
      if (limited) return c.json({ error: "rate_limited" }, 429);
    }

    const id = c.req.param("id");
    const { db, tables: t } = await deps.getContactsDb();
    const { data: row } = await db.from(t.roam_connection_requests)
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (!row) return c.json({ error: "not_found" }, 404);
    if (String(row.target_user_id) !== gate.user!.id) {
      return c.json({ error: "forbidden" }, 403);
    }
    if (row.status !== "pending") return c.json({ error: "not_pending" }, 409);

    const now = new Date().toISOString();
    const { error } = await db.from(t.roam_connection_requests).update({
      status: "rejected",
      responded_at: now,
      updated_at: now,
    }).eq("id", id).eq("status", "pending");

    if (error) return c.json({ error: "reject_failed" }, 500);

    await deps.audit(null, gate.user!.id, "roam_connection_request_rejected", {
      request_id: id,
    });

    const { data: updated } = await db.from(t.roam_connection_requests)
      .select("*")
      .eq("id", id)
      .single();

    return c.json({ request: toRequestDto(updated as Record<string, unknown>) });
  });

  app.post("/v1/roam-connection-requests/:id/cancel", async (c) => {
    if (!isRoamConnectionsEnabled()) return featureDisabled(c);
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;

    const id = c.req.param("id");
    const { db, tables: t } = await deps.getContactsDb();
    const { data: row } = await db.from(t.roam_connection_requests)
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (!row) return c.json({ error: "not_found" }, 404);
    if (String(row.requester_user_id) !== gate.user!.id) {
      return c.json({ error: "forbidden" }, 403);
    }
    if (row.status !== "pending") return c.json({ error: "not_pending" }, 409);

    const now = new Date().toISOString();
    const { error } = await db.from(t.roam_connection_requests).update({
      status: "cancelled",
      responded_at: now,
      updated_at: now,
    }).eq("id", id).eq("status", "pending");

    if (error) return c.json({ error: "cancel_failed" }, 500);

    await deps.audit(null, gate.user!.id, "roam_connection_request_cancelled", {
      request_id: id,
    });

    const { data: updated } = await db.from(t.roam_connection_requests)
      .select("*")
      .eq("id", id)
      .single();

    return c.json({ request: toRequestDto(updated as Record<string, unknown>) });
  });

  // Block / report routes (Phase 5)
  app.get("/v1/user-blocks", async (c) => {
    if (!isRoamConnectionsEnabled()) return featureDisabled(c);
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;

    const { db, tables: t } = await deps.getContactsDb();
    const { data: rows } = await db.from(t.user_blocks)
      .select("*")
      .eq("blocker_user_id", gate.user!.id)
      .order("created_at", { ascending: false });

    const blocks = await Promise.all((rows ?? []).map(async (row) => {
      const blockedId = String((row as Record<string, unknown>).blocked_user_id);
      const displayName = await resolveDisplayNameForUser(blockedId);
      return {
        id: String((row as Record<string, unknown>).id),
        blocked_user_id: blockedId,
        blocked_display_name: displayName,
        created_at: String((row as Record<string, unknown>).created_at),
      };
    }));

    return c.json({ blocks });
  });

  app.post("/v1/user-blocks", async (c) => {
    if (!isRoamConnectionsEnabled()) return featureDisabled(c);
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;

    const body = await c.req.json().catch(() => ({}));
    const blockedUserId = typeof body.blocked_user_id === "string" ? body.blocked_user_id.trim() : "";
    if (!blockedUserId) return c.json({ error: "invalid_body" }, 400);
    if (blockedUserId === gate.user!.id) return c.json({ error: "cannot_block_self" }, 400);

    const { db, tables: t } = await deps.getContactsDb();
    const { data, error } = await db.from(t.user_blocks).insert({
      blocker_user_id: gate.user!.id,
      blocked_user_id: blockedUserId,
    }).select("*").single();

    if (error) {
      if (error.code === "23505") return c.json({ ok: true, already_blocked: true });
      return c.json({ error: "block_failed" }, 500);
    }

    await deps.audit(null, gate.user!.id, "user_blocked", {
      blocked_user_id: blockedUserId,
    });

    return c.json({
      block: {
        id: String(data.id),
        blocked_user_id: blockedUserId,
        blocked_display_name: await resolveDisplayNameForUser(blockedUserId),
        created_at: String(data.created_at),
      },
    });
  });

  app.delete("/v1/user-blocks/:blockedUserId", async (c) => {
    if (!isRoamConnectionsEnabled()) return featureDisabled(c);
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;

    const blockedUserId = c.req.param("blockedUserId");
    const { db, tables: t } = await deps.getContactsDb();
    await db.from(t.user_blocks).delete()
      .eq("blocker_user_id", gate.user!.id)
      .eq("blocked_user_id", blockedUserId);

    return c.json({ ok: true });
  });

  app.post("/v1/abuse-reports", async (c) => {
    if (!isRoamConnectionsEnabled()) return featureDisabled(c);
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;

    const body = await c.req.json().catch(() => ({}));
    const reportedUserId = typeof body.reported_user_id === "string" ? body.reported_user_id.trim() : "";
    const reasonCode = typeof body.reason_code === "string" ? body.reason_code.trim() : "";
    if (!reportedUserId || !reasonCode) return c.json({ error: "invalid_body" }, 400);
    if (reportedUserId === gate.user!.id) return c.json({ error: "cannot_report_self" }, 400);

    const { db, tables: t } = await deps.getContactsDb();
    const { data, error } = await db.from(t.abuse_reports).insert({
      reporter_user_id: gate.user!.id,
      reported_user_id: reportedUserId,
      reason_code: reasonCode,
      details: typeof body.details === "string" ? body.details.trim() : null,
      context_json: body.context && typeof body.context === "object" ? body.context : null,
    }).select("id").single();

    if (error || !data) return c.json({ error: "report_failed" }, 500);

    await deps.audit(null, gate.user!.id, "abuse_report_submitted", {
      report_id: data.id,
      reported_user_id: reportedUserId,
      reason_code: reasonCode,
    });

    return c.json({ ok: true, report_id: String(data.id) });
  });
}
