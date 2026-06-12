import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type ScheduledPipelineItem = {
  kind: "schedule";
  id: string;
  title: string;
  subtitle: string | null;
  scheduled_at: string | null;
  pickup_address: string | null;
  dropoff_address: string | null;
  status: string;
  detail_lines: string[];
};

function formatScheduledSubtitle(
  pickupAddress: string | null,
  dropoffAddress: string | null,
): string {
  const from = pickupAddress?.trim() || "Pickup";
  const to = dropoffAddress?.trim() || "Destination";
  return `${from} → ${to}`;
}

export async function loadScheduledPipelineItems(
  svc: () => SupabaseClient,
  pubSvc: () => SupabaseClient,
  userId: string,
): Promise<ScheduledPipelineItem[]> {
  const db = svc();
  const pub = pubSvc();
  const { data: native, error } = await db.from("ride_requests")
    .select(
      "id, status, scheduled_pickup_at, pickup_address, dropoff_address, vehicle_option, fare_estimate_minor, currency",
    )
    .eq("rider_user_id", userId)
    .eq("status", "scheduled")
    .order("scheduled_pickup_at", { ascending: true })
    .limit(10);
  let rows = (!error && native ? native : null) as Record<string, unknown>[] | null;
  if (!rows) {
    const { data: pubRows } = await pub.from("rides_ride_requests")
      .select(
        "id, status, scheduled_pickup_at, pickup_address, dropoff_address, vehicle_option, fare_estimate_minor, currency",
      )
      .eq("rider_user_id", userId)
      .eq("status", "scheduled")
      .order("scheduled_pickup_at", { ascending: true })
      .limit(10);
    rows = (pubRows ?? []) as Record<string, unknown>[];
  }

  return rows.map((row) => {
    const when = row.scheduled_pickup_at ? String(row.scheduled_pickup_at) : null;
    const vehicle = typeof row.vehicle_option === "string" ? row.vehicle_option : "Ride";
    return {
      kind: "schedule" as const,
      id: String(row.id),
      title: when
        ? new Date(when).toLocaleString("en-JM", {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
        : "Scheduled ride",
      subtitle: formatScheduledSubtitle(
        row.pickup_address as string | null,
        row.dropoff_address as string | null,
      ),
      scheduled_at: when,
      pickup_address: (row.pickup_address as string | null) ?? null,
      dropoff_address: (row.dropoff_address as string | null) ?? null,
      status: "scheduled",
      detail_lines: [
        vehicle,
        row.fare_estimate_minor != null && row.currency
          ? `${row.currency} ${(Number(row.fare_estimate_minor) / 100).toFixed(2)} estimated`
          : "Fare locked at booking",
        "Driver assigned before pickup",
      ],
    };
  });
}
