/**
 * Shared WiPay hosted checkout helper for fleet module purchases.
 */
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";
import { isWipayDemoMode } from "../_shared/wipayDemo.ts";

function wipayEnv(): string {
  return (Deno.env.get("WIPAY_ENV") ?? "sandbox").toLowerCase();
}

function isSandboxWipay(): boolean {
  const env = wipayEnv();
  return env !== "live" && env !== "production";
}

function wipayAccountNumber(): string {
  return Deno.env.get("WIPAY_ACCOUNT_NUMBER") ?? "";
}

function wipayApiKey(): string {
  return Deno.env.get("WIPAY_API_KEY") ?? "";
}

function wipayCallbackSecret(): string {
  return Deno.env.get("WIPAY_CALLBACK_SECRET") ?? "";
}

function wipayGatewayUrl(): string {
  if (isSandboxWipay()) {
    return "https://jmsb.wipayfinancial.com/plugins/payments/request";
  }
  return "https://jm.wipayfinancial.com/plugins/payments/request";
}

function fleetServerPublicUrl(): string {
  const base = Deno.env.get("SUPABASE_URL") ?? "";
  return `${base.replace(/\/$/, "")}/functions/v1/fleet-server`;
}

export function fleetRushModulePriceJmd(): number {
  const raw = Deno.env.get("FLEET_RUSH_MODULE_PRICE_JMD") ?? "9900";
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 9900;
}

export function wipaySuccess(status: unknown): boolean {
  const s = String(status ?? "").toLowerCase();
  return s === "success" || s === "completed" || s === "paid" || s === "1";
}

export function verifyWipayCallbackSecret(
  url: string,
  headerSecret: string,
): boolean {
  const expected = wipayCallbackSecret();
  if (!expected) return false;
  let fromQuery = "";
  try {
    fromQuery = new URL(url).searchParams.get("secret") ?? "";
  } catch {
    fromQuery = "";
  }
  const provided = headerSecret || fromQuery;
  if (!provided) return false;
  if (provided.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < provided.length; i++) {
    mismatch |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function createFleetWipayCheckout(opts: {
  purchaseId: string;
  amountJmd: number;
  customerEmail: string;
  returnBase: string;
}): Promise<{ paymentUrl?: string; transactionId?: string; error?: string; demo?: boolean }> {
  if (isWipayDemoMode()) {
    const demoTxn = `DEMO-FLEET-${opts.purchaseId.slice(0, 8)}-${Date.now()}`;
    return { paymentUrl: `demo://${demoTxn}`, transactionId: demoTxn, demo: true };
  }

  const accountNumber = wipayAccountNumber();
  const apiKey = wipayApiKey();
  if (!accountNumber || !apiKey) return { error: "WiPay not configured" };

  const callbackSecret = wipayCallbackSecret();
  if (!callbackSecret) {
    return { error: "WiPay callback secret not configured — set WIPAY_CALLBACK_SECRET" };
  }

  const responseUrl = new URL(`${fleetServerPublicUrl()}/make-server-37f42386/webhooks/wipay-fleet-modules`);
  responseUrl.searchParams.set("secret", callbackSecret);
  const customerReturn = `${opts.returnBase.replace(/\/$/, "")}/signup?wipay=fleet-modules`;
  const orderRef = `FLEET-${opts.purchaseId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 12)}`;
  const accountValue = /^\d+$/.test(accountNumber) ? Number(accountNumber) : accountNumber;

  try {
    const response = await fetchWithTimeout(wipayGatewayUrl(), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        account_number: accountValue,
        avs: "0",
        country_code: "JM",
        currency: "JMD",
        data: JSON.stringify({ purchaseId: opts.purchaseId, returnBase: opts.returnBase }),
        email: opts.customerEmail || "fleet@roam.app",
        environment: isSandboxWipay() ? "sandbox" : "live",
        fee_structure: "merchant_absorb",
        method: "credit_card_co",
        order_id: orderRef,
        origin: "RoamFleet",
        response_url: responseUrl.toString(),
        return_url: customerReturn,
        total: Number(opts.amountJmd).toFixed(2),
      }),
      timeoutMs: 15000,
    });

    const raw = await response.text();
    let result: { url?: string; message?: string; transaction_id?: string } = {};
    try {
      result = JSON.parse(raw) as { url?: string; message?: string; transaction_id?: string };
    } catch {
      console.error("[fleet/wipay] non-JSON response:", raw.slice(0, 300));
      return { error: "Failed to create WiPay payment" };
    }

    const checkoutUrl = String(result.url || "");
    if (!checkoutUrl || checkoutUrl.includes("status=error")) {
      return { error: result.message || "WiPay error" };
    }
    return { paymentUrl: checkoutUrl, transactionId: result.transaction_id };
  } catch (err) {
    console.error("[fleet/wipay] checkout error:", err);
    return { error: "Failed to create WiPay payment" };
  }
}
