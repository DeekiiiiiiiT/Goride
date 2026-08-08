/**
 * Ops → customer SMS for package lifecycle (Digicel when configured).
 * Stub-logs when SMS_HOOK_STUB_LOG_OK / RIDE_SMS_STUB_LOG_OK is set.
 */

export type PackageNotifyTemplate =
  | "received_at_warehouse"
  | "manifested"
  | "customs_cleared"
  | "customs_hold"
  | "ready_pickup"
  | "out_for_delivery"
  | "delivered"
  | "collected"
  | "pod_link";

function buildMessage(
  template: PackageNotifyTemplate,
  payload: Record<string, unknown>,
): string {
  const suite = payload.suite_code ? String(payload.suite_code) : "your suite";
  const tracking = payload.tracking ? String(payload.tracking) : "a package";
  switch (template) {
    case "received_at_warehouse":
      return `Roam Freight: We received ${tracking} for ${suite} at our warehouse.`;
    case "manifested":
      return `Roam Freight: ${tracking} (${suite}) is on the next shipment to Jamaica.`;
    case "customs_cleared":
      return `Roam Freight: ${tracking} (${suite}) cleared Jamaican customs.`;
    case "customs_hold":
      return `Roam Freight: ${tracking} (${suite}) is held for customs review. We'll update you shortly.`;
    case "ready_pickup": {
      const branch = payload.branch ? String(payload.branch) : "our branch";
      return `Roam Freight: ${tracking} (${suite}) is ready for pickup at ${branch}.`;
    }
    case "out_for_delivery":
      return `Roam Freight: ${tracking} (${suite}) is out for delivery today.`;
    case "delivered":
      return `Roam Freight: ${tracking} (${suite}) was delivered.`;
    case "collected":
      return `Roam Freight: ${tracking} (${suite}) was collected. Thank you.`;
    case "pod_link": {
      const url = String(payload.url ?? "");
      return `Roam Freight: Delivery batch assigned. Confirm deliveries here: ${url}`;
    }
    default:
      return `Roam Freight: Update for ${suite}.`;
  }
}

async function sendViaCarrier(to: string, message: string): Promise<boolean> {
  const stub =
    Deno.env.get("SMS_HOOK_STUB_LOG_OK") === "1" ||
    Deno.env.get("RIDE_SMS_STUB_LOG_OK") === "1";
  if (stub) {
    console.log(JSON.stringify({ svc: "freight_package_sms", to, message }));
    return true;
  }

  const digicelUrl = Deno.env.get("DIGICEL_SMS_API_URL");
  const digicelKey = Deno.env.get("DIGICEL_SMS_API_KEY");
  if (digicelUrl && digicelKey) {
    try {
      const res = await fetch(digicelUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${digicelKey}`,
        },
        body: JSON.stringify({ to, message }),
      });
      return res.ok;
    } catch (e) {
      console.error("[freight_package_sms] Digicel failed:", e);
    }
  }

  console.warn("[freight_package_sms] No SMS carrier; not sent:", { to });
  return false;
}

export async function notifyPackageContact(
  phone: string | null | undefined,
  template: PackageNotifyTemplate,
  payload: Record<string, unknown>,
): Promise<boolean> {
  if (!phone || !String(phone).trim()) return false;
  const message = buildMessage(template, payload);
  return sendViaCarrier(String(phone).trim(), message);
}
