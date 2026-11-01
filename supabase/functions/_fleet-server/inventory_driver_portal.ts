/**
 * Driver car kit + reports (R8-07). PostgREST via public.fleet_inv_* bridge.
 */
import type { Context } from "npm:hono@4.3.11";
import { resolveDriverVehicleAssignment } from "./driver_vehicle_assignment.ts";
import { invDb } from "./inventory_db.ts";
import type { RbacUser } from "./rbac_middleware.ts";

type InvCtx = Context<{ Variables: { rbacUser?: RbacUser } }>;

const LINKED_LABELS: Record<string, string> = {
  linked_fuel_card: "Fuel card",
  linked_toll_tag: "Toll tag",
};

function db() {
  return invDb();
}

function driverId(c: InvCtx): string | null {
  const user = c.get("rbacUser") as RbacUser | undefined;
  return user?.userId?.trim() || null;
}

function mapIssue(raw: unknown): "damaged" | "missing" | "not_working" {
  const s = String(raw ?? "").toLowerCase();
  if (s.includes("missing")) return "missing";
  if (s.includes("damage") || s.includes("broken")) return "damaged";
  return "not_working";
}

function mapItemStatus(lineStatus: string): "present" | "missing" | "linked" | "reported" {
  if (lineStatus === "linked") return "linked";
  if (lineStatus === "ok") return "present";
  return "missing";
}

async function nextReportNo(org: string): Promise<string> {
  const { data } = await db()
    .from("fleet_inv_driver_report")
    .select("report_no")
    .eq("organization_id", org)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const prev = data?.report_no ? String(data.report_no) : "";
  const m = prev.match(/(\d+)\s*$/);
  const n = m ? Number(m[1]) + 1 : 8842;
  return `RP-${n}`;
}

export async function buildDriverCarKitPayload(
  org: string,
  vehicleId: string | null,
  hintVehicleId?: string | null,
  driverUserId?: string | null,
) {
  const assignment = await resolveDriverVehicleAssignment(driverUserId, {
    organizationId: org,
    hintVehicleId: hintVehicleId ?? vehicleId,
  });

  const resolvedId = assignment.vehicleId;
  if (!resolvedId) {
    return {
      stub: false,
      organizationId: org,
      vehicleId: null,
      vehicleLabel: null,
      items: [] as Array<Record<string, unknown>>,
      openReportCount: 0,
      lastCheckInAt: null,
      state: "no_vehicle" as const,
    };
  }

  const { data: vehicle } = await db()
    .from("fleet_vehicles")
    .select("id, license_plate, make, model, year, odometer, fuel_level")
    .eq("organization_id", org)
    .eq("id", resolvedId)
    .maybeSingle();

  const plate = vehicle?.license_plate ? String(vehicle.license_plate) : resolvedId;
  const vehicleLabel = vehicle?.make
    ? `${vehicle.make} ${vehicle.model ?? ""}`.trim() + (vehicle.year ? ` ${vehicle.year}` : "")
    : plate;

  const { data: compliance, error: compErr } = await db()
    .from("fleet_inv_v_kit_compliance")
    .select("kit_line_id, item_id, line_type, line_status, blocks_road_clearance")
    .eq("organization_id", org)
    .eq("vehicle_id", resolvedId);

  if (compErr) throw new Error(compErr.message);

  if (!compliance?.length) {
    return {
      stub: false,
      organizationId: org,
      vehicleId: resolvedId,
      vehicleLabel: plate,
      vehicleMakeModel: vehicleLabel,
      odometerKm: vehicle?.odometer ?? null,
      fuelLevelPct: vehicle?.fuel_level ?? null,
      items: [],
      openReportCount: 0,
      lastCheckInAt: null,
      state: "no_kit" as const,
    };
  }

  const itemIds = [...new Set(compliance.map((r) => r.item_id).filter(Boolean))] as string[];
  const names = new Map<string, string>();
  if (itemIds.length) {
    const { data: items } = await db()
      .from("fleet_inv_item")
      .select("id, name")
      .eq("organization_id", org)
      .in("id", itemIds);
    for (const row of items ?? []) {
      names.set(String(row.id), String(row.name));
    }
  }

  const items = compliance.map((row) => {
    const lineType = String(row.line_type ?? "item");
    const name = row.item_id
      ? names.get(String(row.item_id)) ?? "Kit item"
      : LINKED_LABELS[lineType] ?? "Linked item";
    return {
      id: String(row.kit_line_id),
      name,
      status: mapItemStatus(String(row.line_status)),
      locationHint: lineType === "linked_fuel_card" ? "PetroJam fleet card" : undefined,
    };
  });

  const { count: openReportCount } = await db()
    .from("fleet_inv_driver_report")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", org)
    .eq("vehicle_id", resolvedId)
    .in("status", ["sent", "seen"]);

  const { data: vk } = await db()
    .from("fleet_inv_vehicle_kit")
    .select("last_inspected_at")
    .eq("organization_id", org)
    .eq("vehicle_id", resolvedId)
    .maybeSingle();

  return {
    stub: false,
    organizationId: org,
    vehicleId: resolvedId,
    vehicleLabel: plate,
    vehicleMakeModel: vehicleLabel,
    odometerKm: vehicle?.odometer ?? null,
    fuelLevelPct: vehicle?.fuel_level ?? null,
    items,
    openReportCount: openReportCount ?? 0,
    lastCheckInAt: vk?.last_inspected_at ?? null,
    state: "ready" as const,
  };
}

export async function handleDriverCarKitGet(c: InvCtx, org: string) {
  const hint = c.req.query("vehicle_id") ?? null;
  const payload = await buildDriverCarKitPayload(org, hint, hint, driverId(c));
  return c.json(payload);
}

export async function handleDriverReportsGet(
  c: InvCtx,
  org: string,
  offset: number,
  limit: number,
) {
  const hint = c.req.query("vehicle_id") ?? null;
  const assignment = await resolveDriverVehicleAssignment(driverId(c), {
    organizationId: org,
    hintVehicleId: hint,
  });
  if (!assignment.vehicleId) {
    return c.json({ items: [], nextCursor: null, limit, offset, stub: false, organizationId: org });
  }

  const { data, error } = await db()
    .from("fleet_inv_driver_report")
    .select("*")
    .eq("organization_id", org)
    .eq("vehicle_id", assignment.vehicleId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return c.json({ error: error.message }, 500);

  const items = (data ?? []).map((r) => ({
    id: r.id,
    reportNo: r.report_no,
    issue: r.issue,
    note: r.note,
    status: r.status,
    fleetReply: r.fleet_reply,
    seenAt: r.seen_at,
    fixedAt: r.fixed_at,
    createdAt: r.created_at,
    photoPaths: r.photo_paths,
  }));

  const nextCursor = items.length === limit ? String(offset + limit) : null;
  return c.json({ items, nextCursor, limit, offset, stub: false, organizationId: org });
}

export async function handleDriverReportPost(c: InvCtx, org: string, idem: string) {
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  const existing = await db()
    .from("fleet_inv_driver_report")
    .select("*")
    .eq("organization_id", org)
    .eq("client_key", idem)
    .maybeSingle();
  if (existing.data) {
    return c.json({ stub: false, idempotencyKey: idem, report: existing.data }, 200);
  }

  const hint = (body.vehicleId ?? body.vehicle_id ?? c.req.query("vehicle_id")) as string | undefined;
  const assignment = await resolveDriverVehicleAssignment(driverId(c), {
    organizationId: org,
    hintVehicleId: hint ?? null,
  });
  if (!assignment.vehicleId) {
    return c.json({ error: "No vehicle assigned" }, 409);
  }

  const itemNames = Array.isArray(body.itemNames) ? body.itemNames.map(String) : [];
  const itemLabel = itemNames[0] ?? "Kit item";
  const reportNo = await nextReportNo(org);

  const { data: inserted, error } = await db()
    .from("fleet_inv_driver_report")
    .insert({
      organization_id: org,
      report_no: reportNo,
      vehicle_id: assignment.vehicleId,
      issue: mapIssue(body.issueType ?? body.issue ?? itemLabel),
      note: String(body.notes ?? body.note ?? itemLabel),
      photo_paths: Array.isArray(body.photoUrls) ? body.photoUrls.map(String) : [],
      client_key: idem,
      status: "sent",
    })
    .select("*")
    .single();

  if (error) return c.json({ error: error.message }, 500);

  return c.json({
    stub: false,
    idempotencyKey: idem,
    report: {
      ...inserted,
      itemLabel,
      displayName: itemLabel,
    },
  }, 202);
}

export async function handleDriverKitCheckPost(c: InvCtx, org: string, idem: string) {
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  const vehicleId = String(body.vehicleId ?? body.vehicle_id ?? "");
  if (!vehicleId) {
    return c.json({ error: "vehicleId required" }, 400);
  }

  const { error } = await db()
    .from("fleet_inv_vehicle_kit")
    .update({ last_inspected_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("organization_id", org)
    .eq("vehicle_id", vehicleId);

  if (error) return c.json({ error: error.message }, 500);

  return c.json({
    stub: false,
    idempotencyKey: idem,
    organizationId: org,
    vehicleId,
    payload: body,
  });
}
