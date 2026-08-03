/**
 * Upsert a logistics job from a freight shipment row (+ optional legs).
 * Used by freight edge on book/transition and by logistics internal sync.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { shipmentStatusToJobStatus } from "./jobMachine.ts";

export type ShipmentRow = {
  id: string;
  organization_id: string;
  reference_code: string;
  status: string;
  origin_label: string;
  origin_lat?: number | null;
  origin_lng?: number | null;
  destination_label: string;
  destination_lat?: number | null;
  destination_lng?: number | null;
  notes?: string | null;
};

export type LegRow = {
  id: string;
  sequence: number;
  status?: string;
  notes?: string | null;
};

function logisticsDb(svc: SupabaseClient) {
  return svc.schema("logistics");
}

export async function appendJobEvent(
  svc: SupabaseClient,
  args: {
    orgId: string;
    jobId: string;
    eventType: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    actorUserId?: string | null;
    note?: string | null;
    payload?: Record<string, unknown>;
    idempotencyKey?: string | null;
  },
) {
  const { error } = await logisticsDb(svc).from("job_events").insert({
    organization_id: args.orgId,
    job_id: args.jobId,
    event_type: args.eventType,
    from_status: args.fromStatus ?? null,
    to_status: args.toStatus ?? null,
    actor_user_id: args.actorUserId ?? null,
    note: args.note ?? null,
    payload: args.payload ?? {},
    idempotency_key: args.idempotencyKey ?? null,
    occurred_at: new Date().toISOString(),
  });
  // Unique violation on idempotency_key is fine
  if (error && !error.message.toLowerCase().includes("duplicate") && error.code !== "23505") {
    console.error(JSON.stringify({ event: "job_event_insert_failed", error: error.message }));
  }
}

export async function syncJobFromShipment(
  svc: SupabaseClient,
  shipment: ShipmentRow,
  opts?: {
    legs?: LegRow[];
    actorUserId?: string | null;
    /** Skip creating jobs for draft shipments */
    force?: boolean;
  },
): Promise<{ job: Record<string, unknown> | null; skipped?: boolean; error?: string }> {
  // Board only tracks booked+ shipments unless forced
  if (shipment.status === "draft" && !opts?.force) {
    return { job: null, skipped: true };
  }

  const db = logisticsDb(svc);
  const { data: existing } = await db
    .from("jobs")
    .select("*")
    .eq("organization_id", shipment.organization_id)
    .eq("external_ref_type", "freight_shipment")
    .eq("external_ref_id", shipment.id)
    .maybeSingle();

  const nextStatus = shipmentStatusToJobStatus(shipment.status, existing?.status);
  const now = new Date().toISOString();

  const patch = {
    organization_id: shipment.organization_id,
    product_key: "enterprise",
    vertical_key: "freight",
    external_ref_type: "freight_shipment",
    external_ref_id: shipment.id,
    reference_code: shipment.reference_code,
    status: nextStatus,
    pickup_label: shipment.origin_label,
    pickup_lat: shipment.origin_lat ?? null,
    pickup_lng: shipment.origin_lng ?? null,
    dropoff_label: shipment.destination_label,
    dropoff_lat: shipment.destination_lat ?? null,
    dropoff_lng: shipment.destination_lng ?? null,
    notes: shipment.notes ?? null,
    updated_at: now,
    ...(nextStatus === "in_progress" && !existing?.started_at
      ? { started_at: now }
      : {}),
    ...(nextStatus === "completed" ? { completed_at: now } : {}),
  };

  let job: Record<string, unknown> | null = null;

  if (existing) {
    const { data, error } = await db
      .from("jobs")
      .update(patch)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) return { job: null, error: error.message };
    job = data;
    if (existing.status !== nextStatus) {
      await appendJobEvent(svc, {
        orgId: shipment.organization_id,
        jobId: existing.id,
        eventType: "status_mirrored",
        fromStatus: existing.status,
        toStatus: nextStatus,
        actorUserId: opts?.actorUserId,
        note: `Mirrored from shipment ${shipment.status}`,
        idempotencyKey: `mirror:${shipment.id}:${shipment.status}:${nextStatus}`,
      });
    }
  } else {
    const { data, error } = await db
      .from("jobs")
      .insert(patch)
      .select("*")
      .single();
    if (error) return { job: null, error: error.message };
    job = data;
    await appendJobEvent(svc, {
      orgId: shipment.organization_id,
      jobId: data.id,
      eventType: "job_created",
      toStatus: nextStatus,
      actorUserId: opts?.actorUserId,
      note: `Created from shipment ${shipment.reference_code}`,
      idempotencyKey: `create:${shipment.id}`,
    });
  }

  if (job) {
    await db.from("job_stops").delete().eq("job_id", job.id);
    const firstLegId = opts?.legs?.[0]?.id ?? null;
    const lastLegId = opts?.legs?.length
      ? opts.legs[opts.legs.length - 1]!.id
      : null;
    const { error: stopErr } = await db.from("job_stops").insert([
      {
        organization_id: shipment.organization_id,
        job_id: job.id,
        sequence: 1,
        stop_type: "pickup",
        label: shipment.origin_label,
        lat: shipment.origin_lat ?? null,
        lng: shipment.origin_lng ?? null,
        external_leg_id: firstLegId,
        status: "pending",
      },
      {
        organization_id: shipment.organization_id,
        job_id: job.id,
        sequence: 2,
        stop_type: "dropoff",
        label: shipment.destination_label,
        lat: shipment.destination_lat ?? null,
        lng: shipment.destination_lng ?? null,
        external_leg_id: lastLegId,
        status: "pending",
      },
    ]);
    if (stopErr) {
      console.error(JSON.stringify({ event: "job_stops_sync_failed", error: stopErr.message }));
    }
  }

  return { job };
}
