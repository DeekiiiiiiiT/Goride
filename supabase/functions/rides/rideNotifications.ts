/**
 * Transactional ride SMS (invite links, status updates, trusted contact trip sharing).
 * Uses Digicel/Flow when configured; logs in stub mode.
 */

import { normalizePhoneE164 } from "./rideAccess.ts";

export type RideNotificationTemplate =
  | "passenger_invite"
  | "delegated_ride_booked"
  | "driver_assigned"
  | "driver_arrived"
  | "shadow_trip_completed"
  | "trip_share"
  | "trip_share_emergency"
  | "trip_share_test";

type NotificationPayload = {
  to: string;
  template: RideNotificationTemplate;
  payload: Record<string, unknown>;
};

function buildMessage(template: RideNotificationTemplate, payload: Record<string, unknown>): string {
  switch (template) {
    case "passenger_invite": {
      const name = payload.guest_name ? String(payload.guest_name) : "there";
      const url = String(payload.url ?? "");
      return `Hi ${name}, a Roam ride has been booked for you. Track and chat with your driver: ${url}`;
    }
    case "delegated_ride_booked": {
      const name = payload.guest_name ? String(payload.guest_name) : "there";
      const url = String(payload.url ?? "");
      return `Hi ${name}, a Roam ride has been booked for you. Open the app to track your driver and get your trip PIN: ${url}`;
    }
    case "driver_assigned": {
      const url = payload.url ? String(payload.url) : "";
      return url
        ? `Your Roam driver has been assigned. Track your ride: ${url}`
        : `Your Roam driver has been assigned and is heading to the pickup. Open the app to track your ride.`;
    }
    case "driver_arrived": {
      const url = payload.url ? String(payload.url) : "";
      return url
        ? `Your Roam driver has arrived. Open the app for your pickup PIN: ${url}`
        : `Your Roam driver has arrived. Open the app for your pickup PIN.`;
    }
    case "shadow_trip_completed": {
      const name = payload.guest_name ? String(payload.guest_name) : "the rider";
      return `Shadow trip complete — ${name} has been dropped off. View your receipt in the Roam app Wallet.`;
    }
    case "trip_share": {
      const name = payload.rider_name ? String(payload.rider_name) : "Someone";
      const url = String(payload.url ?? "");
      return `${name} is sharing their Roam trip with you. Track live: ${url}`;
    }
    case "trip_share_emergency": {
      const name = payload.rider_name ? String(payload.rider_name) : "Someone";
      const url = String(payload.url ?? "");
      return `URGENT: ${name} requested emergency help on a Roam trip. Location: ${url}`;
    }
    case "trip_share_test": {
      const name = payload.rider_name ? String(payload.rider_name) : "Someone";
      const url = String(payload.url ?? "");
      return `This is a test safety alert from Roam. When ${name} rides, you'll get links like this: ${url}`;
    }
    default:
      return "You have a Roam ride update.";
  }
}

async function sendViaCarrier(to: string, message: string): Promise<boolean> {
  const stub = Deno.env.get("SMS_HOOK_STUB_LOG_OK") === "1" ||
    Deno.env.get("RIDE_SMS_STUB_LOG_OK") === "1";
  if (stub) {
    console.log(JSON.stringify({ svc: "ride_notifications", to, message }));
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
      console.error("[ride_notifications] Digicel failed:", e);
    }
  }

  console.warn("[ride_notifications] No SMS carrier configured; message not sent:", { to });
  return false;
}

export async function sendRideNotification(input: NotificationPayload): Promise<boolean> {
  const message = buildMessage(input.template, input.payload);
  return sendViaCarrier(input.to, message);
}

/** SMS the passenger (guest phone or linked passenger account). */
export async function notifyPassengerOfRideEvent(
  svc: { auth: { admin: { getUserById: (id: string) => Promise<{ data: { user?: { phone?: string | null } | null } }> } } },
  ride: Record<string, unknown>,
  template: RideNotificationTemplate,
  extraPayload: Record<string, unknown> = {},
): Promise<void> {
  let phone: string | null = ride.guest_passenger_phone ? String(ride.guest_passenger_phone) : null;

  if (!phone && ride.passenger_user_id) {
    const { data } = await svc.auth.admin.getUserById(String(ride.passenger_user_id));
    phone = data.user?.phone ?? null;
  }

  if (!phone && !ride.guest_passenger_phone && !ride.passenger_user_id && ride.rider_user_id) {
    const { data } = await svc.auth.admin.getUserById(String(ride.rider_user_id));
    phone = data.user?.phone ?? null;
  }

  if (!phone) return;

  await sendRideNotification({
    to: normalizePhoneE164(phone),
    template,
    payload: extraPayload,
  });
}

/** SMS the shadow booker when a delegated shadow trip completes. */
export async function notifyShadowBookerOfTripCompleted(
  svc: { auth: { admin: { getUserById: (id: string) => Promise<{ data: { user?: { phone?: string | null } | null } }> } } },
  ride: Record<string, unknown>,
): Promise<void> {
  if (ride.roam_mode !== "shadow_roam") return;
  const bookerId = ride.rider_user_id ? String(ride.rider_user_id) : null;
  if (!bookerId) return;
  const { data } = await svc.auth.admin.getUserById(bookerId);
  const phone = data.user?.phone ?? null;
  if (!phone) return;
  await sendRideNotification({
    to: normalizePhoneE164(phone),
    template: "shadow_trip_completed",
    payload: {
      guest_name: ride.guest_passenger_name ?? "the rider",
      ride_id: ride.id,
    },
  });
}

