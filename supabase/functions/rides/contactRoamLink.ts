import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { RidesContactsTables } from "../_shared/ridesContactsDb.ts";
import { normalizePhoneE164 } from "./rideAccess.ts";
import { resolveRoamUserByPhone } from "./resolveRoamUserByPhone.ts";
import { isRoamConnectionsEnabled } from "./roamConnectionFlags.ts";
import { areUsersConnected } from "./roamConnectionHelpers.ts";

export type ContactLinkFields = {
  linked_user_id: string | null;
  source: string;
  phone_e164: string;
};

export type ContactLinkResult = ContactLinkFields & {
  roam_account_linked: boolean;
};

/**
 * Resolve Roam account link for a contact phone (and optional explicit user id).
 */
export async function resolveContactRoamLink(
  phoneE164: string,
  explicitLinkedUserId?: string | null,
  fallbackSource: string = "manual",
): Promise<ContactLinkResult> {
  const phone = normalizePhoneE164(phoneE164);

  if (explicitLinkedUserId?.trim()) {
    return {
      linked_user_id: explicitLinkedUserId.trim(),
      source: "roam_user",
      phone_e164: phone,
      roam_account_linked: true,
    };
  }

  const resolved = await resolveRoamUserByPhone(phone);
  if (resolved) {
    return {
      linked_user_id: resolved.user_id,
      source: "roam_user",
      phone_e164: phone,
      roam_account_linked: true,
    };
  }

  return {
    linked_user_id: null,
    source: fallbackSource,
    phone_e164: phone,
    roam_account_linked: false,
  };
}

/**
 * Attempt to link an existing contact row to a Roam account by phone; persists when newly linked.
 */
export async function maybeRelinkContactRow(
  db: SupabaseClient,
  tables: RidesContactsTables,
  row: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (row.linked_user_id) {
    return { ...row, roam_account_linked: true };
  }

  const phone = String(row.phone_e164 ?? "");
  const link = await resolveContactRoamLink(phone, null, String(row.source ?? "manual"));
  if (!link.roam_account_linked || !link.linked_user_id) {
    return { ...row, roam_account_linked: false };
  }

  if (isRoamConnectionsEnabled()) {
    const ownerId = String(row.owner_user_id ?? "");
    const connected = ownerId
      ? await areUsersConnected(db, tables, ownerId, link.linked_user_id)
      : false;
    if (!connected) {
      return { ...row, roam_account_linked: false };
    }
  }

  const now = new Date().toISOString();
  const { data: updated } = await db.from(tables.rider_contacts).update({
    linked_user_id: link.linked_user_id,
    source: "roam_user",
    updated_at: now,
  }).eq("id", row.id as string).select("*").maybeSingle();

  return { ...(updated ?? row), roam_account_linked: true };
}

export function withRoamLinkFlag(row: Record<string, unknown>): Record<string, unknown> {
  return {
    ...row,
    roam_account_linked: Boolean(row.linked_user_id),
  };
}
