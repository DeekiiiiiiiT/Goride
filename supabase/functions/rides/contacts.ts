import type { Context, Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsonEdgeForbidden, ridesUserSurfaceRole } from "../_shared/authEdge.ts";
import { normalizePhoneE164 } from "./rideAccess.ts";

const VALID_RELATIONS = new Set([
  "father", "mother", "sibling", "spouse", "friend", "colleague", "other",
]);

type ContactsDeps = {
  svc: () => SupabaseClient;
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
  contactId: string,
): Promise<Record<string, unknown>[]> {
  const { data: members } = await db.from("rider_contact_group_members")
    .select("group_id")
    .eq("contact_id", contactId);
  if (!members?.length) return [];
  const groupIds = members.map((m) => m.group_id as string);
  const { data: groups } = await db.from("rider_contact_groups")
    .select("*")
    .in("id", groupIds);
  return groups ?? [];
}

async function loadPlacesForContact(
  db: SupabaseClient,
  contactId: string,
): Promise<Record<string, unknown>[]> {
  const { data } = await db.from("rider_contact_places")
    .select("*")
    .eq("contact_id", contactId)
    .order("created_at", { ascending: true });
  return data ?? [];
}

async function enrichContact(
  db: SupabaseClient,
  row: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const id = row.id as string;
  const [groups, places] = await Promise.all([
    loadContactGroupsForContact(db, id),
    loadPlacesForContact(db, id),
  ]);
  return { ...row, groups, places };
}

async function syncContactGroups(
  db: SupabaseClient,
  ownerId: string,
  contactId: string,
  groupIds: string[] | undefined,
): Promise<void> {
  if (groupIds === undefined) return;
  await db.from("rider_contact_group_members").delete().eq("contact_id", contactId);
  if (!groupIds.length) return;
  const { data: valid } = await db.from("rider_contact_groups")
    .select("id")
    .eq("owner_user_id", ownerId)
    .in("id", groupIds);
  const rows = (valid ?? []).map((g) => ({
    group_id: g.id as string,
    contact_id: contactId,
  }));
  if (rows.length) {
    await db.from("rider_contact_group_members").insert(rows);
  }
}

export function registerContactsRoutes(app: Hono, deps: ContactsDeps) {
  const requirePassenger = async (c: Context) => {
    const auth = await deps.requireUser(c.req.header("Authorization"));
    if ("error" in auth) return { error: auth, response: c.json({ error: auth.error }, auth.status) };
    const role = ridesUserSurfaceRole(auth.user);
    if (role && role !== "passenger") {
      return { error: null, response: jsonEdgeForbidden(c, "forbidden_role") };
    }
    return { user: auth.user, response: null };
  };

  app.get("/v1/contacts", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;
    const db = deps.svc();
    const q = c.req.query("q")?.trim().toLowerCase();
    const trusted = c.req.query("trusted_for_safety");
    let query = db.from("rider_contacts").select("*").eq("owner_user_id", gate.user!.id)
      .order("display_name", { ascending: true });
    if (trusted === "true") query = query.eq("trusted_for_safety", true);
    const { data, error } = await query;
    if (error) return c.json({ error: "fetch_failed", message: error.message }, 500);
    let rows = data ?? [];
    if (q) {
      rows = rows.filter((r) =>
        String(r.display_name).toLowerCase().includes(q) ||
        String(r.phone_e164).includes(q)
      );
    }
    const contacts = await Promise.all(rows.map((r) => enrichContact(db, r as Record<string, unknown>)));
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

    const db = deps.svc();
    const insertRow = {
      owner_user_id: gate.user!.id,
      display_name: displayName,
      phone_e164: normalizePhoneE164(phoneRaw),
      relation,
      relation_custom: relation === "other" ? relationCustom : null,
      source: typeof body.source === "string" ? body.source : "manual",
      bookable: body.bookable !== false,
      trusted_for_safety: body.trusted_for_safety === true,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await db.from("rider_contacts").insert(insertRow).select("*").single();
    if (error) {
      if (error.code === "23505") return c.json({ error: "duplicate_phone" }, 409);
      return c.json({ error: "insert_failed", message: error.message }, 500);
    }
    await syncContactGroups(db, gate.user!.id, data.id as string, body.group_ids);
    await deps.audit(null, gate.user!.id, "rider_contact_created", { contact_id: data.id });
    return c.json({ contact: await enrichContact(db, data as Record<string, unknown>) });
  });

  app.post("/v1/contacts/batch-import", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;
    const body = await c.req.json().catch(() => ({}));
    const items = Array.isArray(body.contacts) ? body.contacts : [];
    const db = deps.svc();
    let imported = 0;
    let skipped = 0;
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
      if (validateRelation(relation, relationCustom)) {
        skipped++;
        continue;
      }
      const { data, error } = await db.from("rider_contacts").insert({
        owner_user_id: gate.user!.id,
        display_name: displayName,
        phone_e164: normalizePhoneE164(phoneRaw),
        relation,
        relation_custom: relation === "other" ? relationCustom : null,
        source: "device_import",
        bookable: true,
        updated_at: new Date().toISOString(),
      }).select("*").single();
      if (error) {
        skipped++;
        continue;
      }
      imported++;
      results.push(await enrichContact(db, data as Record<string, unknown>));
    }
    return c.json({ imported, skipped, contacts: results });
  });

  app.get("/v1/contacts/:id", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;
    const db = deps.svc();
    const { data, error } = await db.from("rider_contacts").select("*")
      .eq("id", c.req.param("id"))
      .eq("owner_user_id", gate.user!.id)
      .maybeSingle();
    if (error) return c.json({ error: "fetch_failed" }, 500);
    if (!data) return c.json({ error: "not_found" }, 404);
    return c.json({ contact: await enrichContact(db, data as Record<string, unknown>) });
  });

  app.patch("/v1/contacts/:id", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;
    const body = await c.req.json().catch(() => ({}));
    const db = deps.svc();
    const contactId = c.req.param("id");
    const { data: existing } = await db.from("rider_contacts").select("*")
      .eq("id", contactId).eq("owner_user_id", gate.user!.id).maybeSingle();
    if (!existing) return c.json({ error: "not_found" }, 404);

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.display_name === "string") patch.display_name = body.display_name.trim();
    if (typeof body.phone_e164 === "string") patch.phone_e164 = normalizePhoneE164(body.phone_e164);
    if (typeof body.relation === "string") patch.relation = body.relation;
    if (body.relation_custom !== undefined) {
      patch.relation_custom = typeof body.relation_custom === "string" ? body.relation_custom.trim() : null;
    }
    if (typeof body.bookable === "boolean") patch.bookable = body.bookable;
    if (typeof body.trusted_for_safety === "boolean") patch.trusted_for_safety = body.trusted_for_safety;

    const relation = String(patch.relation ?? existing.relation);
    const relationCustom = (patch.relation_custom ?? existing.relation_custom) as string | null;
    const relErr = validateRelation(relation, relationCustom);
    if (relErr) return c.json({ error: relErr }, 400);
    if (relation !== "other") patch.relation_custom = null;

    const { data, error } = await db.from("rider_contacts").update(patch)
      .eq("id", contactId).select("*").single();
    if (error) return c.json({ error: "update_failed", message: error.message }, 500);
    await syncContactGroups(db, gate.user!.id, contactId, body.group_ids);
    return c.json({ contact: await enrichContact(db, data as Record<string, unknown>) });
  });

  app.delete("/v1/contacts/:id", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;
    const db = deps.svc();
    const { error } = await db.from("rider_contacts").delete()
      .eq("id", c.req.param("id")).eq("owner_user_id", gate.user!.id);
    if (error) return c.json({ error: "delete_failed" }, 500);
    return c.json({ ok: true });
  });

  app.get("/v1/contact-groups", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;
    const { data, error } = await deps.svc().from("rider_contact_groups").select("*")
      .eq("owner_user_id", gate.user!.id).order("name");
    if (error) return c.json({ error: "fetch_failed" }, 500);
    return c.json({ groups: data ?? [] });
  });

  app.post("/v1/contact-groups", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;
    const body = await c.req.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return c.json({ error: "invalid_body" }, 400);
    const { data, error } = await deps.svc().from("rider_contact_groups").insert({
      owner_user_id: gate.user!.id,
      name,
      updated_at: new Date().toISOString(),
    }).select("*").single();
    if (error) {
      if (error.code === "23505") return c.json({ error: "duplicate_group" }, 409);
      return c.json({ error: "insert_failed" }, 500);
    }
    return c.json({ group: data });
  });

  app.patch("/v1/contact-groups/:id", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;
    const body = await c.req.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return c.json({ error: "invalid_body" }, 400);
    const { data, error } = await deps.svc().from("rider_contact_groups").update({
      name,
      updated_at: new Date().toISOString(),
    }).eq("id", c.req.param("id")).eq("owner_user_id", gate.user!.id).select("*").single();
    if (error || !data) return c.json({ error: "not_found" }, 404);
    return c.json({ group: data });
  });

  app.delete("/v1/contact-groups/:id", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;
    await deps.svc().from("rider_contact_group_members").delete().eq("group_id", c.req.param("id"));
    const { error } = await deps.svc().from("rider_contact_groups").delete()
      .eq("id", c.req.param("id")).eq("owner_user_id", gate.user!.id);
    if (error) return c.json({ error: "delete_failed" }, 500);
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
    const db = deps.svc();
    const contactId = c.req.param("id");
    const { data: contact } = await db.from("rider_contacts").select("id")
      .eq("id", contactId).eq("owner_user_id", gate.user!.id).maybeSingle();
    if (!contact) return c.json({ error: "not_found" }, 404);
    const { data, error } = await db.from("rider_contact_places").insert({
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
    const db = deps.svc();
    const { data: contact } = await db.from("rider_contacts").select("id")
      .eq("id", c.req.param("contactId")).eq("owner_user_id", gate.user!.id).maybeSingle();
    if (!contact) return c.json({ error: "not_found" }, 404);
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.label === "string") patch.label = body.label.trim();
    if (typeof body.address === "string") patch.address = body.address.trim();
    if (body.lat != null) patch.lat = Number(body.lat);
    if (body.lng != null) patch.lng = Number(body.lng);
    const { data, error } = await db.from("rider_contact_places").update(patch)
      .eq("id", c.req.param("placeId")).eq("contact_id", c.req.param("contactId"))
      .select("*").single();
    if (error || !data) return c.json({ error: "not_found" }, 404);
    return c.json({ place: data });
  });

  app.delete("/v1/contacts/:contactId/places/:placeId", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;
    const db = deps.svc();
    const { data: contact } = await db.from("rider_contacts").select("id")
      .eq("id", c.req.param("contactId")).eq("owner_user_id", gate.user!.id).maybeSingle();
    if (!contact) return c.json({ error: "not_found" }, 404);
    await db.from("rider_contact_places").delete()
      .eq("id", c.req.param("placeId")).eq("contact_id", c.req.param("contactId"));
    return c.json({ ok: true });
  });
}
