import type { Context, Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { allowsPassengerSurface, deniesPassengerSurface, jsonEdgeForbidden } from "../_shared/authEdge.ts";
import { getRidesAdminDb } from "../_shared/ridesAdminDb.ts";
import type { RidesContactsDb } from "../_shared/ridesContactsDb.ts";
import {
  isPassengerVerified,
  REQUIRE_PHONE_SMS_VERIFICATION,
  resolvePassengerPhone,
} from "./passengerProfile.ts";
import {
  generateInternalRoamTagId,
  normalizeCustomRoamTagName,
  validateCustomRoamTagName,
} from "./rideAccess.ts";

type RoamTagDeps = {
  getContactsDb: () => Promise<RidesContactsDb>;
  requireUser: (authHeader: string | undefined) => Promise<
    { user: { id: string } } | { error: string; status: 401 }
  >;
};

function toPublicDto(row: Record<string, unknown>) {
  const custom = row.custom_tag_name as string | null;
  return {
    custom_tag_name: custom,
    has_custom_tag: Boolean(custom?.trim()),
  };
}

async function insertInternalTag(
  db: SupabaseClient,
  table: string,
  userId: string,
): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const internalTagId = generateInternalRoamTagId();
    const { data, error } = await db.from(table).insert({
      user_id: userId,
      internal_tag_id: internalTagId,
      updated_at: new Date().toISOString(),
    }).select("user_id, custom_tag_name, created_at, updated_at").single();

    if (!error && data) return data as Record<string, unknown>;

    const code = error?.code ?? "";
    const msg = (error?.message ?? "").toLowerCase();
    if (code === "23505" && msg.includes("internal")) continue;
    if (code === "23505") {
      const { data: existing } = await db.from(table)
        .select("user_id, custom_tag_name, created_at, updated_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (existing) return existing as Record<string, unknown>;
    }
    throw new Error(error?.message ?? "insert_failed");
  }
  throw new Error("could_not_generate_internal_tag");
}

async function ensurePassengerTag(
  db: SupabaseClient,
  table: string,
  userId: string,
): Promise<Record<string, unknown>> {
  const { data: existing } = await db.from(table)
    .select("user_id, custom_tag_name, created_at, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) return existing as Record<string, unknown>;
  return insertInternalTag(db, table, userId);
}

async function customNameCollidesWithInternalId(
  db: SupabaseClient,
  table: string,
  normalized: string,
): Promise<boolean> {
  const candidates = [
    normalized,
    normalized.toUpperCase(),
    `RT-${normalized.toUpperCase()}`,
  ];
  for (const candidate of candidates) {
    const { data } = await db.from(table).select("user_id").eq("internal_tag_id", candidate).maybeSingle();
    if (data) return true;
  }
  return false;
}

async function loadDisplayName(userId: string): Promise<string | null> {
  const { db, tables } = await getRidesAdminDb();
  const { data } = await db.from(tables.rider_profiles)
    .select("display_name")
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.display_name as string | null) ?? null;
}

async function passengerHasPhoneOnFile(userId: string): Promise<boolean> {
  const { db, tables } = await getRidesAdminDb();
  const phone = await resolvePassengerPhone(db, tables.rider_profiles, userId);
  return Boolean(phone);
}

export function registerRoamPassengerTagRoutes(app: Hono, deps: RoamTagDeps) {
  const requirePassenger = async (c: Context) => {
    const auth = await deps.requireUser(c.req.header("Authorization"));
    if ("error" in auth) return { error: auth, response: c.json({ error: auth.error }, auth.status) };
    if (deniesPassengerSurface(auth.user)) {
      return { error: null, response: jsonEdgeForbidden(c, "forbidden_role") };
    }
    return { user: auth.user, response: null };
  };

  app.post("/v1/roam-tag/ensure", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;
    const { db, tables: t } = await deps.getContactsDb();
    try {
      const row = await ensurePassengerTag(db, t.roam_passenger_tags, gate.user!.id);
      return c.json({ tag: toPublicDto(row) });
    } catch (e) {
      return c.json({ error: "ensure_failed", message: e instanceof Error ? e.message : "unknown" }, 500);
    }
  });

  app.get("/v1/roam-tag/me", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;
    const { db, tables: t } = await deps.getContactsDb();
    try {
      const row = await ensurePassengerTag(db, t.roam_passenger_tags, gate.user!.id);
      return c.json({ tag: toPublicDto(row) });
    } catch (e) {
      return c.json({ error: "fetch_failed", message: e instanceof Error ? e.message : "unknown" }, 500);
    }
  });

  app.patch("/v1/roam-tag/me", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;

    if (!(await passengerHasPhoneOnFile(gate.user!.id))) {
      return c.json({ error: "phone_required" }, 403);
    }

    const body = await c.req.json().catch(() => ({}));
    const raw = typeof body.custom_tag_name === "string" ? body.custom_tag_name : "";
    const validation = validateCustomRoamTagName(raw);
    if (validation) {
      return c.json({ error: validation }, 400);
    }
    const normalized = normalizeCustomRoamTagName(raw);
    const { db, tables: t } = await deps.getContactsDb();

    await ensurePassengerTag(db, t.roam_passenger_tags, gate.user!.id);

    if (await customNameCollidesWithInternalId(db, t.roam_passenger_tags, normalized)) {
      return c.json({ error: "tag_collides_with_internal" }, 409);
    }

    const { data: taken } = await db.from(t.roam_passenger_tags)
      .select("user_id")
      .eq("custom_tag_name", normalized)
      .neq("user_id", gate.user!.id)
      .maybeSingle();
    if (taken) return c.json({ error: "tag_taken" }, 409);

    const { data, error } = await db.from(t.roam_passenger_tags).update({
      custom_tag_name: normalized,
      updated_at: new Date().toISOString(),
    }).eq("user_id", gate.user!.id)
      .select("user_id, custom_tag_name, created_at, updated_at")
      .single();

    if (error || !data) return c.json({ error: "update_failed", message: error?.message }, 500);
    return c.json({ tag: toPublicDto(data as Record<string, unknown>) });
  });

  app.get("/v1/roam-tag/lookup/:name", async (c) => {
    const normalized = normalizeCustomRoamTagName(c.req.param("name"));
    if (validateCustomRoamTagName(normalized)) {
      return c.json({ error: "invalid_tag" }, 400);
    }
    const { db, tables: t } = await deps.getContactsDb();
    const { data, error } = await db.from(t.roam_passenger_tags)
      .select("user_id, custom_tag_name")
      .eq("custom_tag_name", normalized)
      .maybeSingle();
    if (error) return c.json({ error: "lookup_failed" }, 500);
    if (!data) return c.json({ error: "not_found" }, 404);

    const userId = data.user_id as string;
    let displayName: string | null = null;
    try {
      displayName = await loadDisplayName(userId);
    } catch {
      /* optional */
    }

    const auth = await deps.requireUser(c.req.header("Authorization"));
    if (!("error" in auth)) {
      if (allowsPassengerSurface(auth.user)) {
        if (auth.user.id === userId) {
          return c.json({ error: "cannot_book_self" }, 400);
        }

        const { db: adminDb, tables: adminTables } = await getRidesAdminDb();
        const { data: profileRow } = await adminDb.from(adminTables.rider_profiles)
          .select("user_id, display_name, phone, phone_verified_at")
          .eq("user_id", userId)
          .maybeSingle();

        const phoneE164 = await resolvePassengerPhone(adminDb, adminTables.rider_profiles, userId);
        const profile = profileRow as {
          user_id: string;
          display_name: string | null;
          phone: string | null;
          phone_verified_at: string | null;
        } | null;

        const verified = isPassengerVerified(
          profile ?? { user_id: userId, display_name: null, phone: phoneE164, phone_verified_at: null },
          phoneE164,
          REQUIRE_PHONE_SMS_VERIFICATION,
        );
        if (!verified) {
          return c.json({ error: "passenger_not_verified" }, 403);
        }

        let avatarUrl: string | null = null;
        try {
          const svc = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
          );
          const { data: authData } = await svc.auth.admin.getUserById(userId);
          const meta = authData.user?.user_metadata as Record<string, unknown> | undefined;
          avatarUrl =
            (typeof meta?.avatar_url === "string" && meta.avatar_url.trim()) ||
            (typeof meta?.picture === "string" && meta.picture.trim()) ||
            null;
          if (!displayName) {
            displayName = profile?.display_name ??
              (typeof meta?.full_name === "string" ? meta.full_name : null) ??
              (typeof meta?.name === "string" ? meta.name : null);
          }
        } catch {
          /* optional */
        }

        return c.json({
          tag: {
            custom_tag_name: data.custom_tag_name as string,
            display_name: displayName,
            user_id: userId,
            phone_e164: phoneE164,
            avatar_url: avatarUrl,
          },
        });
      }
    }

    return c.json({
      tag: {
        custom_tag_name: data.custom_tag_name as string,
        display_name: displayName,
      },
    });
  });
}
