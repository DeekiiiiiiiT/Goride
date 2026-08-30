/**
 * Shared Rush Pass activation after WiPay success (used by payments + delivery).
 */
// deno-lint-ignore no-explicit-any
type ServiceSb = { from: (t: string) => any; schema?: (s: string) => { from: (t: string) => any } };

function fromDelivery(sb: ServiceSb, table: string) {
  if (typeof sb.schema === "function") {
    return sb.schema("delivery").from(table);
  }
  return sb.from(table);
}

export async function activateRushPassFromPaymentIntent(
  serviceSb: ServiceSb,
  intent: Record<string, unknown>,
): Promise<{ membershipId: string } | { error: string }> {
  const pd = (intent.provider_data ?? {}) as Record<string, unknown>;
  if (String(pd.purpose || "") !== "rush_pass") {
    return { error: "not_rush_pass_intent" };
  }
  const customerId = String(intent.customer_id || pd.customer_id || "");
  const planId = String(pd.plan_id || "");
  if (!customerId || !planId) return { error: "missing_customer_or_plan" };

  const { data: plan } = await fromDelivery(serviceSb, "rush_pass_plans")
    .select("*")
    .eq("id", planId)
    .maybeSingle();
  if (!plan) return { error: "plan_not_found" };

  const days = Math.max(1, Number((plan as { billing_period_days?: number }).billing_period_days ?? 30));
  const start = new Date();
  const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
  const intentId = String(intent.id);
  const nowIso = start.toISOString();

  const { data: byIntent } = await fromDelivery(serviceSb, "rush_pass_memberships")
    .select("id")
    .eq("last_payment_intent_id", intentId)
    .maybeSingle();
  if (byIntent) return { membershipId: String(byIntent.id) };

  const { data: active } = await fromDelivery(serviceSb, "rush_pass_memberships")
    .select("id")
    .eq("customer_id", customerId)
    .eq("status", "active")
    .gt("current_period_end", nowIso)
    .order("current_period_end", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (active) {
    // Renewals: extend from remaining period end when payment is early
    const existingEnd = new Date(
      String((active as { current_period_end?: string }).current_period_end ?? start.toISOString()),
    );
    const periodStart = existingEnd.getTime() > start.getTime() ? existingEnd : start;
    const periodEnd = new Date(periodStart.getTime() + days * 24 * 60 * 60 * 1000);
    const { data: updated, error } = await fromDelivery(serviceSb, "rush_pass_memberships")
      .update({
        plan_id: planId,
        status: "active",
        current_period_start: periodStart.toISOString(),
        current_period_end: periodEnd.toISOString(),
        source: "wipay",
        auto_renew: true,
        last_payment_intent_id: intentId,
        updated_at: nowIso,
      })
      .eq("id", active.id)
      .select("id")
      .single();
    if (error || !updated) return { error: error?.message || "update_failed" };
    return { membershipId: String(updated.id) };
  }

  const { data: created, error } = await fromDelivery(serviceSb, "rush_pass_memberships")
    .insert({
      customer_id: customerId,
      plan_id: planId,
      status: "active",
      current_period_start: start.toISOString(),
      current_period_end: end.toISOString(),
      source: "wipay",
      auto_renew: true,
      last_payment_intent_id: intentId,
    })
    .select("id")
    .single();
  if (error || !created) return { error: error?.message || "create_failed" };
  return { membershipId: String(created.id) };
}
