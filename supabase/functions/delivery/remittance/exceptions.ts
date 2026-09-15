/** Park failed COD collections so delivery never 500s (D-7). */

import { courierAssignmentFields } from "../courierFleetAttribution.ts";

// deno-lint-ignore no-explicit-any
type Sb = { schema: (s: string) => any; from: (t: string) => any };

function deliveryDb(sb: Sb) {
  return typeof sb.schema === "function" ? sb.schema("delivery") : sb;
}

async function courierStamp(
  sb: Sb,
  courierId: string | null,
): Promise<{ courier_id: string | null; courier_fleet_id: string | null }> {
  if (!courierId) return { courier_id: null, courier_fleet_id: null };
  // courierAssignmentFields expects a SupabaseClient; remittance uses a narrow Sb shape.
  const assignment = await courierAssignmentFields(sb as never, courierId);
  return assignment;
}

export async function parkException(
  sb: Sb,
  orderId: string,
  courierId: string | null,
  reason: string,
  err: unknown,
): Promise<void> {
  const db = deliveryDb(sb);
  const detail = {
    message: err instanceof Error ? err.message : String(err),
    name: err instanceof Error ? err.name : "Error",
  };
  const assignment = await courierStamp(sb, courierId);
  const { data: existing } = await db
    .from("courier_remittance_exceptions")
    .select("id, attempts")
    .eq("order_id", orderId)
    .maybeSingle();
  if (existing?.id) {
    await db
      .from("courier_remittance_exceptions")
      .update({
        attempts: Number(existing.attempts ?? 1) + 1,
        reason,
        detail,
        ...assignment,
      })
      .eq("id", existing.id);
    return;
  }
  await db.from("courier_remittance_exceptions").insert({
    order_id: orderId,
    ...assignment,
    reason,
    detail,
  });
}

export function classifyRemittanceError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/unique|duplicate|ux_remittance/i.test(msg)) return "duplicate_concurrent";
  if (/trial balance|remittance_trial_balance/i.test(msg)) return "trial_balance_mismatch";
  if (/non.?positive|ledgerAmount/i.test(msg)) return "non_positive";
  if (/no_courier|courier/i.test(msg) && /required|missing/i.test(msg)) {
    return "no_courier";
  }
  return "rpc_error";
}

export async function resolveException(
  sb: Sb,
  exceptionId: string,
  resolvedBy: string,
  note?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const db = deliveryDb(sb);
  const { data: existing } = await db
    .from("courier_remittance_exceptions")
    .select("id, detail, resolved_at")
    .eq("id", exceptionId)
    .maybeSingle();
  if (!existing) return { ok: false, error: "exception_not_found" };
  if (existing.resolved_at) return { ok: false, error: "already_resolved" };

  const prev = (existing.detail && typeof existing.detail === "object")
    ? existing.detail as Record<string, unknown>
    : {};
  const { error } = await db
    .from("courier_remittance_exceptions")
    .update({
      resolved_at: new Date().toISOString(),
      resolved_by: resolvedBy,
      detail: note ? { ...prev, resolved_note: note } : { ...prev, resolved_via: "manual" },
    })
    .eq("id", exceptionId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function retryException(
  sb: Sb,
  exceptionId: string,
  resolvedBy: string,
): Promise<{ ok: boolean; error?: string; reason?: string }> {
  const db = deliveryDb(sb);
  const { data: row, error } = await db
    .from("courier_remittance_exceptions")
    .select("id, order_id, courier_id, resolved_at")
    .eq("id", exceptionId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!row) return { ok: false, error: "exception_not_found" };
  if (row.resolved_at) return { ok: false, error: "already_resolved" };

  const { collectOnDelivery } = await import("./collectOnDelivery.ts");
  const result = await collectOnDelivery(
    sb,
    String(row.order_id),
    row.courier_id ? String(row.courier_id) : null,
  );
  if (!result.ok) {
    return { ok: false, error: "retry_failed", reason: result.reason };
  }
  await db
    .from("courier_remittance_exceptions")
    .update({
      resolved_at: new Date().toISOString(),
      resolved_by: resolvedBy,
      detail: { resolved_via: "retry" },
    })
    .eq("id", exceptionId);
  return { ok: true };
}
