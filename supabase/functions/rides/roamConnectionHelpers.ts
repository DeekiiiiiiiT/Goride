import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { RidesContactsTables } from "../_shared/ridesContactsDb.ts";

export const ROAM_CONNECTION_REQUEST_TTL_MS = 30 * 24 * 60 * 60_000;

export type CanonicalUserPair = {
  user_a_id: string;
  user_b_id: string;
};

/** Canonical ordered pair for roam_connections (user_a_id < user_b_id). */
export function canonicalPair(userIdA: string, userIdB: string): CanonicalUserPair {
  const a = userIdA.trim();
  const b = userIdB.trim();
  if (a === b) {
    throw new Error("cannot_connect_self");
  }
  return a < b ? { user_a_id: a, user_b_id: b } : { user_a_id: b, user_b_id: a };
}

export function maskPhoneE164(e164: string): string {
  return e164.replace(/\d(?=\d{4})/g, "*");
}

export function maskConnectionPreview(profile: {
  display_name?: string | null;
  phone_e164?: string;
  custom_tag_name?: string | null;
}): {
  display_name: string | null;
  phone_masked: string;
  custom_tag_name: string | null;
} {
  return {
    display_name: profile.display_name?.trim() || null,
    phone_masked: profile.phone_e164 ? maskPhoneE164(profile.phone_e164) : "****",
    custom_tag_name: profile.custom_tag_name?.trim() || null,
  };
}

export async function areUsersConnected(
  db: SupabaseClient,
  tables: RidesContactsTables,
  userA: string,
  userB: string,
): Promise<boolean> {
  const { user_a_id, user_b_id } = canonicalPair(userA, userB);
  const { data } = await db.from(tables.roam_connections).select("id")
    .eq("user_a_id", user_a_id)
    .eq("user_b_id", user_b_id)
    .maybeSingle();
  return Boolean(data?.id);
}

/** Remove the mutual Roam connection between two users, if present. */
export async function removeRoamConnection(
  db: SupabaseClient,
  tables: RidesContactsTables,
  userA: string,
  userB: string,
): Promise<void> {
  const { user_a_id, user_b_id } = canonicalPair(userA, userB);
  await db.from(tables.roam_connections).delete()
    .eq("user_a_id", user_a_id)
    .eq("user_b_id", user_b_id);
}

/** Cancel pending connection requests between two users (both directions). */
export async function cancelPendingConnectionRequestsBetween(
  db: SupabaseClient,
  tables: RidesContactsTables,
  userA: string,
  userB: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db.from(tables.roam_connection_requests).update({
    status: "cancelled",
    responded_at: now,
    updated_at: now,
  })
    .eq("status", "pending")
    .or(
      `and(requester_user_id.eq.${userA},target_user_id.eq.${userB}),` +
      `and(requester_user_id.eq.${userB},target_user_id.eq.${userA})`,
    );
}

/** Cancel pending phone-only invites from requester to a phone number. */
export async function cancelPendingPhoneInvitesFrom(
  db: SupabaseClient,
  tables: RidesContactsTables,
  requesterUserId: string,
  phoneE164: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db.from(tables.roam_connection_requests).update({
    status: "cancelled",
    responded_at: now,
    updated_at: now,
  })
    .eq("requester_user_id", requesterUserId)
    .eq("target_phone_e164", phoneE164)
    .eq("status", "pending")
    .is("target_user_id", null);
}

export async function isBlockedEitherDirection(
  db: SupabaseClient,
  tables: RidesContactsTables,
  userA: string,
  userB: string,
): Promise<boolean> {
  const { data } = await db.from(tables.user_blocks).select("id")
    .or(
      `and(blocker_user_id.eq.${userA},blocked_user_id.eq.${userB}),` +
      `and(blocker_user_id.eq.${userB},blocked_user_id.eq.${userA})`,
    )
    .limit(1);
  return Boolean(data?.length);
}

export async function isBlocked(
  db: SupabaseClient,
  tables: RidesContactsTables,
  blockerUserId: string,
  blockedUserId: string,
): Promise<boolean> {
  const { data } = await db.from(tables.user_blocks).select("id")
    .eq("blocker_user_id", blockerUserId)
    .eq("blocked_user_id", blockedUserId)
    .maybeSingle();
  return Boolean(data?.id);
}

export function connectionRequestExpiresAt(fromMs: number = Date.now()): string {
  return new Date(fromMs + ROAM_CONNECTION_REQUEST_TTL_MS).toISOString();
}

export function isConnectionRequestExpired(row: { status: string; expires_at: string }): boolean {
  if (row.status !== "pending") return false;
  return new Date(row.expires_at).getTime() <= Date.now();
}
