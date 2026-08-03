/**
 * Stripe Connect Express onboarding for Dash merchants and couriers.
 * Requires STRIPE_SECRET_KEY. Does not touch WiPay/PayPal shared payments.
 */
import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

type Deps = {
  getSupabase: (authHeader: string) => SupabaseClient;
  getServiceSupabase: () => SupabaseClient;
};

function stripeSecret(): string | null {
  return Deno.env.get("STRIPE_SECRET_KEY") || null;
}

async function stripeRequest(
  path: string,
  init?: { method?: string; body?: Record<string, string> },
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const key = stripeSecret();
  if (!key) {
    return { ok: false, status: 503, json: { error: "STRIPE_SECRET_KEY not configured" } };
  }
  const method = init?.method || "GET";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
  };
  let body: string | undefined;
  if (init?.body) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(init.body).toString();
  }
  const res = await fetch(`https://api.stripe.com/v1/${path}`, { method, headers, body });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, json };
}

function paymentsClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "payments" } },
  );
}

export function registerStripeConnectRoutes(app: Hono, deps: Deps) {
  const { getSupabase, getServiceSupabase } = deps;

  app.get("/merchant/connect/status", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const supabase = getSupabase(authHeader);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const serviceSb = getServiceSupabase();
    const { data: merchant } = await serviceSb
      .from("merchants")
      .select("id, stripe_connect_account_id, owner_id")
      .eq("owner_id", user.id)
      .maybeSingle();

    if (!merchant) return c.json({ error: "Merchant not found" }, 404);
    const accountId = merchant.stripe_connect_account_id as string | null;
    if (!accountId) {
      return c.json({
        onboarded: false,
        charges_enabled: false,
        payouts_enabled: false,
        accountId: null,
      });
    }

    const acct = await stripeRequest(`accounts/${accountId}`);
    if (!acct.ok) {
      return c.json({
        onboarded: false,
        accountId,
        error: acct.json.error || "Failed to load Connect account",
      }, 502);
    }
    return c.json({
      onboarded: Boolean(acct.json.details_submitted),
      charges_enabled: Boolean(acct.json.charges_enabled),
      payouts_enabled: Boolean(acct.json.payouts_enabled),
      accountId,
    });
  });

  app.post("/merchant/connect/onboard", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const supabase = getSupabase(authHeader);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    if (!stripeSecret()) return c.json({ error: "STRIPE_SECRET_KEY not configured" }, 503);

    const serviceSb = getServiceSupabase();
    const { data: merchant } = await serviceSb
      .from("merchants")
      .select("id, stripe_connect_account_id, email, name")
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!merchant) return c.json({ error: "Merchant not found" }, 404);

    let accountId = merchant.stripe_connect_account_id as string | null;
    if (!accountId) {
      const created = await stripeRequest("accounts", {
        method: "POST",
        body: {
          type: "express",
          country: "JM",
          email: String(merchant.email || user.email || ""),
          "capabilities[card_payments][requested]": "true",
          "capabilities[transfers][requested]": "true",
          "business_profile[name]": String(merchant.name || "Roam Merchant"),
        },
      });
      if (!created.ok || !created.json.id) {
        return c.json({ error: created.json.error || "Failed to create Connect account" }, 502);
      }
      accountId = String(created.json.id);
      await serviceSb
        .from("merchants")
        .update({ stripe_connect_account_id: accountId })
        .eq("id", merchant.id);
    }

    const returnUrl = String(
      (await c.req.json().catch(() => ({}))).returnUrl ||
        Deno.env.get("DASH_MERCHANT_CONNECT_RETURN_URL") ||
        "https://partner.roam.app/settings/payouts",
    );
    const refreshUrl = String(
      Deno.env.get("DASH_MERCHANT_CONNECT_REFRESH_URL") || returnUrl,
    );

    const link = await stripeRequest("account_links", {
      method: "POST",
      body: {
        account: accountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: "account_onboarding",
      },
    });
    if (!link.ok || !link.json.url) {
      return c.json({ error: link.json.error || "Failed to create AccountLink" }, 502);
    }
    return c.json({ url: link.json.url, accountId });
  });

  app.get("/courier/connect/status", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const supabase = getSupabase(authHeader);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const serviceSb = getServiceSupabase();
    const { data: profile } = await serviceSb
      .from("courier_profiles")
      .select("user_id, stripe_connect_account_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!profile) return c.json({ error: "Courier profile required" }, 403);

    const accountId = profile.stripe_connect_account_id as string | null;
    if (!accountId) {
      return c.json({
        onboarded: false,
        charges_enabled: false,
        payouts_enabled: false,
        accountId: null,
      });
    }
    const acct = await stripeRequest(`accounts/${accountId}`);
    if (!acct.ok) {
      return c.json({ onboarded: false, accountId, error: acct.json.error }, 502);
    }
    return c.json({
      onboarded: Boolean(acct.json.details_submitted),
      charges_enabled: Boolean(acct.json.charges_enabled),
      payouts_enabled: Boolean(acct.json.payouts_enabled),
      accountId,
    });
  });

  app.post("/courier/connect/onboard", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const supabase = getSupabase(authHeader);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    if (!stripeSecret()) return c.json({ error: "STRIPE_SECRET_KEY not configured" }, 503);

    const serviceSb = getServiceSupabase();
    const { data: profile } = await serviceSb
      .from("courier_profiles")
      .select("user_id, stripe_connect_account_id, display_name")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!profile) return c.json({ error: "Courier profile required" }, 403);

    let accountId = profile.stripe_connect_account_id as string | null;
    if (!accountId) {
      const created = await stripeRequest("accounts", {
        method: "POST",
        body: {
          type: "express",
          country: "JM",
          email: String(user.email || ""),
          "capabilities[transfers][requested]": "true",
          "business_profile[name]": String(profile.display_name || "Roam Courier"),
        },
      });
      if (!created.ok || !created.json.id) {
        return c.json({ error: created.json.error || "Failed to create Connect account" }, 502);
      }
      accountId = String(created.json.id);
      await serviceSb
        .from("courier_profiles")
        .update({ stripe_connect_account_id: accountId })
        .eq("user_id", user.id);
    }

    const body = await c.req.json().catch(() => ({}));
    const returnUrl = String(
      body.returnUrl ||
        Deno.env.get("DASH_COURIER_CONNECT_RETURN_URL") ||
        "https://courier.roam.app/profile/payouts",
    );
    const link = await stripeRequest("account_links", {
      method: "POST",
      body: {
        account: accountId,
        refresh_url: returnUrl,
        return_url: returnUrl,
        type: "account_onboarding",
      },
    });
    if (!link.ok || !link.json.url) {
      return c.json({ error: link.json.error || "Failed to create AccountLink" }, 502);
    }
    return c.json({ url: link.json.url, accountId });
  });
}

export { paymentsClient };
