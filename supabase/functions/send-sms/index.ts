/**
 * Supabase Auth — Send SMS Hook
 * https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook
 *
 * Verifies Standard Webhooks, routes Digicel vs Flow (prefix-based), POSTs JSON to carrier URLs when configured.
 * Set SMS_HOOK_STUB_LOG_OK=1 for dev only (logs OTP, returns 200 — never in production).
 */
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { loadPrefixListsFromEnv, pickCarrier } from "./carrierRouter.ts";

function normalizeHookSecret(): string {
  const s = Deno.env.get("SEND_SMS_HOOK_SECRET") ?? "";
  return s.replace(/^v1,whsec_/i, "").replace(/^whsec_/i, "");
}

function jsonErr(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: { http_code: status, message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function buildMessage(otp: string): string {
  const t = (Deno.env.get("SMS_MESSAGE_TEMPLATE") ?? "Your code is {{ .Code }}").trim();
  return t
    .replace(/\{\{\s*\.?\s*Code\s*\}\}/gi, otp)
    .replace(/\{\{\s*otp\s*\}\}/gi, otp)
    .replace(/\{\{\s*CODE\s*\}\}/g, otp);
}

function isDigicelConfigured(): boolean {
  const url = Deno.env.get("DIGICEL_SMS_URL")?.trim();
  const user = Deno.env.get("DIGICEL_SMS_USER")?.trim();
  const pass = Deno.env.get("DIGICEL_SMS_PASS")?.trim();
  return Boolean(url && user && pass);
}

function isFlowConfigured(): boolean {
  const url = Deno.env.get("FLOW_SMS_URL")?.trim();
  const token = Deno.env.get("FLOW_SMS_TOKEN")?.trim();
  return Boolean(url && token);
}

function headersToRecord(h: Headers): Record<string, string> {
  const o: Record<string, string> = {};
  h.forEach((v, k) => {
    if (v) o[k] = v;
  });
  return o;
}

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>
): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Carrier HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
}

async function sendDigicel(phone: string, message: string): Promise<void> {
  const url = Deno.env.get("DIGICEL_SMS_URL")!.trim();
  const user = Deno.env.get("DIGICEL_SMS_USER")!.trim();
  const pass = Deno.env.get("DIGICEL_SMS_PASS")!.trim();
  const b64 = btoa(`${user}:${pass}`);
  await postJson(url, { Authorization: `Basic ${b64}` }, { to: phone, message, text: message });
}

async function sendFlow(phone: string, message: string): Promise<void> {
  const url = Deno.env.get("FLOW_SMS_URL")!.trim();
  const token = Deno.env.get("FLOW_SMS_TOKEN")!.trim();
  await postJson(url, { Authorization: `Bearer ${token}` }, { to: phone, message, text: message });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }
  if (req.method !== "POST") {
    return jsonErr(405, "Method not allowed");
  }

  const secret = normalizeHookSecret();
  if (!secret) {
    return jsonErr(500, "SEND_SMS_HOOK_SECRET is not set on the Edge Function");
  }

  const raw = await req.text();
  const headerRecord = headersToRecord(req.headers);

  let user: { phone?: string };
  let sms: { otp?: string };
  try {
    const wh = new Webhook(secret);
    const payload = wh.verify(raw, headerRecord) as { user?: { phone?: string }; sms?: { otp?: string } };
    user = payload.user ?? {};
    sms = payload.sms ?? {};
  } catch (e) {
    console.error("[send-sms] webhook verify failed:", e);
    return jsonErr(401, "Invalid webhook signature");
  }

  const phone = typeof user.phone === "string" ? user.phone : "";
  const otp = typeof sms.otp === "string" ? sms.otp : "";
  if (!phone || !otp) {
    return jsonErr(400, "Missing user.phone or sms.otp in payload");
  }

  const stub = Deno.env.get("SMS_HOOK_STUB_LOG_OK") === "1" || Deno.env.get("SMS_HOOK_STUB_LOG_OK") === "true";
  if (stub) {
    console.warn("[send-sms] SMS_HOOK_STUB_LOG_OK enabled — OTP visible in logs; do not use in production");
    console.warn("[send-sms] phone=", phone, "otp=", otp);
    return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  const { digicel: digPrefixes } = loadPrefixListsFromEnv();
  const carrier = pickCarrier(phone, digPrefixes);

  if (carrier === "digicel") {
    if (!isDigicelConfigured()) {
      return jsonErr(
        503,
        "SMS gateway not configured for Digicel. Set DIGICEL_SMS_URL, DIGICEL_SMS_USER, and DIGICEL_SMS_PASS on this function."
      );
    }
    try {
      const message = buildMessage(otp);
      await sendDigicel(phone, message);
    } catch (e) {
      console.error("[send-sms] Digicel send failed:", e);
      return jsonErr(502, e instanceof Error ? e.message : "Digicel SMS send failed");
    }
  } else {
    if (!isFlowConfigured()) {
      return jsonErr(
        503,
        "SMS gateway not configured for Flow. Set FLOW_SMS_URL and FLOW_SMS_TOKEN on this function."
      );
    }
    try {
      const message = buildMessage(otp);
      await sendFlow(phone, message);
    } catch (e) {
      console.error("[send-sms] Flow send failed:", e);
      return jsonErr(502, e instanceof Error ? e.message : "Flow SMS send failed");
    }
  }

  return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });
});
