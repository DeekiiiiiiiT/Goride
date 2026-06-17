import type { Context, Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { deniesPassengerSurface, jsonEdgeForbidden } from "../_shared/authEdge.ts";
import { getRiderAdminDb } from "../_shared/ridesAdminDb.ts";
import { normalizePhoneE164 } from "./rideAccess.ts";

/** Set true once Supabase SMS is configured to require OTP on signup. */
export const REQUIRE_PHONE_SMS_VERIFICATION = false;

type ProfileRow = {
  user_id: string;
  display_name: string | null;
  phone: string | null;
  phone_verified_at?: string | null;
  default_sharing_preference?: string;
  share_all_trips?: boolean;
  night_trips_only?: boolean;
};

const PROFILE_COLUMNS =
  "user_id, display_name, phone, default_sharing_preference, share_all_trips, night_trips_only";

type SharingPreference = "all" | "night" | "manual";

function sharingFromPreference(pref: SharingPreference): {
  default_sharing_preference: SharingPreference;
  share_all_trips: boolean;
  night_trips_only: boolean;
} {
  switch (pref) {
    case "night":
      return { default_sharing_preference: "night", share_all_trips: false, night_trips_only: true };
    case "manual":
      return { default_sharing_preference: "manual", share_all_trips: false, night_trips_only: false };
    default:
      return { default_sharing_preference: "all", share_all_trips: true, night_trips_only: false };
  }
}

function safetySharingDto(profile: ProfileRow) {
  const pref = profile.default_sharing_preference as SharingPreference | undefined;
  if (pref && (pref === "all" || pref === "night" || pref === "manual")) {
    return sharingFromPreference(pref);
  }
  if (profile.night_trips_only) return sharingFromPreference("night");
  if (profile.share_all_trips === false) return sharingFromPreference("manual");
  return sharingFromPreference("all");
}

function serviceAuth() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

export async function ensurePassengerProfile(
  db: SupabaseClient,
  profileTable: string,
  userId: string,
): Promise<ProfileRow> {
  const { data: existing } = await db.from(profileTable)
    .select(PROFILE_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    return existing as ProfileRow;
  }

  const { data: created, error } = await db.from(profileTable)
    .insert({ user_id: userId })
    .select(PROFILE_COLUMNS)
    .single();

  if (error || !created) {
    throw new Error(error?.message ?? "profile_insert_failed");
  }
  return created as ProfileRow;
}

export async function resolveAuthUserPhone(userId: string): Promise<string | null> {
  try {
    const { data } = await serviceAuth().auth.admin.getUserById(userId);
    const phone = data.user?.phone?.trim();
    return phone || null;
  } catch {
    return null;
  }
}

export async function resolvePassengerPhone(
  db: SupabaseClient,
  profileTable: string,
  userId: string,
): Promise<string | null> {
  const profile = await ensurePassengerProfile(db, profileTable, userId);
  const fromProfile = profile.phone?.trim();
  if (fromProfile) {
    try {
      return normalizePhoneE164(fromProfile);
    } catch {
      /* fall through */
    }
  }
  const authPhone = await resolveAuthUserPhone(userId);
  if (!authPhone) return null;
  try {
    return normalizePhoneE164(authPhone);
  } catch {
    return null;
  }
}

export function isPassengerVerified(
  profile: ProfileRow,
  phoneE164: string | null,
  requireSms: boolean = REQUIRE_PHONE_SMS_VERIFICATION,
): boolean {
  if (!phoneE164) return false;
  if (!requireSms) return true;
  if (profile.phone_verified_at) return true;
  return false;
}

export async function syncPassengerPhone(
  db: SupabaseClient,
  profileTable: string,
  userId: string,
  phoneE164: string,
  verifiedAt: string | null = null,
): Promise<ProfileRow> {
  await ensurePassengerProfile(db, profileTable, userId);

  const patch: Record<string, unknown> = {
    phone: phoneE164,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await db.from(profileTable)
    .update(patch)
    .eq("user_id", userId)
    .select(PROFILE_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "profile_update_failed");
  }

  if (verifiedAt) {
    await db.from(profileTable)
      .update({ phone_verified_at: verifiedAt, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
  }

  try {
    await serviceAuth().auth.admin.updateUserById(userId, { phone: phoneE164 });
  } catch {
    /* auth sync is best-effort */
  }

  return data as ProfileRow;
}

export async function syncProfilePhoneFromAuth(
  db: SupabaseClient,
  profileTable: string,
  userId: string,
): Promise<ProfileRow> {
  const profile = await ensurePassengerProfile(db, profileTable, userId);
  if (profile.phone?.trim()) {
    return profile;
  }
  const authPhone = await resolveAuthUserPhone(userId);
  if (!authPhone) {
    return profile;
  }
  let phoneE164: string;
  try {
    phoneE164 = normalizePhoneE164(authPhone);
  } catch {
    return profile;
  }
  return syncPassengerPhone(db, profileTable, userId, phoneE164, profile.phone_verified_at);
}

function toProfileDto(profile: ProfileRow, phoneE164: string | null) {
  return {
    display_name: profile.display_name,
    phone_e164: phoneE164,
    phone_on_file: Boolean(phoneE164),
    phone_verified: isPassengerVerified(profile, phoneE164),
    safety_sharing: safetySharingDto(profile),
  };
}

type PassengerProfileDeps = {
  requireUser: (authHeader: string | undefined) => Promise<
    { user: { id: string } } | { error: string; status: 401 }
  >;
};

export function registerPassengerProfileRoutes(app: Hono, deps: PassengerProfileDeps) {
  const requirePassenger = async (c: Context) => {
    const auth = await deps.requireUser(c.req.header("Authorization"));
    if ("error" in auth) return { error: auth, response: c.json({ error: auth.error }, auth.status) };
    if (deniesPassengerSurface(auth.user)) {
      return { error: null, response: jsonEdgeForbidden(c, "forbidden_role") };
    }
    return { user: auth.user, response: null };
  };

  app.get("/v1/profile/me", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;

    try {
      const { db, tables } = await getRiderAdminDb();
      const profile = await syncProfilePhoneFromAuth(db, tables.rider_profiles, gate.user!.id);
      const phoneE164 = await resolvePassengerPhone(db, tables.rider_profiles, gate.user!.id);
      return c.json({ profile: toProfileDto(profile, phoneE164) });
    } catch (e) {
      return c.json({ error: "profile_fetch_failed", message: e instanceof Error ? e.message : "unknown" }, 500);
    }
  });

  app.post("/v1/profile/ensure", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;

    try {
      const { db, tables } = await getRiderAdminDb();
      const profile = await syncProfilePhoneFromAuth(db, tables.rider_profiles, gate.user!.id);
      const phoneE164 = await resolvePassengerPhone(db, tables.rider_profiles, gate.user!.id);
      return c.json({ profile: toProfileDto(profile, phoneE164) });
    } catch (e) {
      return c.json({ error: "profile_ensure_failed", message: e instanceof Error ? e.message : "unknown" }, 500);
    }
  });

  app.patch("/v1/profile/me", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;

    const body = await c.req.json().catch(() => ({}));
    const raw = typeof body.phone === "string" ? body.phone.trim() : "";
    if (!raw) {
      return c.json({ error: "invalid_body", message: "phone is required" }, 400);
    }

    let phoneE164: string;
    try {
      phoneE164 = normalizePhoneE164(raw);
    } catch {
      return c.json({ error: "invalid_phone" }, 400);
    }

    try {
      const { db, tables } = await getRiderAdminDb();
      const verifiedAt = REQUIRE_PHONE_SMS_VERIFICATION ? null : new Date().toISOString();
      const profile = await syncPassengerPhone(
        db,
        tables.rider_profiles,
        gate.user!.id,
        phoneE164,
        verifiedAt,
      );
      return c.json({ profile: toProfileDto(profile, phoneE164) });
    } catch (e) {
      return c.json({ error: "profile_update_failed", message: e instanceof Error ? e.message : "unknown" }, 500);
    }
  });

  app.patch("/v1/profile/me/safety-sharing", async (c) => {
    const gate = await requirePassenger(c);
    if (gate.response) return gate.response;

    const body = await c.req.json().catch(() => ({}));
    const pref = body.default_sharing_preference as SharingPreference;
    if (!pref || !["all", "night", "manual"].includes(pref)) {
      return c.json({ error: "invalid_body", message: "default_sharing_preference required" }, 400);
    }

    try {
      const { db, tables } = await getRiderAdminDb();
      await ensurePassengerProfile(db, tables.rider_profiles, gate.user!.id);
      const patch = {
        ...sharingFromPreference(pref),
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await db.from(tables.rider_profiles)
        .update(patch)
        .eq("user_id", gate.user!.id)
        .select(PROFILE_COLUMNS)
        .single();
      if (error || !data) {
        return c.json({ error: "profile_update_failed", message: error?.message }, 500);
      }
      const phoneE164 = await resolvePassengerPhone(db, tables.rider_profiles, gate.user!.id);
      return c.json({ profile: toProfileDto(data as ProfileRow, phoneE164) });
    } catch (e) {
      return c.json({ error: "profile_update_failed", message: e instanceof Error ? e.message : "unknown" }, 500);
    }
  });
}
