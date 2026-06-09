import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { RidesContactsTables } from "../_shared/ridesContactsDb.ts";
import { maybeRelinkContactRow, resolveContactRoamLink } from "./contactRoamLink.ts";
import { normalizePhoneE164 } from "./rideAccess.ts";
import { resolveRoamUserByPhone } from "./resolveRoamUserByPhone.ts";

export type ResolvedTargetBooker = {
  target_booker_user_id: string | null;
  target_booker_phone_e164: string | null;
};

export type TargetBookerResolveError = {
  error: "target_booker_required" | "target_booker_not_found" | "cannot_target_self";
  message: string;
};

/**
 * Resolve targeted payer from contact id, user id, and/or phone.
 * Updates the contact row when phone lookup finds a Roam account.
 */
export async function resolveTargetedBooker(
  db: SupabaseClient,
  tables: RidesContactsTables,
  requesterUserId: string,
  input: {
    audience?: string;
    target_contact_id?: string | null;
    target_booker_user_id?: string | null;
    target_booker_phone_e164?: string | null;
  },
): Promise<ResolvedTargetBooker | TargetBookerResolveError> {
  if (input.audience !== "targeted") {
    return { target_booker_user_id: null, target_booker_phone_e164: null };
  }

  let userId = typeof input.target_booker_user_id === "string" && input.target_booker_user_id.trim()
    ? input.target_booker_user_id.trim()
    : null;
  let phone: string | null = null;

  if (typeof input.target_contact_id === "string" && input.target_contact_id.trim()) {
    const { data: contact } = await db.from(tables.rider_contacts).select("*")
      .eq("id", input.target_contact_id.trim())
      .eq("owner_user_id", requesterUserId)
      .maybeSingle();

    if (!contact) {
      return {
        error: "target_booker_not_found",
        message: "That contact was not found. Pick another payer or add them via their Roam tag.",
      };
    }

    const linked = await maybeRelinkContactRow(db, tables, contact as Record<string, unknown>);
    userId = (linked.linked_user_id as string | null) ?? userId;
    try {
      phone = normalizePhoneE164(String(linked.phone_e164));
    } catch {
      phone = null;
    }
  }

  if (!userId && input.target_booker_phone_e164) {
    try {
      phone = normalizePhoneE164(String(input.target_booker_phone_e164));
    } catch {
      phone = null;
    }
  }

  if (!userId && phone) {
    const resolved = await resolveRoamUserByPhone(phone);
    if (resolved) userId = resolved.user_id;
  }

  if (userId && userId === requesterUserId) {
    return {
      error: "cannot_target_self",
      message: "You cannot publish a trip for yourself to pay.",
    };
  }

  if (!userId) {
    return {
      error: "target_booker_not_found",
      message: "That person does not have a Roam account on this phone yet. Add them via their @tag or ask them to sign up.",
    };
  }

  if (!phone && userId) {
    const tryPhone = input.target_booker_phone_e164 ? String(input.target_booker_phone_e164) : null;
    if (tryPhone) {
      const resolved = await resolveRoamUserByPhone(tryPhone);
      if (resolved?.user_id === userId) phone = resolved.phone_e164;
    }
  }

  return {
    target_booker_user_id: userId,
    target_booker_phone_e164: phone,
  };
}
