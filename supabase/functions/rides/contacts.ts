import type { Context, Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { deniesPassengerSurface, jsonEdgeForbidden } from "../_shared/authEdge.ts";
import type { RidesContactsDb, RidesContactsTables } from "../_shared/ridesContactsDb.ts";
import { normalizePhoneE164 } from "./rideAccess.ts";
import {
  addContactsToGroup,
  ensureDefaultContactGroups,
  enrichGroupDetail,
  enrichGroupSummary,
  isSystemGroup,
  systemNameTaken,
} from "./contactGroupHelpers.ts";
import { isTripIntentV2Enabled } from "./tripIntentFlags.ts";
import { loadActiveTripIntentSummary } from "./tripIntents.ts";
import {
  maybeRelinkContactRow,
  resolveContactRoamLink,
  withRoamLinkFlag,
} from "./contactRoamLink.ts";
import { isRoamConnectionsEnabled } from "./roamConnectionFlags.ts";
import {
  cancelPendingConnectionRequestsBetween,
  cancelPendingPhoneInvitesFrom,
  removeRoamConnection,
} from "./roamConnectionHelpers.ts";

const VALID_RELATIONS = new Set([
  "father", "mother", "sibling", "spouse", "friend", "colleague", "other",
]);

const MAX_TRUSTED_CONTACTS = 5;

async function countTrustedContacts(
  db: SupabaseClient,
  tables: RidesContactsTables,
  ownerId: string,
  excludeContactId?: string,
): Promise<number> {
  let query = db.from(tables.rider_contacts)
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", ownerId)
    .eq("trusted_for_safety", true);
  if (excludeContactId) {
    query = query.neq("id", excludeContactId);
  }
  const { count } = await query;
  return count ?? 0;
}

async function assertTrustedLimit(
  db: SupabaseClient,
  tables: RidesContactsTables,
  ownerId: string,
  addingCount: number,
  excludeContactId?: string,
): Promise<string | null> {
  const current = await countTrustedContacts(db, tables, ownerId, excludeContactId);
  if (current + addingCount > MAX_TRUSTED_CONTACTS) {
    return "trusted_limit_reached";
  }
  return null;
}

type ContactsDeps = {
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
};

function validateRelation(relation: string, relationCustom: string | null): string | null {
  if (!VALID_RELATIONS.has(relation)) return "invalid_relation";
  if (relation === "other" && !relationCustom?.trim()) return "relation_custom_required";
  return null;
}

async function loadContactGroupsForContact(
  db: SupabaseClient,
  tables: RidesContactsTables,
  contactId: string,
): Promise<Record<string, unknown>[]> {
  const { data: members } = await db.from(tables.rider_contact_group_members)
    .select("group_id")
    .eq("contact_id", contactId);
  if (!members?.length) return [];
  const groupIds = members.map((m) => m.group_id as string);
  const { data: groups } = await db.from(tables.rider_contact_groups)
    .select("*")
    .in("id", groupIds);
  return groups ?? [];
}

async function loadPlacesForContact(
  db: SupabaseClient,
  tables: RidesContactsTables,
  contactId: string,
): Promise<Record<string, unknown>[]> {
  const { data } = await db.from(tables.rider_contact_places)
    .select("*")
    .eq("contact_id", contactId)
    .order("created_at", { ascending: true });
  return data ?? [];
}

async function loadCustomTagForUser(
  db: SupabaseClient,
  tagsTable: string,
  userId: string,
): Promise<string | null> {
  const { data } = await db.from(tagsTable)
    .select("custom_tag_name")
    .eq("user_id", userId)
    .maybeSingle();
  const name = data?.custom_tag_name;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

async function enrichContact(
  db: SupabaseClient,
  tables: RidesContactsTables,
  row: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const linkedRow = await maybeRelinkContactRow(db, tables, row);
  const id = linkedRow.id as string;
  const linkedUserId = linkedRow.linked_user_id ? String(linkedRow.linked_user_id) : null;
  const [groups, places, intentSummary, customTagName] = await Promise.all([
    loadContactGroupsForContact(db, tables, id),
    loadPlacesForContact(db, tables, id),
    isTripIntentV2Enabled() && linkedUserId
      ? loadActiveTripIntentSummary(db, tables.booking_requests, linkedUserId)
      : Promise.resolve(null),
    linkedUserId
      ? loadCustomTagForUser(db, tables.roam_passenger_tags, linkedUserId)
      : Promise.resolve(null),
  ]);
  return {
    ...withRoamLinkFlag(linkedRow),
    custom_tag_name: customTagName,
    groups,
    places,
    ...(intentSummary ? { active_trip_intent_summary: intentSummary } : {}),
  };
}

async function syncContactGroups(
  db: SupabaseClient,
  tables: RidesContactsTables,
  ownerId: string,
  contactId: string,
  groupIds: string[] | undefined,
): Promise<void> {
  if (groupIds === undefined) return;
  await db.from(tables.rider_contact_group_members).delete().eq("contact_id", contactId);
  if (!groupIds.length) return;
  const { data: valid } = await db.from(tables.rider_contact_groups)
    .select("id")
    .eq("owner_user_id", ownerId)
    .in("id", groupIds);
  const rows = (valid ?? []).map((g) => ({
    group_id: g.id as string,
    contact_id: contactId,
  }));
  if (rows.length) {
    await db.from(tables.rider_contact_group_members).insert(rows);
  }
}

export function registerContactsRoutes(app: Hono, deps: ContactsDeps) {
  const requirePassenger = async (c: Context) => {
    const auth = await deps.requireUser(c.req.header("Authorization"));
    if ("error" in auth) return { error: auth, response: c.json({ error: auth.error }, auth.status) };
    if (deniesPassengerSurface(auth.user)) {
      return { error: null, response: jsonEdgeForbidden(c, "forbidden_role") };
    }
    return { user: auth.user, response: null };
  };

  app.get("/v1/contacts", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;
    const { db, tables: t } = await deps.getContactsDb();
    const q = c.req.query("q")?.trim().toLowerCase();
    const trusted = c.req.query("trusted_for_safety");
    const groupId = c.req.query("group_id")?.trim();
    let query = db.from(t.rider_contacts).select("*").eq("owner_user_id", gate.user!.id)
      .order("display_name", { ascending: true });
    if (trusted === "true") query = query.eq("trusted_for_safety", true);
    if (trusted === "false") query = query.eq("trusted_for_safety", false);
    const { data, error } = await query;
    if (error) return c.json({ error: "fetch_failed", message: error.message }, 500);
    let rows = data ?? [];
    if (groupId) {
      const { data: members } = await db.from(t.rider_contact_group_members)
        .select("contact_id")
        .eq("group_id", groupId);
      const memberIds = new Set((members ?? []).map((m) => m.contact_id as string));
      rows = rows.filter((r) => memberIds.has(r.id as string));
    }
    if (q) {
      rows = rows.filter((r) =>
        String(r.display_name).toLowerCase().includes(q) ||
        String(r.phone_e164).includes(q)
      );
    }
    const contacts = await Promise.all(rows.map((r) => enrichContact(db, t, r as Record<string, unknown>)));
    return c.json({ contacts });
  });

  app.post("/v1/contacts", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;
    const body = await c.req.json().catch(() => ({}));
    const displayName = typeof body.display_name === "string" ? body.display_name.trim() : "";
    const phoneRaw = typeof body.phone_e164 === "string" ? body.phone_e164.trim() : "";
    if (!displayName || !phoneRaw) return c.json({ error: "invalid_body" }, 400);
    const relation = typeof body.relation === "string" ? body.relation : "friend";
    const relationCustom = typeof body.relation_custom === "string" ? body.relation_custom.trim() : null;
    const relErr = validateRelation(relation, relationCustom);
    if (relErr) return c.json({ error: relErr }, 400);
    const explicitLinked = typeof body.linked_user_id === "string" && body.linked_user_id.trim()
      ? body.linked_user_id.trim()
      : null;
    const fallbackSource = typeof body.source === "string" ? body.source : "manual";
    const link = await resolveContactRoamLink(phoneRaw, explicitLinked, fallbackSource);
    const linkedUserId = link.linked_user_id;
    const source = link.source;

    const { db, tables: t } = await deps.getContactsDb();

    if (isRoamConnectionsEnabled()) {
      if (linkedUserId || link.roam_account_linked) {
        return c.json({
          error: "connection_required",
          message: "Send a connection request instead of adding this Roam user directly.",
        }, 409);
      }
      return c.json({
        error: "invite_required",
        message: "Send a connection invite instead of saving this contact directly.",
      }, 409);
    }

    if (body.trusted_for_safety === true) {
      const limitErr = await assertTrustedLimit(db, t, gate.user!.id, 1);
      if (limitErr) return c.json({ error: limitErr, message: `Maximum ${MAX_TRUSTED_CONTACTS} trusted contacts` }, 409);
    }

    if (linkedUserId) {
      const { data: linkedExisting } = await db.from(t.rider_contacts).select("id")
        .eq("owner_user_id", gate.user!.id)
        .eq("linked_user_id", linkedUserId)
        .maybeSingle();
      if (linkedExisting?.id) {
        return c.json({ error: "duplicate_roam_user" }, 409);
      }
    }

    const insertRow = {
      owner_user_id: gate.user!.id,
      display_name: displayName,
      phone_e164: link.phone_e164,
      relation,
      relation_custom: relation === "other" ? relationCustom : null,
      source,
      linked_user_id: linkedUserId,
      bookable: body.bookable !== false,
      trusted_for_safety: body.trusted_for_safety === true,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await db.from(t.rider_contacts).insert(insertRow).select("*").single();
    if (error) {
      if (error.code === "23505") return c.json({ error: "duplicate_phone" }, 409);
      return c.json({ error: "insert_failed", message: error.message }, 500);
    }
    await syncContactGroups(db, t, gate.user!.id, data.id as string, body.group_ids);
    await deps.audit(null, gate.user!.id, "rider_contact_created", { contact_id: data.id });
    return c.json({ contact: await enrichContact(db, t, data as Record<string, unknown>) });
  });

  app.post("/v1/contacts/batch-import", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;
    if (isRoamConnectionsEnabled()) {
      return c.json({
        error: "invite_required",
        message: "Use connection requests for device import when Roam connections are enabled.",
      }, 409);
    }
    const body = await c.req.json().catch(() => ({}));
    const items = Array.isArray(body.contacts) ? body.contacts : [];
    const { db, tables: t } = await deps.getContactsDb();
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    let firstError: string | null = null;
    const results: Record<string, unknown>[] = [];
    for (const item of items) {
      const displayName = typeof item.display_name === "string" ? item.display_name.trim() : "";
      const phoneRaw = typeof item.phone_e164 === "string" ? item.phone_e164.trim() : "";
      if (!displayName || !phoneRaw) {
        skipped++;
        continue;
      }
      const relation = typeof item.relation === "string" ? item.relation : "friend";
      const relationCustom = typeof item.relation_custom === "string" ? item.relation_custom.trim() : null;
      const relErr = validateRelation(relation, relationCustom);
      if (relErr) {
        skipped++;
        continue;
      }
      const link = await resolveContactRoamLink(phoneRaw, null, "device_import");
      const phoneE164 = link.phone_e164;
      const { data: existing } = await db.from(t.rider_contacts).select("id")
        .eq("owner_user_id", gate.user!.id)
        .eq("phone_e164", phoneE164)
        .maybeSingle();

      if (existing?.id) {
        const { data, error } = await db.from(t.rider_contacts).update({
          display_name: displayName,
          source: link.roam_account_linked ? "roam_user" : "device_import",
          linked_user_id: link.linked_user_id,
          bookable: true,
          updated_at: new Date().toISOString(),
        }).eq("id", existing.id).select("*").single();
        if (error) {
          failed++;
          if (!firstError) firstError = error.message;
          continue;
        }
        updated++;
        results.push(await enrichContact(db, t, data as Record<string, unknown>));
        continue;
      }

      const { data, error } = await db.from(t.rider_contacts).insert({
        owner_user_id: gate.user!.id,
        display_name: displayName,
        phone_e164: phoneE164,
        relation,
        relation_custom: relation === "other" ? relationCustom : null,
        source: link.roam_account_linked ? "roam_user" : "device_import",
        linked_user_id: link.linked_user_id,
        bookable: true,
        updated_at: new Date().toISOString(),
      }).select("*").single();
      if (error) {
        failed++;
        if (!firstError) firstError = error.message;
        continue;
      }
      imported++;
      results.push(await enrichContact(db, t, data as Record<string, unknown>));
    }
    return c.json({
      imported,
      updated,
      skipped,
      failed,
      ...(firstError ? { error: firstError } : {}),
      contacts: results,
    });
  });

  app.get("/v1/contacts/:id", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;
    const { db, tables: t } = await deps.getContactsDb();
    const { data, error } = await db.from(t.rider_contacts).select("*")
      .eq("id", c.req.param("id"))
      .eq("owner_user_id", gate.user!.id)
      .maybeSingle();
    if (error) return c.json({ error: "fetch_failed" }, 500);
    if (!data) return c.json({ error: "not_found" }, 404);
    return c.json({ contact: await enrichContact(db, t, data as Record<string, unknown>) });
  });

  app.patch("/v1/contacts/:id", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;
    const body = await c.req.json().catch(() => ({}));
    const { db, tables: t } = await deps.getContactsDb();
    const contactId = c.req.param("id");
    const { data: existing } = await db.from(t.rider_contacts).select("*")
      .eq("id", contactId).eq("owner_user_id", gate.user!.id).maybeSingle();
    if (!existing) return c.json({ error: "not_found" }, 404);

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.display_name === "string") patch.display_name = body.display_name.trim();
    const phoneChanging = typeof body.phone_e164 === "string";
    if (phoneChanging) patch.phone_e164 = normalizePhoneE164(body.phone_e164);
    if (typeof body.linked_user_id === "string" && body.linked_user_id.trim()) {
      if (isRoamConnectionsEnabled()) {
        return c.json({ error: "connection_required" }, 409);
      }
      patch.linked_user_id = body.linked_user_id.trim();
      patch.source = "roam_user";
    } else if (phoneChanging) {
      const link = await resolveContactRoamLink(
        String(body.phone_e164),
        null,
        String(existing.source ?? "manual"),
      );
      if (isRoamConnectionsEnabled() && link.roam_account_linked) {
        return c.json({ error: "connection_required" }, 409);
      }
      patch.linked_user_id = link.linked_user_id;
      patch.source = link.roam_account_linked ? "roam_user" : existing.source;
      patch.phone_e164 = link.phone_e164;
    }
    if (typeof body.relation === "string") patch.relation = body.relation;
    if (body.relation_custom !== undefined) {
      patch.relation_custom = typeof body.relation_custom === "string" ? body.relation_custom.trim() : null;
    }
    if (typeof body.bookable === "boolean") patch.bookable = body.bookable;
    if (typeof body.trusted_for_safety === "boolean") patch.trusted_for_safety = body.trusted_for_safety;

    if (body.trusted_for_safety === true && !existing.trusted_for_safety) {
      const limitErr = await assertTrustedLimit(db, t, gate.user!.id, 1, contactId);
      if (limitErr) return c.json({ error: limitErr, message: `Maximum ${MAX_TRUSTED_CONTACTS} trusted contacts` }, 409);
    }

    const relation = String(patch.relation ?? existing.relation);
    const relationCustom = (patch.relation_custom ?? existing.relation_custom) as string | null;
    const relErr = validateRelation(relation, relationCustom);
    if (relErr) return c.json({ error: relErr }, 400);
    if (relation !== "other") patch.relation_custom = null;

    const { data, error } = await db.from(t.rider_contacts).update(patch)
      .eq("id", contactId).select("*").single();
    if (error) return c.json({ error: "update_failed", message: error.message }, 500);
    await syncContactGroups(db, t, gate.user!.id, contactId, body.group_ids);
    return c.json({ contact: await enrichContact(db, t, data as Record<string, unknown>) });
  });

  app.post("/v1/contacts/trusted/bulk", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;
    const body = await c.req.json().catch(() => ({}));
    const contactIds = Array.isArray(body.contact_ids)
      ? [...new Set(body.contact_ids.filter((id: unknown) => typeof id === "string"))]
      : [];
    if (!contactIds.length) return c.json({ error: "invalid_body" }, 400);

    const { db, tables: t } = await deps.getContactsDb();
    const { data: rows } = await db.from(t.rider_contacts)
      .select("*")
      .eq("owner_user_id", gate.user!.id)
      .in("id", contactIds);
    if (!rows?.length) return c.json({ error: "not_found" }, 404);

    const toTrust = rows.filter((r) => !r.trusted_for_safety);
    const limitErr = await assertTrustedLimit(db, t, gate.user!.id, toTrust.length);
    if (limitErr) {
      return c.json({ error: limitErr, message: `Maximum ${MAX_TRUSTED_CONTACTS} trusted contacts` }, 409);
    }

    const now = new Date().toISOString();
    const updated: Record<string, unknown>[] = [];
    for (const row of toTrust) {
      const { data, error } = await db.from(t.rider_contacts)
        .update({ trusted_for_safety: true, updated_at: now })
        .eq("id", row.id as string)
        .select("*")
        .single();
      if (error || !data) continue;
      updated.push(await enrichContact(db, t, data as Record<string, unknown>));
    }

    await deps.audit(null, gate.user!.id, "trusted_contacts_bulk_marked", {
      contact_ids: updated.map((c) => c.id),
    });

    return c.json({ updated: updated.length, contacts: updated });
  });

  app.delete("/v1/contacts/:id", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;
    const contactId = c.req.param("id");
    const { db, tables: t } = await deps.getContactsDb();
    const { data: existing } = await db.from(t.rider_contacts).select("linked_user_id, phone_e164")
      .eq("id", contactId)
      .eq("owner_user_id", gate.user!.id)
      .maybeSingle();
    if (!existing) return c.json({ error: "not_found" }, 404);

    const { error } = await db.from(t.rider_contacts).delete()
      .eq("id", contactId).eq("owner_user_id", gate.user!.id);
    if (error) return c.json({ error: "delete_failed" }, 500);

    if (isRoamConnectionsEnabled()) {
      const linkedUserId = existing.linked_user_id ? String(existing.linked_user_id) : null;
      const phoneE164 = String(existing.phone_e164 ?? "");
      if (linkedUserId) {
        await removeRoamConnection(db, t, gate.user!.id, linkedUserId);
        await cancelPendingConnectionRequestsBetween(db, t, gate.user!.id, linkedUserId);
      }
      if (phoneE164) {
        await cancelPendingPhoneInvitesFrom(db, t, gate.user!.id, phoneE164);
      }
      await deps.audit(null, gate.user!.id, "rider_contact_deleted", {
        contact_id: contactId,
        linked_user_id: linkedUserId,
        disconnected: Boolean(linkedUserId),
      });
    } else {
      await deps.audit(null, gate.user!.id, "rider_contact_deleted", { contact_id: contactId });
    }

    return c.json({ ok: true });
  });

  app.post("/v1/contact-groups/ensure-defaults", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;
    const { db, tables: t } = await deps.getContactsDb();
    await ensureDefaultContactGroups(db, t, gate.user!.id);
    return c.json({ ok: true });
  });

  app.get("/v1/contact-groups", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;
    const { db, tables: t } = await deps.getContactsDb();
    const { data, error } = await db.from(t.rider_contact_groups).select("*")
      .eq("owner_user_id", gate.user!.id);
    if (error) return c.json({ error: "fetch_failed" }, 500);
    const rows = (data ?? []) as Record<string, unknown>[];
    rows.sort((a, b) => {
      const aPin = a.is_pinned === true ? 0 : 1;
      const bPin = b.is_pinned === true ? 0 : 1;
      if (aPin !== bPin) return aPin - bPin;
      const aOrder = Number(a.sort_order ?? 0);
      const bOrder = Number(b.sort_order ?? 0);
      if (aPin === 0 && aOrder !== bOrder) return aOrder - bOrder;
      return String(a.name).localeCompare(String(b.name));
    });
    const groups = await Promise.all(
      rows.map((g) => enrichGroupSummary(db, t, g, gate.user!.id)),
    );
    return c.json({ groups });
  });

  app.post("/v1/contact-groups", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;
    const body = await c.req.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return c.json({ error: "invalid_body" }, 400);
    if (systemNameTaken(name)) return c.json({ error: "reserved_group_name" }, 409);
    const emoji = typeof body.emoji === "string" ? body.emoji.trim() || null : null;
    const color = typeof body.color === "string" ? body.color.trim() || null : null;
    const { db, tables: t } = await deps.getContactsDb();
    const { data, error } = await db.from(t.rider_contact_groups).insert({
      owner_user_id: gate.user!.id,
      name,
      emoji,
      color,
      is_system: false,
      is_pinned: false,
      sort_order: 100,
      updated_at: new Date().toISOString(),
    }).select("*").single();
    if (error) {
      if (error.code === "23505") return c.json({ error: "duplicate_group" }, 409);
      return c.json({ error: "insert_failed" }, 500);
    }
    return c.json({ group: await enrichGroupSummary(db, t, data as Record<string, unknown>, gate.user!.id) });
  });

  app.get("/v1/contact-groups/:id", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;
    const { db, tables: t } = await deps.getContactsDb();
    const { data, error } = await db.from(t.rider_contact_groups).select("*")
      .eq("id", c.req.param("id"))
      .eq("owner_user_id", gate.user!.id)
      .maybeSingle();
    if (error) return c.json({ error: "fetch_failed" }, 500);
    if (!data) return c.json({ error: "not_found" }, 404);
    return c.json({
      group: await enrichGroupDetail(db, t, data as Record<string, unknown>, gate.user!.id),
    });
  });

  app.patch("/v1/contact-groups/:id", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;
    const body = await c.req.json().catch(() => ({}));
    const { db, tables: t } = await deps.getContactsDb();
    const groupId = c.req.param("id");
    const { data: existing } = await db.from(t.rider_contact_groups).select("*")
      .eq("id", groupId).eq("owner_user_id", gate.user!.id).maybeSingle();
    if (!existing) return c.json({ error: "not_found" }, 404);

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (isSystemGroup(existing as Record<string, unknown>)) {
      if (typeof body.is_pinned === "boolean") patch.is_pinned = body.is_pinned;
      else return c.json({ error: "system_group_readonly" }, 403);
    } else {
      if (typeof body.name === "string") {
        const name = body.name.trim();
        if (!name) return c.json({ error: "invalid_body" }, 400);
        if (systemNameTaken(name)) return c.json({ error: "reserved_group_name" }, 409);
        patch.name = name;
      }
      if (body.emoji !== undefined) {
        patch.emoji = typeof body.emoji === "string" ? body.emoji.trim() || null : null;
      }
      if (body.color !== undefined) {
        patch.color = typeof body.color === "string" ? body.color.trim() || null : null;
      }
      if (typeof body.is_pinned === "boolean") patch.is_pinned = body.is_pinned;
    }

    const { data, error } = await db.from(t.rider_contact_groups).update(patch)
      .eq("id", groupId).select("*").single();
    if (error) return c.json({ error: "update_failed", message: error.message }, 500);
    return c.json({
      group: await enrichGroupSummary(db, t, data as Record<string, unknown>, gate.user!.id),
    });
  });

  app.delete("/v1/contact-groups/:id", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;
    const { db, tables: t } = await deps.getContactsDb();
    const groupId = c.req.param("id");
    const { data: existing } = await db.from(t.rider_contact_groups).select("id")
      .eq("id", groupId).eq("owner_user_id", gate.user!.id).maybeSingle();
    if (!existing) return c.json({ error: "not_found" }, 404);
    await db.from(t.rider_contact_group_members).delete().eq("group_id", groupId);
    const { error } = await db.from(t.rider_contact_groups).delete()
      .eq("id", groupId).eq("owner_user_id", gate.user!.id);
    if (error) return c.json({ error: "delete_failed" }, 500);
    return c.json({ ok: true });
  });

  app.post("/v1/contact-groups/:id/members", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;
    const body = await c.req.json().catch(() => ({}));
    const contactIds = Array.isArray(body.contact_ids)
      ? body.contact_ids.filter((id: unknown) => typeof id === "string")
      : [];
    const { db, tables: t } = await deps.getContactsDb();
    const groupId = c.req.param("id");
    const { data: group } = await db.from(t.rider_contact_groups).select("id")
      .eq("id", groupId).eq("owner_user_id", gate.user!.id).maybeSingle();
    if (!group) return c.json({ error: "not_found" }, 404);
    const added = await addContactsToGroup(db, t, gate.user!.id, groupId, contactIds);
    return c.json({ added });
  });

  app.delete("/v1/contact-groups/:id/members/:contactId", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;
    const { db, tables: t } = await deps.getContactsDb();
    const groupId = c.req.param("id");
    const contactId = c.req.param("contactId");
    const { data: group } = await db.from(t.rider_contact_groups).select("id")
      .eq("id", groupId).eq("owner_user_id", gate.user!.id).maybeSingle();
    if (!group) return c.json({ error: "not_found" }, 404);
    const { data: contact } = await db.from(t.rider_contacts).select("id")
      .eq("id", contactId).eq("owner_user_id", gate.user!.id).maybeSingle();
    if (!contact) return c.json({ error: "not_found" }, 404);
    await db.from(t.rider_contact_group_members).delete()
      .eq("group_id", groupId).eq("contact_id", contactId);
    await db.from(t.rider_contact_groups).update({
      updated_at: new Date().toISOString(),
    }).eq("id", groupId);
    return c.json({ ok: true });
  });

  app.post("/v1/contacts/:id/places", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;
    const body = await c.req.json().catch(() => ({}));
    const label = typeof body.label === "string" ? body.label.trim() : "";
    const address = typeof body.address === "string" ? body.address.trim() : "";
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!label || !address || Number.isNaN(lat) || Number.isNaN(lng)) {
      return c.json({ error: "invalid_body" }, 400);
    }
    const { db, tables: t } = await deps.getContactsDb();
    const contactId = c.req.param("id");
    const { data: contact } = await db.from(t.rider_contacts).select("id")
      .eq("id", contactId).eq("owner_user_id", gate.user!.id).maybeSingle();
    if (!contact) return c.json({ error: "not_found" }, 404);
    const { data, error } = await db.from(t.rider_contact_places).insert({
      contact_id: contactId,
      label,
      address,
      lat,
      lng,
      updated_at: new Date().toISOString(),
    }).select("*").single();
    if (error) return c.json({ error: "insert_failed" }, 500);
    return c.json({ place: data });
  });

  app.patch("/v1/contacts/:contactId/places/:placeId", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;
    const body = await c.req.json().catch(() => ({}));
    const { db, tables: t } = await deps.getContactsDb();
    const { data: contact } = await db.from(t.rider_contacts).select("id")
      .eq("id", c.req.param("contactId")).eq("owner_user_id", gate.user!.id).maybeSingle();
    if (!contact) return c.json({ error: "not_found" }, 404);
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.label === "string") patch.label = body.label.trim();
    if (typeof body.address === "string") patch.address = body.address.trim();
    if (body.lat != null) patch.lat = Number(body.lat);
    if (body.lng != null) patch.lng = Number(body.lng);
    const { data, error } = await db.from(t.rider_contact_places).update(patch)
      .eq("id", c.req.param("placeId")).eq("contact_id", c.req.param("contactId"))
      .select("*").single();
    if (error || !data) return c.json({ error: "not_found" }, 404);
    return c.json({ place: data });
  });

  app.delete("/v1/contacts/:contactId/places/:placeId", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;
    const { db, tables: t } = await deps.getContactsDb();
    const { data: contact } = await db.from(t.rider_contacts).select("id")
      .eq("id", c.req.param("contactId")).eq("owner_user_id", gate.user!.id).maybeSingle();
    if (!contact) return c.json({ error: "not_found" }, 404);
    await db.from(t.rider_contact_places).delete()
      .eq("id", c.req.param("placeId")).eq("contact_id", c.req.param("contactId"));
    return c.json({ ok: true });
  });
}
