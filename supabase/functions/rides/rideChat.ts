import type { Context } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { jsonEdgeForbidden } from "../_shared/authEdge.ts";
import {
  canChatOnRide,
  getRideParticipantRole,
  isDelegatedBooking,
  phonesMatch,
} from "./rideAccess.ts";
import { sendRideNotification } from "./rideNotifications.ts";

export const RIDE_CHAT_ACTIVE_STATUSES = [
  "driver_assigned",
  "driver_en_route_pickup",
  "driver_arrived_pickup",
  "on_trip",
] as const;

export type RideMessageSenderRole = "rider" | "driver" | "booker";

export type RideMessageRow = {
  id: string;
  ride_request_id: string;
  sender_user_id: string;
  sender_role: RideMessageSenderRole;
  body: string;
  created_at: string;
};

export type RideChatParticipant = {
  user_id: string | null;
  label: string;
};

export type RideChatParticipants = {
  driver: RideChatParticipant;
  booker: RideChatParticipant;
  passenger: RideChatParticipant;
};

export type RideChatViewerRole = "driver" | "booker" | "passenger";

export function toRideMessageDto(row: Record<string, unknown>): RideMessageRow {
  const role = String(row.sender_role ?? "rider");
  const senderRole: RideMessageSenderRole =
    role === "driver" ? "driver" : role === "booker" ? "booker" : "rider";
  return {
    id: String(row.id),
    ride_request_id: String(row.ride_request_id),
    sender_user_id: String(row.sender_user_id),
    sender_role: senderRole,
    body: String(row.body),
    created_at: String(row.created_at),
  };
}

function firstNameFromDisplayName(name: string | null | undefined): string {
  const trimmed = name?.trim();
  if (!trimmed) return "";
  return trimmed.split(/\s+/)[0] ?? "";
}

function mapViewerRole(
  ride: Record<string, unknown>,
  userId: string,
): RideChatViewerRole | null {
  const role = getRideParticipantRole(ride, userId);
  if (role === "driver" || role === "booker" || role === "passenger") return role;
  return null;
}

async function resolveChatParticipants(
  ride: Record<string, unknown>,
  loadRiderDisplayName: (userId: string) => Promise<string | null>,
): Promise<RideChatParticipants> {
  const bookerId = ride.rider_user_id ? String(ride.rider_user_id) : null;
  const passengerId = ride.passenger_user_id ? String(ride.passenger_user_id) : null;
  const driverId = ride.assigned_driver_user_id ? String(ride.assigned_driver_user_id) : null;

  const passengerName = firstNameFromDisplayName(
    typeof ride.guest_passenger_name === "string" ? ride.guest_passenger_name : null,
  );

  let bookerLabel = "Booker";
  if (bookerId) {
    const bookerDisplay = await loadRiderDisplayName(bookerId);
    const bookerFirst = firstNameFromDisplayName(bookerDisplay);
    if (bookerFirst) bookerLabel = bookerFirst;
  }

  let passengerLabel = passengerName || "Rider";
  if (!passengerName && passengerId) {
    const passengerDisplay = await loadRiderDisplayName(passengerId);
    const passengerFirst = firstNameFromDisplayName(passengerDisplay);
    if (passengerFirst) passengerLabel = passengerFirst;
  }

  return {
    driver: { user_id: driverId, label: "Driver" },
    booker: { user_id: bookerId, label: bookerLabel },
    passenger: { user_id: passengerId, label: passengerLabel },
  };
}

type RideChatDeps = {
  messageDb: () => SupabaseClient;
  loadRideRequestById: (id: string) => Promise<Record<string, unknown> | null>;
  loadRiderDisplayName: (userId: string) => Promise<string | null>;
  requireUser: (authHeader: string | undefined) => Promise<
    { user: { id: string } } | { error: string; status: 401 }
  >;
  audit: (
    rideId: string | null,
    actor: string | undefined,
    eventType: string,
    payload: Record<string, unknown>,
  ) => Promise<void>;
};

function mapSenderRole(
  ride: Record<string, unknown>,
  userId: string,
): RideMessageSenderRole {
  const participantRole = getRideParticipantRole(ride, userId);
  if (participantRole === "driver") return "driver";
  if (participantRole === "booker") return "booker";
  return "rider";
}

function assertRideChatAccess(
  ride: Record<string, unknown>,
  userId: string,
): { ok: true; senderRole: RideMessageSenderRole } | { ok: false; error: string; status: number } {
  if (!canChatOnRide(ride, userId)) {
    return { ok: false, error: "forbidden", status: 403 };
  }
  const status = String(ride.status ?? "");
  if (!RIDE_CHAT_ACTIVE_STATUSES.includes(status as typeof RIDE_CHAT_ACTIVE_STATUSES[number])) {
    return { ok: false, error: "chat_not_available", status: 403 };
  }
  return { ok: true, senderRole: mapSenderRole(ride, userId) };
}

const MAX_BODY_LEN = 500;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export function registerRideChatRoutes(app: Hono, deps: RideChatDeps) {
  app.get("/v1/requests/:id/messages", async (c: Context) => {
    const auth = await deps.requireUser(c.req.header("Authorization"));
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);

    const rideId = c.req.param("id");
    const ride = await deps.loadRideRequestById(rideId);
    if (!ride) return c.json({ error: "not_found" }, 404);

    const participantRole = getRideParticipantRole(ride, auth.user.id);
    if (participantRole === "none") return jsonEdgeForbidden(c, "forbidden");

    const access = assertRideChatAccess(ride, auth.user.id);
    if (!access.ok) {
      if (access.error === "forbidden") return jsonEdgeForbidden(c, "forbidden");
      return c.json({ error: access.error }, access.status);
    }

    const limitRaw = Number(c.req.query("limit") ?? DEFAULT_LIMIT);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(MAX_LIMIT, Math.max(1, Math.floor(limitRaw)))
      : DEFAULT_LIMIT;
    const before = c.req.query("before")?.trim();

    let query = deps.messageDb()
      .from("ride_messages")
      .select("id, ride_request_id, sender_user_id, sender_role, body, created_at")
      .eq("ride_request_id", rideId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (before) {
      query = query.lt("created_at", before);
    }

    const { data, error } = await query;
    if (error) {
      return c.json({ error: "fetch_failed", message: error.message }, 500);
    }

    const messages = (data ?? [])
      .map((row) => toRideMessageDto(row as Record<string, unknown>))
      .reverse();

    const participants = await resolveChatParticipants(ride, deps.loadRiderDisplayName);
    const viewerRole = mapViewerRole(ride, auth.user.id);

    return c.json({
      messages,
      participants,
      viewer_role: viewerRole,
      is_delegated: isDelegatedBooking(ride),
    });
  });

  app.post("/v1/requests/:id/messages", async (c: Context) => {
    const auth = await deps.requireUser(c.req.header("Authorization"));
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);

    const rideId = c.req.param("id");
    const ride = await deps.loadRideRequestById(rideId);
    if (!ride) return c.json({ error: "not_found" }, 404);

    const access = assertRideChatAccess(ride, auth.user.id);
    if (!access.ok) {
      if (access.error === "forbidden") return jsonEdgeForbidden(c, access.error);
      return c.json({ error: access.error }, access.status);
    }

    const bodyJson = await c.req.json().catch(() => ({}));
    const rawBody = typeof bodyJson.body === "string" ? bodyJson.body.trim() : "";
    if (!rawBody) return c.json({ error: "invalid_body", message: "Message cannot be empty." }, 400);
    if (rawBody.length > MAX_BODY_LEN) {
      return c.json({
        error: "invalid_body",
        message: `Message must be at most ${MAX_BODY_LEN} characters.`,
      }, 400);
    }

    const { data: inserted, error } = await deps.messageDb()
      .from("ride_messages")
      .insert({
        ride_request_id: rideId,
        sender_user_id: auth.user.id,
        sender_role: access.senderRole,
        body: rawBody,
      })
      .select("id, ride_request_id, sender_user_id, sender_role, body, created_at")
      .single();

    if (error || !inserted) {
      return c.json({
        error: "insert_failed",
        message: error?.message ?? "Could not send message.",
      }, 500);
    }

    await deps.audit(rideId, auth.user.id, "ride_message_sent", {
      sender_role: access.senderRole,
      message_id: inserted.id,
    });

    return c.json({ message: toRideMessageDto(inserted as Record<string, unknown>) });
  });
}

export { phonesMatch };
