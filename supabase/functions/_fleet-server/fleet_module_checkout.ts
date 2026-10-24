/**
 * Fleet Rush module checkout — WiPay commercial entitlement.
 */
import type { Hono } from "npm:hono@4.3.11";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import type { RbacUser } from "./rbac_middleware.ts";
import {
  createFleetWipayCheckout,
  fleetRushModulePriceJmd,
  verifyWipayCallbackSecret,
  wipaySuccess,
} from "./fleet_wipay.ts";
import { applyOrgServiceLines } from "./rush_rollout_admin.ts";

function rbacUser(c: { get: (k: string) => unknown }): RbacUser | null {
  const user = c.get("rbacUser") as RbacUser | undefined;
  return user?.userId ? user : null;
}

function parseServiceLines(body: unknown): string[] | null {
  if (!Array.isArray(body)) return null;
  const lines = body
    .filter((s): s is string => s === "rideshare" || s === "rush_delivery");
  return lines.length ? lines : null;
}

async function readWipayPayload(
  c: {
    req: {
      method: string;
      url: string;
      header: (n: string) => string | undefined;
      json: () => Promise<unknown>;
      parseBody: () => Promise<Record<string, unknown>>;
    };
  },
): Promise<Record<string, string>> {
  const url = new URL(c.req.url);
  const out: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    if (key !== "secret") out[key] = value;
  });
  if (c.req.method === "GET" || c.req.method === "HEAD") return out;

  const contentType = c.req.header("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const json = await c.req.json();
      if (json && typeof json === "object") {
        for (const [k, v] of Object.entries(json as Record<string, unknown>)) {
          out[k] = String(v ?? "");
        }
      }
      return out;
    }
    const form = await c.req.parseBody();
    for (const [k, v] of Object.entries(form)) {
      out[k] = String(v ?? "");
    }
    return out;
  } catch {
    return out;
  }
}

export async function completeFleetModulePurchase(
  supabase: SupabaseClient,
  purchaseId: string,
  payload: Record<string, string>,
): Promise<void> {
  const { data: purchase, error } = await supabase.rpc("svc_module_purchase_get", { p_id: purchaseId });

  if (error || !purchase) throw new Error("Purchase not found");
  if (purchase.status === "completed") return;

  const txnId =
    payload.transaction_id ||
    payload.transactionId ||
    payload.transactionid ||
    purchase.provider_transaction_id;

  await supabase.rpc("svc_module_purchase_complete", {
    p_id: purchaseId,
    p_txn: txnId ?? null,
    p_provider_data: { ...(purchase.provider_data as object), webhook: payload },
  });

  const orgId = purchase.organization_id as string | null;
  const lines = purchase.service_lines as string[];

  if (orgId && lines?.length) {
    await applyOrgServiceLines(supabase, orgId, lines);
  }
}

export function registerFleetModuleCheckoutRoutes(
  app: Hono,
  deps: {
    supabase: SupabaseClient;
    requireAuth: () => unknown;
    getOrgId: (c: { get: (k: string) => unknown }) => string | null;
  },
): void {
  app.post(
    "/make-server-37f42386/fleet/module-checkout",
    deps.requireAuth() as never,
    async (c) => {
      const rbac = rbacUser(c);
      if (!rbac) return c.json({ error: "Unauthorized" }, 401);

      const body = await c.req.json().catch(() => ({}));
      const serviceLines = parseServiceLines(body?.serviceLines) ?? ["rush_delivery"];
      if (!serviceLines.includes("rush_delivery")) {
        return c.json({ error: "Rush delivery module purchase required" }, 400);
      }

      const returnOrigin = typeof body?.returnOrigin === "string" ? body.returnOrigin.trim() : "";
      const origin = c.req.header("origin") ?? "";
      const returnBase = returnOrigin || origin || "https://fleet.roam.app";

      const orgId = deps.getOrgId(c);
      const amountJmd = fleetRushModulePriceJmd();

      const { data: authUser } = await deps.supabase.auth.admin.getUserById(rbac.userId);
      const customerEmail = authUser?.user?.email ?? "";

      const { data: purchase, error: insertErr } = await deps.supabase.rpc("svc_module_purchase_insert", {
        p_org: orgId,
        p_user: rbac.userId,
        p_lines: serviceLines,
        p_amount: amountJmd,
      });

      if (insertErr || !purchase) {
        return c.json({ error: insertErr?.message ?? "Could not create purchase" }, 500);
      }

      const wipay = await createFleetWipayCheckout({
        purchaseId: purchase.id,
        amountJmd,
        customerEmail,
        returnBase,
      });

      if (wipay.error) return c.json({ error: wipay.error }, 503);

      await deps.supabase.rpc("svc_module_purchase_set_redirect", {
        p_id: purchase.id,
        p_txn: wipay.transactionId,
        p_url: wipay.paymentUrl,
        p_provider_data: { demo: wipay.demo ?? false },
      });

      if (wipay.demo) {
        await completeFleetModulePurchase(deps.supabase, purchase.id, {
          transaction_id: wipay.transactionId ?? "",
          status: "success",
        });
        return c.json({
          purchaseId: purchase.id,
          demoPaid: true,
          amountJmd,
          currency: "JMD",
        });
      }

      return c.json({
        purchaseId: purchase.id,
        paymentRedirectUrl: wipay.paymentUrl,
        amountJmd,
        currency: "JMD",
      });
    },
  );

  app.get(
    "/make-server-37f42386/fleet/module-checkout/:purchaseId",
    deps.requireAuth() as never,
    async (c) => {
      const rbac = rbacUser(c);
      if (!rbac) return c.json({ error: "Unauthorized" }, 401);

      const purchaseId = c.req.param("purchaseId");
      const { data: purchase } = await deps.supabase.rpc("svc_module_purchase_status", {
        p_id: purchaseId,
      });

      if (!purchase || purchase.user_id !== rbac.userId) {
        return c.json({ error: "Not found" }, 404);
      }

      return c.json({
        purchaseId: purchase.id,
        status: purchase.status,
        amountJmd: purchase.amount_jmd,
        currency: purchase.currency,
        completedAt: purchase.completed_at,
      });
    },
  );

  app.all("/make-server-37f42386/webhooks/wipay-fleet-modules", async (c) => {
    const headerSecret = c.req.header("X-WiPay-Callback-Secret") ?? "";
    if (!verifyWipayCallbackSecret(c.req.url, headerSecret)) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const payload = await readWipayPayload(c);
    const purchaseId =
      payload.purchaseId ||
      (() => {
        try {
          const data = JSON.parse(payload.data || "{}");
          return String(data.purchaseId ?? "");
        } catch {
          return "";
        }
      })();

    const txnId = payload.transaction_id || payload.transactionId || payload.transactionid;
    if (!purchaseId && txnId) {
      const { data: byTxn } = await deps.supabase.rpc("svc_module_purchase_id_by_txn", { p_txn: txnId });
      if (byTxn) {
        if (wipaySuccess(payload.status || payload.payment_status)) {
          await completeFleetModulePurchase(deps.supabase, byTxn, payload);
        }
        return c.json({ received: true, success: wipaySuccess(payload.status) });
      }
    }

    if (!purchaseId) return c.json({ error: "Purchase not found" }, 404);

    if (wipaySuccess(payload.status || payload.payment_status)) {
      await completeFleetModulePurchase(deps.supabase, purchaseId, payload);
      return c.json({ received: true, success: true });
    }

    await deps.supabase.rpc("svc_module_purchase_fail", {
      p_id: purchaseId,
      p_provider_data: { webhook: payload },
    });

    return c.json({ received: true, success: false });
  });
}
