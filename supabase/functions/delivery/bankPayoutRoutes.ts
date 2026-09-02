/**
 * Jamaica bank payout status stubs — Stripe Connect removed.
 * Couriers and merchants configure bank details in-app; payouts via WiPay/bank rails.
 */
import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

type Deps = {
  getSupabase: (authHeader: string) => SupabaseClient;
};

export function registerBankPayoutRoutes(app: Hono, deps: Deps) {
  const bankPayoutJson = {
    onboarded: false,
    charges_enabled: false,
    payouts_enabled: false,
    accountId: null,
    provider: "bank",
    message: "Payouts use Jamaica bank details in the app — Stripe is not used.",
  };

  app.get("/merchant/connect/status", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const supabase = deps.getSupabase(authHeader);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    return c.json(bankPayoutJson);
  });

  app.post("/merchant/connect/onboard", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const supabase = deps.getSupabase(authHeader);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    return c.json({
      error: "stripe_removed",
      message: "Add bank payout details in Merchant app Settings → Payouts.",
    }, 400);
  });

  app.get("/courier/connect/status", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const supabase = deps.getSupabase(authHeader);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    return c.json(bankPayoutJson);
  });

  app.post("/courier/connect/onboard", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const supabase = deps.getSupabase(authHeader);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    return c.json({
      error: "stripe_removed",
      message: "Add bank payout details in Courier app Profile → Payouts.",
    }, 400);
  });
}
