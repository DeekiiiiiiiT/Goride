/**
 * WiPay is not live yet — sandbox checkouts must not depend on their hosted page.
 * Demo pays complete the same capture path as a successful webhook.
 *
 * Live/production: always off.
 * Sandbox: on unless WIPAY_DEMO=0|false|off.
 */
export function isWipayDemoMode(): boolean {
  const env = (Deno.env.get("WIPAY_ENV") ?? "sandbox").toLowerCase();
  if (env === "live" || env === "production") return false;
  const flag = (Deno.env.get("WIPAY_DEMO") ?? "1").trim().toLowerCase();
  return flag !== "0" && flag !== "false" && flag !== "off" && flag !== "no";
}
