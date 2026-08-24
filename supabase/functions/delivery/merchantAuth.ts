import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type TeamPermission = "orders" | "menu" | "analytics" | "payouts" | "inventory";
export type TeamRole = "staff" | "manager" | "admin";
export type JobStation = "counter" | "kitchen" | "manager" | "pos";

export type MerchantMembership = {
  role: TeamRole;
  permissions: TeamPermission[];
  is_owner: boolean;
  job_station: JobStation | null;
};

function readJobStation(row: Record<string, unknown>): JobStation | null {
  const value = row.job_station;
  if (value === "counter" || value === "kitchen" || value === "manager" || value === "pos") {
    return value;
  }
  return null;
}

export type ResolvedMerchantAccess = {
  merchant: Record<string, unknown>;
  membership: MerchantMembership;
};

export const OWNER_ACCOUNT_SUSPENDED = "owner_account_suspended";

function getServiceDb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "delivery" } },
  );
}

/** True when this user has a suspended merchant-owner person profile. */
export async function isMerchantOwnerSuspended(userId: string): Promise<boolean> {
  const sb = getServiceDb();
  const { data } = await sb
    .from("merchant_owner_profiles")
    .select("account_status")
    .eq("user_id", userId)
    .maybeSingle();
  return String((data as { account_status?: string } | null)?.account_status) === "suspended";
}

export async function resolveMerchantAccess(
  userId: string,
  userEmail?: string | null,
): Promise<ResolvedMerchantAccess | null> {
  const sb = getServiceDb();

  // Block Partner for suspended owners (person-level; stores stay unchanged)
  if (await isMerchantOwnerSuspended(userId)) {
    return null;
  }

  const { data: owned } = await sb
    .from("merchants")
    .select("*")
    .eq("owner_id", userId)
    .maybeSingle();

  if (owned) {
    return {
      merchant: owned as Record<string, unknown>,
      membership: {
        role: "admin",
        permissions: ["orders", "menu", "analytics", "payouts"],
        is_owner: true,
        job_station: null,
      },
    };
  }

  const { data: member } = await sb
    .from("merchant_team_members")
    .select("*, merchants(*)")
    .eq("user_id", userId)
    .maybeSingle();

  if (member) {
    const merchant = (member as Record<string, unknown>).merchants as Record<string, unknown>;
    if (!merchant) return null;
    if (merchant.verification_status !== "approved") return null;
    return {
      merchant,
      membership: {
        role: ((member as Record<string, unknown>).role as TeamRole) || "staff",
        permissions: ((member as Record<string, unknown>).permissions as TeamPermission[]) || ["orders"],
        is_owner: false,
        job_station: readJobStation(member as Record<string, unknown>),
      },
    };
  }

  // No email auto-link — claim only via invite token accept endpoint (Wave 3/7)
  return null;
}

export function requireMerchantPermission(
  membership: MerchantMembership,
  permission: TeamPermission,
): boolean {
  if (membership.is_owner || membership.role === "admin") return true;
  return membership.permissions.includes(permission);
}

export async function requireResolvedMerchantWithPermission(
  userId: string,
  userEmail: string | null | undefined,
  permission: TeamPermission,
): Promise<
  | { ok: true; resolved: ResolvedMerchantAccess }
  | { ok: false; status: number; message: string }
> {
  if (await isMerchantOwnerSuspended(userId)) {
    return { ok: false, status: 403, message: OWNER_ACCOUNT_SUSPENDED };
  }
  const resolved = await resolveMerchantAccess(userId, userEmail);
  if (!resolved) {
    return { ok: false, status: 403, message: "Not a merchant" };
  }
  if (!requireMerchantPermission(resolved.membership, permission)) {
    return { ok: false, status: 403, message: "Forbidden" };
  }
  return { ok: true, resolved };
}
