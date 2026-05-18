import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type RiderAccountStatus = "active" | "suspended" | "banned";

export async function getRiderAccountStatus(
  db: SupabaseClient,
  userId: string,
): Promise<RiderAccountStatus> {
  const { data } = await db
    .from("rider_profiles")
    .select("account_status")
    .eq("user_id", userId)
    .maybeSingle();

  const status = data?.account_status as RiderAccountStatus | undefined;
  if (status === "suspended" || status === "banned") return status;
  return "active";
}

export async function assertRiderCanBook(
  db: SupabaseClient,
  userId: string,
): Promise<{ ok: true } | { ok: false; status: RiderAccountStatus }> {
  const status = await getRiderAccountStatus(db, userId);
  if (status === "suspended" || status === "banned") {
    return { ok: false, status };
  }
  return { ok: true };
}
