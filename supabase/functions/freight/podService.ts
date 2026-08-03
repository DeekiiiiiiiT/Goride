/**
 * Shared proof-of-delivery writer for Enterprise freight door-delivery batches.
 * Auth deliver-stop and public token deliver both call completeStopDelivery.
 */
import { serviceClient } from "../_shared/enterpriseAccess.ts";
import { notifyPackageContact } from "./notifyPackage.ts";

function freightDb() {
  return serviceClient().schema("freight");
}

export function issuePodToken(): { token: string; expiresAt: string } {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  return { token, expiresAt };
}

export type PodBatchRow = {
  id: string;
  organization_id: string;
  batch_number: string;
  status: string;
  pod_token: string | null;
  pod_token_expires_at: string | null;
};

export async function loadPodSessionByToken(
  token: string,
): Promise<
  | { ok: true; batch: PodBatchRow; stops: unknown[] }
  | { ok: false; status: 404 | 410; error: string }
> {
  const { data: batch } = await freightDb()
    .from("delivery_batches")
    .select("*")
    .eq("pod_token", token)
    .maybeSingle();
  if (!batch) return { ok: false, status: 404, error: "Invalid link" };
  if (
    batch.pod_token_expires_at &&
    new Date(batch.pod_token_expires_at).getTime() < Date.now()
  ) {
    return { ok: false, status: 410, error: "Link expired" };
  }
  const { data: stops } = await freightDb()
    .from("delivery_batch_stops")
    .select(
      "id, stop_order, address, status, packages(id, courier_tracking_number, description, suites(suite_code))",
    )
    .eq("batch_id", batch.id)
    .order("stop_order");
  return { ok: true, batch: batch as PodBatchRow, stops: stops ?? [] };
}

export type CompleteStopInput = {
  batchId: string;
  organizationId: string;
  packageId: string;
  podNote?: string | null;
  podPhotoPath?: string | null;
  actorUserId?: string | null;
  defaultNote?: string;
};

export type CompleteStopResult =
  | {
    ok: true;
    stop: Record<string, unknown>;
    package: Record<string, unknown> | null;
    batchCompleted: boolean;
  }
  | { ok: false; error: string };

async function notifyDelivered(pkg: {
  id: string;
  suite_id: string | null;
  courier_tracking_number: string | null;
}) {
  if (!pkg.suite_id) return;
  const { data: suite } = await freightDb()
    .from("suites")
    .select("suite_code, contact_phone")
    .eq("id", pkg.suite_id)
    .maybeSingle();
  if (!suite?.contact_phone) return;
  await notifyPackageContact(suite.contact_phone, "delivered", {
    suite_code: suite.suite_code,
    tracking: pkg.courier_tracking_number || pkg.id.slice(0, 8),
  });
  await freightDb()
    .from("packages")
    .update({ last_notified_at: new Date().toISOString() })
    .eq("id", pkg.id);
}

/** Single writer for stop delivery + package + fulfillment + batch completion. */
export async function completeStopDelivery(
  input: CompleteStopInput,
): Promise<CompleteStopResult> {
  const now = new Date().toISOString();
  const note =
    (input.podNote && input.podNote.trim()) ||
    input.defaultNote ||
    "Confirmed via POD";

  const { data: stop, error } = await freightDb()
    .from("delivery_batch_stops")
    .update({
      status: "delivered",
      delivered_at: now,
      pod_note: note,
      pod_photo_path: input.podPhotoPath || null,
      updated_at: now,
    })
    .eq("batch_id", input.batchId)
    .eq("package_id", input.packageId)
    .eq("organization_id", input.organizationId)
    .select("*")
    .single();
  if (error) return { ok: false, error: error.message };

  const { data: pkg } = await freightDb()
    .from("packages")
    .update({ status: "delivered", updated_at: now })
    .eq("id", input.packageId)
    .select("*")
    .single();

  await freightDb()
    .from("fulfillment_orders")
    .update({ status: "completed", completed_at: now, updated_at: now })
    .eq("package_id", input.packageId);

  await freightDb().from("package_scan_events").insert({
    organization_id: input.organizationId,
    package_id: input.packageId,
    event_type: "delivered",
    note,
    actor_user_id: input.actorUserId ?? null,
    metadata: {},
    occurred_at: now,
  });

  if (pkg) await notifyDelivered(pkg);

  const { data: remaining } = await freightDb()
    .from("delivery_batch_stops")
    .select("id")
    .eq("batch_id", input.batchId)
    .neq("status", "delivered")
    .neq("status", "skipped");

  let batchCompleted = false;
  if (!remaining?.length) {
    batchCompleted = true;
    await freightDb()
      .from("delivery_batches")
      .update({ status: "completed", completed_at: now, updated_at: now })
      .eq("id", input.batchId);
  }

  return {
    ok: true,
    stop: stop as Record<string, unknown>,
    package: (pkg as Record<string, unknown> | null) ?? null,
    batchCompleted,
  };
}
