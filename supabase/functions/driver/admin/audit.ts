import { getRiderAdminDb } from "../../_shared/ridesAdminDb.ts";

export async function driverAudit(
  actorId: string,
  eventType: string,
  payload: Record<string, unknown>,
) {
  try {
    const ridesDb = await getRiderAdminDb();
    await ridesDb.db.from(ridesDb.tables.audit_events).insert({
      ride_request_id: null,
      actor_user_id: actorId,
      event_type: eventType,
      payload,
    });
  } catch (e) {
    console.error("[driverAudit] Failed to log audit event:", e);
  }
}
