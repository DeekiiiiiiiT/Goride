/**
 * Scheduled ride notification extension points (MVP = audit + in-app only).
 *
 * Future push/email hooks — subscribe to these audit event types:
 * - scheduled_ride_created
 * - scheduled_ride_cancelled
 * - scheduled_ride_activated (dispatch → matching)
 * - scheduled_ride_dispatch_failed (rider busy / missed window via RPC)
 *
 * Suggested reminder schedule (post-MVP):
 * - T-24h: email optional
 * - T-1h: push + in-app (client poll mirrors this today)
 * - T-dispatch: scheduled_ride_activated → push "Finding your driver"
 */

export const SCHEDULED_RIDE_AUDIT_EVENTS = [
  "scheduled_ride_quoted",
  "scheduled_ride_created",
  "scheduled_ride_cancelled",
  "scheduled_ride_activated",
  "scheduled_ride_dispatch_failed",
] as const;

export type ScheduledRideAuditEvent = (typeof SCHEDULED_RIDE_AUDIT_EVENTS)[number];
