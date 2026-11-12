/**
 * Plain SMS through the same carriers as the sign-in code hook (send-sms):
 * Digicel when the number matches DIGICEL_PREFIXES, otherwise Flow.
 * Used by Week Reconciliation alerts (WRA-31). The hook itself is left unchanged.
 *
 * When no carrier is configured (DIGICEL_* / FLOW_* not set), nothing is sent and
 * the caller records "SMS not available" — the in-app alert still stands.
 */
import { loadPrefixListsFromEnv, pickCarrier } from "../send-sms/carrierRouter.ts";

export type SmsResult =
  | { sent: true; carrier: "digicel" | "flow" }
  | { sent: false; reason: "no_phone" | "carrier_not_configured" | "carrier_error"; detail?: string };

function env(name: string): string {
  try {
    return String(Deno.env.get(name) ?? "").trim();
  } catch {
    return "";
  }
}

export async function sendPlainSms(phoneE164: string, message: string): Promise<SmsResult> {
  const phone = String(phoneE164 || "").trim();
  if (!phone) return { sent: false, reason: "no_phone" };
  const carrier = pickCarrier(phone, loadPrefixListsFromEnv().digicel);

  let url = "";
  let headers: Record<string, string> = {};
  if (carrier === "digicel") {
    url = env("DIGICEL_SMS_URL");
    const user = env("DIGICEL_SMS_USER");
    const pass = env("DIGICEL_SMS_PASS");
    if (!url || !user || !pass) return { sent: false, reason: "carrier_not_configured" };
    headers = { Authorization: `Basic ${btoa(`${user}:${pass}`)}` };
  } else {
    url = env("FLOW_SMS_URL");
    const token = env("FLOW_SMS_TOKEN");
    if (!url || !token) return { sent: false, reason: "carrier_not_configured" };
    headers = { Authorization: `Bearer ${token}` };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ to: phone, message, text: message }),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) return { sent: false, reason: "carrier_error", detail: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    return { sent: true, carrier };
  } catch (e) {
    return { sent: false, reason: "carrier_error", detail: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}
