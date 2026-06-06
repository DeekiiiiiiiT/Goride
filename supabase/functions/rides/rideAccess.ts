/**
 * Shared ride participant access checks for delegated booking.
 */

export type RideParticipantRole = "booker" | "passenger" | "driver" | "none";

export function getRideParticipantRole(
  ride: Record<string, unknown>,
  userId: string,
): RideParticipantRole {
  if (ride.assigned_driver_user_id === userId) return "driver";
  if (ride.passenger_user_id === userId) return "passenger";
  if (ride.rider_user_id === userId) return "booker";
  return "none";
}

export function canAccessRide(
  ride: Record<string, unknown>,
  userId: string,
): boolean {
  return getRideParticipantRole(ride, userId) !== "none";
}

export function canChatOnRide(
  ride: Record<string, unknown>,
  userId: string,
): boolean {
  const role = getRideParticipantRole(ride, userId);
  return role === "passenger" || role === "driver";
}

export function canCancelRideAsRider(
  ride: Record<string, unknown>,
  userId: string,
): boolean {
  return ride.rider_user_id === userId;
}

export function shouldExposePinToUser(
  ride: Record<string, unknown>,
  userId: string,
): boolean {
  if (ride.passenger_user_id) {
    return ride.passenger_user_id === userId;
  }
  if (ride.guest_passenger_phone) {
    return false;
  }
  return ride.rider_user_id === userId;
}

export function normalizePhoneE164(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}

export function phonesMatch(a: string, b: string): boolean {
  return normalizePhoneE164(a) === normalizePhoneE164(b);
}

export function generateToken(bytes = 24): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function generatePublicCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const arr = new Uint8Array(6);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => chars[b % chars.length]).join("");
}

export const PASSENGER_APP_ORIGIN = Deno.env.get("ROAM_RIDES_APP_ORIGIN") ?? "https://roam-s.co";

export function passengerInviteUrl(token: string): string {
  return `${PASSENGER_APP_ORIGIN}/ride/join/${token}`;
}

export function roamTagUrl(token: string): string {
  return `${PASSENGER_APP_ORIGIN}/tag/${token}`;
}
