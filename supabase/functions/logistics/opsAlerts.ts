/**
 * Enterprise ops alerts (Phase F) — service-role writes only.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const STALE_GPS_THROTTLE_MS = 30 * 60_000;

export type OpsAlertKind =
  | "matching_exhausted"
  | "job_exception"
  | "stale_gps";

export type OpsAlertSeverity = "info" | "warning" | "critical";

function logistics(svc: SupabaseClient) {
  return svc.schema("logistics");
}

export function shouldThrottleStaleAlert(
  lastCreatedAt: string | null | undefined,
  nowMs = Date.now(),
  throttleMs = STALE_GPS_THROTTLE_MS,
): boolean {
  if (!lastCreatedAt) return false;
  const t = new Date(lastCreatedAt).getTime();
  if (!Number.isFinite(t)) return false;
  return nowMs - t < throttleMs;
}

export async function insertOpsAlert(
  svc: SupabaseClient,
  input: {
    orgId: string;
    kind: OpsAlertKind;
    severity: OpsAlertSeverity;
    title: string;
    body: string;
    jobId?: string | null;
    shipmentId?: string | null;
  },
): Promise<{ id?: string; error?: string }> {
  const { data, error } = await logistics(svc)
    .from("ops_alerts")
    .insert({
      organization_id: input.orgId,
      kind: input.kind,
      severity: input.severity,
      title: input.title,
      body: input.body,
      job_id: input.jobId || null,
      shipment_id: input.shipmentId || null,
    })
    .select("id")
    .single();
  if (error) {
    console.error(JSON.stringify({ event: "ops_alert_insert_failed", error: error.message }));
    return { error: error.message };
  }
  return { id: data?.id ? String(data.id) : undefined };
}

export async function emitMatchingExhaustedAlert(
  svc: SupabaseClient,
  input: {
    orgId: string;
    jobId: string;
    shipmentId?: string | null;
    referenceCode?: string | null;
    reason: string;
  },
): Promise<void> {
  const code = input.referenceCode || input.jobId.slice(0, 8);
  await insertOpsAlert(svc, {
    orgId: input.orgId,
    kind: "matching_exhausted",
    severity: "warning",
    title: `Matching exhausted — ${code}`,
    body: `${input.reason}. Job returned to unassigned.`,
    jobId: input.jobId,
    shipmentId: input.shipmentId,
  });
}

export async function emitJobExceptionAlert(
  svc: SupabaseClient,
  input: {
    orgId: string;
    jobId: string;
    shipmentId?: string | null;
    referenceCode?: string | null;
    note?: string | null;
  },
): Promise<void> {
  const code = input.referenceCode || input.jobId.slice(0, 8);
  await insertOpsAlert(svc, {
    orgId: input.orgId,
    kind: "job_exception",
    severity: "critical",
    title: `Exception — ${code}`,
    body: input.note?.trim() || "Job moved to exception status.",
    jobId: input.jobId,
    shipmentId: input.shipmentId,
  });
}

export async function maybeEmitStaleGpsAlert(
  svc: SupabaseClient,
  input: {
    orgId: string;
    jobId: string;
    shipmentId?: string | null;
    referenceCode?: string | null;
    locatedAt?: string | null;
  },
): Promise<{ emitted: boolean }> {
  const { data: recent } = await logistics(svc)
    .from("ops_alerts")
    .select("created_at")
    .eq("organization_id", input.orgId)
    .eq("job_id", input.jobId)
    .eq("kind", "stale_gps")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (shouldThrottleStaleAlert(recent?.created_at ? String(recent.created_at) : null)) {
    return { emitted: false };
  }

  const code = input.referenceCode || input.jobId.slice(0, 8);
  const when = input.locatedAt
    ? `Last ping ${input.locatedAt}.`
    : "No recent GPS ping.";
  const { error } = await insertOpsAlert(svc, {
    orgId: input.orgId,
    kind: "stale_gps",
    severity: "warning",
    title: `Stale GPS — ${code}`,
    body: `Driver location is stale while job is in progress. ${when}`,
    jobId: input.jobId,
    shipmentId: input.shipmentId,
  });
  return { emitted: !error };
}
