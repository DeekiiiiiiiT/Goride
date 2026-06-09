import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getRidesAdminDb } from "../_shared/ridesAdminDb.ts";
import {
  isPassengerVerified,
  REQUIRE_PHONE_SMS_VERIFICATION,
  resolvePassengerPhone,
} from "./passengerProfile.ts";
import { loadCustomTagNameForUser } from "./passengerIdentity.ts";
import { normalizePhoneE164, phonesMatch } from "./rideAccess.ts";

export type ResolvedRoamUser = {
  user_id: string;
  display_name: string | null;
  phone_e164: string;
  custom_tag_name: string | null;
};

type ProfileCandidate = {
  user_id: string;
  display_name: string | null;
  phone: string | null;
  phone_verified_at?: string | null;
};

function serviceAuth() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

async function displayNameForUser(userId: string, profileName: string | null): Promise<string | null> {
  if (profileName?.trim()) return profileName.trim();
  try {
    const { data } = await serviceAuth().auth.admin.getUserById(userId);
    const meta = data.user?.user_metadata as Record<string, unknown> | undefined;
    const fromMeta =
      (typeof meta?.full_name === "string" && meta.full_name.trim()) ||
      (typeof meta?.name === "string" && meta.name.trim()) ||
      null;
    return fromMeta;
  } catch {
    return null;
  }
}

async function listProfileCandidatesByPhone(
  db: SupabaseClient,
  profileTable: string,
  normalized: string,
): Promise<ProfileCandidate[]> {
  const { data: profiles, error } = await db.from(profileTable)
    .select("user_id, display_name, phone, phone_verified_at")
    .not("phone", "is", null);

  if (error) {
    console.error("[resolve_roam_user] profile_scan_failed", error.message);
    return [];
  }

  const candidates: ProfileCandidate[] = [];
  for (const row of profiles ?? []) {
    try {
      const profilePhone = normalizePhoneE164(String(row.phone));
      if (!phonesMatch(profilePhone, normalized)) continue;
      candidates.push({
        user_id: String(row.user_id),
        display_name: (row.display_name as string | null) ?? null,
        phone: String(row.phone),
        phone_verified_at: row.phone_verified_at as string | null | undefined,
      });
    } catch {
      continue;
    }
  }
  return candidates;
}

async function resolveVerifiedCandidate(
  db: SupabaseClient,
  profileTable: string,
  candidate: ProfileCandidate,
): Promise<(ResolvedRoamUser & { hasTag: boolean }) | null> {
  const phone = await resolvePassengerPhone(db, profileTable, candidate.user_id);
  if (!phone) return null;

  const verified = isPassengerVerified(
    {
      user_id: candidate.user_id,
      display_name: candidate.display_name,
      phone: candidate.phone,
      phone_verified_at: candidate.phone_verified_at,
    },
    phone,
    REQUIRE_PHONE_SMS_VERIFICATION,
  );
  if (!verified) return null;

  const [display_name, custom_tag_name] = await Promise.all([
    displayNameForUser(candidate.user_id, candidate.display_name),
    loadCustomTagNameForUser(candidate.user_id),
  ]);

  return {
    user_id: candidate.user_id,
    display_name,
    phone_e164: phone,
    custom_tag_name,
    hasTag: Boolean(custom_tag_name),
  };
}

/**
 * Resolve a verified Roam passenger account by E.164 phone.
 * When multiple profiles share a phone, prefer the account with a Roam tag set.
 */
export async function resolveRoamUserByPhone(phoneE164: string): Promise<ResolvedRoamUser | null> {
  let normalized: string;
  try {
    normalized = normalizePhoneE164(phoneE164);
  } catch {
    return null;
  }

  const { db, tables } = await getRidesAdminDb();
  const candidates = await listProfileCandidatesByPhone(db, tables.rider_profiles, normalized);
  if (!candidates.length) return null;

  const resolved = (
    await Promise.all(candidates.map((c) => resolveVerifiedCandidate(db, tables.rider_profiles, c)))
  ).filter((row): row is ResolvedRoamUser & { hasTag: boolean } => row !== null);

  if (!resolved.length) return null;

  const picked = resolved.find((row) => row.hasTag) ?? resolved[0];
  return {
    user_id: picked.user_id,
    display_name: picked.display_name,
    phone_e164: picked.phone_e164,
    custom_tag_name: picked.custom_tag_name,
  };
}
