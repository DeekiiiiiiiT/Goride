/**
 * Merchant-facing support case visibility and contest flow.
 */
import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { requireResolvedMerchantWithPermission } from "./merchantAuth.ts";

type Deps = {
  getSupabase: (authHeader: string) => ReturnType<typeof import("https://esm.sh/@supabase/supabase-js@2").createClient>;
  getServiceSupabase: () => ReturnType<typeof import("https://esm.sh/@supabase/supabase-js@2").createClient>;
};

export function registerMerchantSupportRoutes(app: Hono, deps: Deps) {
  const { getSupabase, getServiceSupabase } = deps;

  app.get("/merchant/support/cases", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

    const supabase = getSupabase(authHeader);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const access = await requireResolvedMerchantWithPermission(user.id, user.email, "orders");
    if (!access.ok) return c.json({ error: access.message }, access.status);

    const merchantId = access.resolved.merchant.id as string;
    const serviceSb = getServiceSupabase();

    const { data: orderIds } = await serviceSb
      .from("orders")
      .select("id")
      .eq("merchant_id", merchantId)
      .limit(500);

    const ids = (orderIds ?? []).map((o) => o.id);
    if (ids.length === 0) return c.json({ cases: [] });

    const { data: cases, error } = await serviceSb
      .from("support_cases")
      .select("id, subject, status, priority, order_id, fault_attribution, merchant_contested, created_at, updated_at")
      .in("order_id", ids)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) return c.json({ error: error.message }, 500);
    return c.json({ cases: cases ?? [] });
  });

  app.get("/merchant/support/cases/:id", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

    const supabase = getSupabase(authHeader);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const access = await requireResolvedMerchantWithPermission(user.id, user.email, "orders");
    if (!access.ok) return c.json({ error: access.message }, access.status);

    const merchantId = access.resolved.merchant.id as string;
    const caseId = c.req.param("id");
    const serviceSb = getServiceSupabase();

    const { data: caseRow, error } = await serviceSb
      .from("support_cases")
      .select("*")
      .eq("id", caseId)
      .maybeSingle();

    if (error) return c.json({ error: error.message }, 500);
    if (!caseRow?.order_id) return c.json({ error: "Case not found" }, 404);

    const { data: order } = await serviceSb
      .from("orders")
      .select("id, merchant_id, order_number")
      .eq("id", caseRow.order_id)
      .maybeSingle();

    if (!order || String(order.merchant_id) !== merchantId) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const { data: customerIssue } = await serviceSb
      .from("customer_order_issues")
      .select("issue_type, notes, photo_url, status, created_at")
      .eq("support_case_id", caseId)
      .maybeSingle();

    return c.json({ case: caseRow, order, customer_issue: customerIssue });
  });

  app.post("/merchant/support/cases/:id/contest", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

    const supabase = getSupabase(authHeader);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const access = await requireResolvedMerchantWithPermission(user.id, user.email, "orders");
    if (!access.ok) return c.json({ error: access.message }, access.status);

    const merchantId = access.resolved.merchant.id as string;
    const caseId = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 1000) : "";
    if (notes.length < 8) return c.json({ error: "Please explain why you are contesting (min 8 chars)" }, 400);

    const serviceSb = getServiceSupabase();
    const { data: caseRow } = await serviceSb
      .from("support_cases")
      .select("id, order_id")
      .eq("id", caseId)
      .maybeSingle();

    if (!caseRow?.order_id) return c.json({ error: "Case not found" }, 404);

    const { data: order } = await serviceSb
      .from("orders")
      .select("merchant_id")
      .eq("id", caseRow.order_id)
      .maybeSingle();

    if (!order || String(order.merchant_id) !== merchantId) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const { data: updated, error } = await serviceSb
      .from("support_cases")
      .update({
        merchant_contested: true,
        merchant_contest_notes: notes,
        status: "pending",
        priority: "high",
        updated_at: new Date().toISOString(),
      })
      .eq("id", caseId)
      .select()
      .single();

    if (error) return c.json({ error: error.message }, 500);
    return c.json({ case: updated });
  });

  app.get("/merchant/performance/snapshot", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

    const supabase = getSupabase(authHeader);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const access = await requireResolvedMerchantWithPermission(user.id, user.email, "orders");
    if (!access.ok) return c.json({ error: access.message }, access.status);

    const merchantId = access.resolved.merchant.id as string;
    const serviceSb = getServiceSupabase();

    const { data: snapshot } = await serviceSb
      .from("merchant_performance_snapshots")
      .select("*")
      .eq("merchant_id", merchantId)
      .order("period_start", { ascending: false })
      .limit(1)
      .maybeSingle();

    return c.json({ snapshot: snapshot ?? null });
  });
}
