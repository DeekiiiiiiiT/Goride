/**
 * Auth Admin createUser sometimes applies app_metadata after INSERT, so the
 * auto_create_organization trigger can miss. Upsert org explicitly after create.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export async function ensureCustomerOrganization(
  supabase: SupabaseClient,
  opts: {
    userId: string;
    email: string;
    name: string;
    businessType: string;
    productLine: "fleet" | "enterprise";
  },
): Promise<void> {
  const { userId, email, name, businessType, productLine } = opts;
  const { data: existing, error: selErr } = await supabase
    .from("organizations")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (selErr) {
    console.error("[ensureCustomerOrganization] select failed:", selErr.message);
  }
  if (existing?.id) return;

  const { error: insErr } = await supabase.from("organizations").insert({
    id: userId,
    owner_id: userId,
    name: name || `${email.split("@")[0]}'s Fleet`,
    product_line: productLine,
    business_type: businessType,
    contact_email: email,
    status: "active",
  });
  if (insErr) {
    console.error("[ensureCustomerOrganization] insert failed:", insErr.message);
    throw new Error(`Failed to provision organization: ${insErr.message}`);
  }
}
