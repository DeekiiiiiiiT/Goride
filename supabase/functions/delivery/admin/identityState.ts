import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getAuthAdmin } from "./merchantAdminShared.ts";

export const IDENTITY_BAN_DURATION = "876000h";

function platformDb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "platform" } },
  );
}

export async function applyIdentityBan(
  userId: string,
  reason: string,
  actorId: string,
): Promise<void> {
  const pdb = platformDb();
  await pdb.from("identities").upsert({
    user_id: userId,
    global_status: "banned",
    status_reason: reason,
    status_changed_at: new Date().toISOString(),
    status_changed_by: actorId,
  }, { onConflict: "user_id" });
  await getAuthAdmin().auth.admin.updateUserById(userId, { ban_duration: IDENTITY_BAN_DURATION });
}

export async function applyIdentityUnban(
  userId: string,
  reason: string,
  actorId: string,
): Promise<void> {
  const pdb = platformDb();
  await pdb.from("identities").upsert({
    user_id: userId,
    global_status: "active",
    status_reason: reason,
    status_changed_at: new Date().toISOString(),
    status_changed_by: actorId,
  }, { onConflict: "user_id" });
  await getAuthAdmin().auth.admin.updateUserById(userId, { ban_duration: "none" });
}

export async function applyIdentityGlobalRestrict(
  userId: string,
  status: "restricted" | "suspended",
  reason: string,
  actorId: string,
): Promise<void> {
  const pdb = platformDb();
  await pdb.from("identities").upsert({
    user_id: userId,
    global_status: status,
    status_reason: reason,
    status_changed_at: new Date().toISOString(),
    status_changed_by: actorId,
  }, { onConflict: "user_id" });
}

export async function clearIdentityGlobalRestrict(
  userId: string,
  reason: string,
  actorId: string,
): Promise<void> {
  const pdb = platformDb();
  await pdb.from("identities").upsert({
    user_id: userId,
    global_status: "active",
    status_reason: reason,
    status_changed_at: new Date().toISOString(),
    status_changed_by: actorId,
  }, { onConflict: "user_id" });
}
