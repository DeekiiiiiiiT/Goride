/**
 * Rush Pass renewal + grace expiry (cron).
 * WiPay is redirect-based — we create a renewal intent when period ends within 24h;
 * capture still goes through WiPay webhook / confirm. Missed renew → past_due → expired.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// deno-lint-ignore no-explicit-any
type ServiceSb = { from: (t: string) => any };

export type RushPassRenewResult = {
  renewals_queued: number;
  marked_past_due: number;
  expired: number;
  details: Array<{ membership_id: string; action: string; note?: string }>;
};

const GRACE_MS = 3 * 24 * 60 * 60 * 1000;
const RENEW_WINDOW_MS = 24 * 60 * 60 * 1000;

function getPaymentsDb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "payments" } },
  );
}

/**
 * 1) Queue renewal intents for active auto-renew memberships ending within 24h.
 * 2) Mark active (or past_due candidates) past period end as past_due.
 * 3) Expire past_due after 3-day grace.
 */
export async function runRushPassRenewalJob(
  sb: ServiceSb,
  now = new Date(),
): Promise<RushPassRenewResult> {
  const nowIso = now.toISOString();
  const windowEnd = new Date(now.getTime() + RENEW_WINDOW_MS).toISOString();
  const result: RushPassRenewResult = {
    renewals_queued: 0,
    marked_past_due: 0,
    expired: 0,
    details: [],
  };

  const { data: dueSoon } = await sb
    .from("rush_pass_memberships")
    .select("id, customer_id, plan_id, current_period_end, last_payment_intent_id, auto_renew, status")
    .eq("status", "active")
    .eq("auto_renew", true)
    .gt("current_period_end", nowIso)
    .lte("current_period_end", windowEnd);

  const pdb = getPaymentsDb();

  for (const m of dueSoon ?? []) {
    const row = m as Record<string, unknown>;
    const membershipId = String(row.id);
    const planId = String(row.plan_id);
    const customerId = String(row.customer_id);

    const { data: plan } = await sb
      .from("rush_pass_plans")
      .select("id, price_jmd, is_active")
      .eq("id", planId)
      .maybeSingle();
    if (!plan || plan.is_active === false) {
      result.details.push({ membership_id: membershipId, action: "skip", note: "plan_inactive" });
      continue;
    }

    // Skip if a pending renew intent already exists for this membership
    const lastIntentId = row.last_payment_intent_id
      ? String(row.last_payment_intent_id)
      : null;
    if (lastIntentId) {
      const { data: lastIntent } = await pdb
        .from("payment_intents")
        .select("id, status, provider_data, expires_at")
        .eq("id", lastIntentId)
        .maybeSingle();
      const pd = (lastIntent?.provider_data ?? {}) as Record<string, unknown>;
      const st = String(lastIntent?.status ?? "").toLowerCase();
      if (
        String(pd.purpose) === "rush_pass" &&
        String(pd.renewal_of) === membershipId &&
        !["completed", "paid", "failed"].includes(st) &&
        lastIntent?.expires_at &&
        String(lastIntent.expires_at) > nowIso
      ) {
        result.details.push({ membership_id: membershipId, action: "skip", note: "intent_pending" });
        continue;
      }
    }

    const amount = Number(plan.price_jmd);
    const { data: intent, error } = await pdb
      .from("payment_intents")
      .insert({
        order_id: null,
        customer_id: customerId,
        amount,
        currency: "JMD",
        status: "pending",
        provider: "wipay",
        provider_data: {
          purpose: "rush_pass",
          plan_id: planId,
          customer_id: customerId,
          renewal_of: membershipId,
        },
        expires_at: new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString(),
      })
      .select("id")
      .single();

    if (error || !intent) {
      result.details.push({
        membership_id: membershipId,
        action: "error",
        note: error?.message || "intent_create_failed",
      });
      continue;
    }

    await sb
      .from("rush_pass_memberships")
      .update({
        last_payment_intent_id: intent.id,
        updated_at: nowIso,
      })
      .eq("id", membershipId);

    result.renewals_queued += 1;
    result.details.push({
      membership_id: membershipId,
      action: "renewal_intent",
      note: String(intent.id),
    });
  }

  // Active past period end → past_due
  const { data: lapsed } = await sb
    .from("rush_pass_memberships")
    .select("id")
    .eq("status", "active")
    .lt("current_period_end", nowIso);

  for (const m of lapsed ?? []) {
    const id = String((m as { id: string }).id);
    await sb
      .from("rush_pass_memberships")
      .update({ status: "past_due", updated_at: nowIso })
      .eq("id", id);
    result.marked_past_due += 1;
    result.details.push({ membership_id: id, action: "past_due" });
  }

  // past_due beyond grace → expired
  const graceCutoff = new Date(now.getTime() - GRACE_MS).toISOString();
  const { data: overdue } = await sb
    .from("rush_pass_memberships")
    .select("id, current_period_end")
    .eq("status", "past_due")
    .lt("current_period_end", graceCutoff);

  for (const m of overdue ?? []) {
    const id = String((m as { id: string }).id);
    await sb
      .from("rush_pass_memberships")
      .update({ status: "expired", auto_renew: false, updated_at: nowIso })
      .eq("id", id);
    result.expired += 1;
    result.details.push({ membership_id: id, action: "expired" });
  }

  return result;
}
