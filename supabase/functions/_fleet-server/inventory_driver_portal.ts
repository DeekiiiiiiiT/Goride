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

function mapItemStatus(
  lineStatus: string,
  lineType: string,
): "present" | "missing" | "linked" | "reported" {
  const isLinkedLine = lineType === "linked_fuel_card" || lineType === "linked_toll_tag";
  // Fuel card / toll tag lines are now really checked (ok | missing); "linked" kept for old rows.
  if (lineStatus === "linked" || (isLinkedLine && lineStatus === "ok")) return "linked";
  if (lineStatus === "ok") return "present";
  return "missing";
}

async function loadFleetSupportPhone(org: string): Promise<string | null> {
  const { data } = await db()
    .from("fleet_inv_settings")
    .select("fleet_support_phone")
    .eq("organization_id", org)
    .maybeSingle();
  const phone = data?.fleet_support_phone ? String(data.fleet_support_phone).trim() : "";
  return phone || null;
}

function formatKitVersion(version: number | null | undefined, revisionHash: string | null | undefined): string | null {
  if (version != null && Number.isFinite(Number(version))) {
    return `v${version}`;
  }
  if (revisionHash?.trim()) return revisionHash.trim();
  return null;
}

async function loadOpenReportsByVehicle(org: string, vehicleId: string) {
  const { data } = await db()
    .from("fleet_inv_driver_report")
    .select("id, item_id, kit_line_id, created_at, fleet_reply, issue, note")
    .eq("organization_id", org)
    .eq("vehicle_id", vehicleId)
    .in("status", ["sent", "seen"]);
  return data ?? [];
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
  const fleetSupportPhone = await loadFleetSupportPhone(org);

  if (!resolvedId) {
    return {
      stub: false,
      organizationId: org,
      vehicleId: null,
      vehicleLabel: null,
      items: [] as Array<Record<string, unknown>>,
      openReportCount: 0,
      fixedUnseenCount: 0,
      lastCheckInAt: null,
      fleetSupportPhone,
      state: "no_vehicle" as const,
    };
  }

  const { data: vehicle } = await db()
    .from("fleet_vehicles")
    .select("id, license_plate, make, model, year, color, vin")
    .eq("organization_id", org)
    .eq("id", resolvedId)
    .maybeSingle();

  const plate = vehicle?.license_plate ? String(vehicle.license_plate) : resolvedId;
  const vehicleMakeModel = vehicle?.make
    ? `${vehicle.make} ${vehicle.model ?? ""}`.trim() + (vehicle.year ? ` ${vehicle.year}` : "")
    : null;
  const vinRaw = vehicle?.vin ? String(vehicle.vin).replace(/\s/g, "") : "";
  const vinLast4 = vinRaw.length >= 4 ? vinRaw.slice(-4) : null;
  const vehicleColor = vehicle?.color ? String(vehicle.color) : null;

  const { count: fixedUnseenCountRaw } = await db()
    .from("fleet_inv_driver_report")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", org)
    .eq("vehicle_id", resolvedId)
    .eq("status", "fixed")
    .is("seen_by_driver_at", null);
  const fixedUnseenCount = fixedUnseenCountRaw ?? 0;

  const { data: vkMeta } = await db()
    .from("fleet_inv_vehicle_kit")
    .select("last_inspected_at, updated_at, version_id")
    .eq("organization_id", org)
    .eq("vehicle_id", resolvedId)
    .maybeSingle();

  let kitVersionLabel: string | null = null;
  let lastSyncedAt: string | null = vkMeta?.updated_at ?? null;
  if (vkMeta?.version_id) {
    const { data: ver } = await db()
      .from("fleet_inv_kit_template_version")
      .select("version, revision_hash")
      .eq("organization_id", org)
      .eq("id", vkMeta.version_id)
      .maybeSingle();
    kitVersionLabel = formatKitVersion(ver?.version as number | undefined, ver?.revision_hash as string | undefined);
  }

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
      vehicleMakeModel: vehicleMakeModel ?? plate,
      vehicleColor,
      vinLast4,
      odometerKm: null,
      fuelLevelPct: null,
      items: [],
      openReportCount: 0,
      fixedUnseenCount,
      lastCheckInAt: vkMeta?.last_inspected_at ?? null,
      lastSyncedAt,
      kitVersionLabel,
      fleetSupportPhone,
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

  const openReports = await loadOpenReportsByVehicle(org, resolvedId);
  const reportByLine = new Map<string, (typeof openReports)[0]>();
  const reportByItem = new Map<string, (typeof openReports)[0]>();
  for (const rep of openReports) {
    if (rep.kit_line_id) reportByLine.set(String(rep.kit_line_id), rep);
    if (rep.item_id) reportByItem.set(String(rep.item_id), rep);
  }

  const items = compliance.map((row) => {
    const lineType = String(row.line_type ?? "item");
    const lineId = String(row.kit_line_id);
    const itemId = row.item_id ? String(row.item_id) : null;
    const name = row.item_id
      ? names.get(String(row.item_id)) ?? "Kit item"
      : LINKED_LABELS[lineType] ?? "Linked item";
    let status = mapItemStatus(String(row.line_status), lineType);
    let reportedAt: string | null = null;
    let statusHint: string | null = null;
    let reportId: string | null = null;
    const openRep = reportByLine.get(lineId) ?? (itemId ? reportByItem.get(itemId) : undefined);
    if (openRep && status !== "linked") {
      status = "reported";
      reportedAt = openRep.created_at ? String(openRep.created_at) : null;
      statusHint = openRep.fleet_reply ? String(openRep.fleet_reply) : null;
      reportId = openRep.id ? String(openRep.id) : null;
    }
    return {
      id: lineId,
      name,
      status,
      reportedAt,
      statusHint,
      reportId,
      locationHint:
        lineType === "linked_fuel_card"
          ? "PetroJam fleet card"
          : lineType === "linked_toll_tag"
            ? "Managed by fleet"
            : undefined,
    };
  });

  const openReportCount = openReports.length;

  return {
    stub: false,
    organizationId: org,
    vehicleId: resolvedId,
    vehicleLabel: plate,
    vehicleMakeModel: vehicleMakeModel ?? plate,
    vehicleColor,
    vinLast4,
    odometerKm: null,
    fuelLevelPct: null,
    items,
    extras: [],
    openReportCount,
    fixedUnseenCount,
    lastCheckInAt: vkMeta?.last_inspected_at ?? null,
    lastSyncedAt,
    kitVersionLabel,
    fleetSupportPhone,
    state: "ready" as const,
  };
}

export async function handleDriverCarKitGet(c: InvCtx, org: string) {
  const hint = c.req.query("vehicle_id") ?? null;
  const payload = await buildDriverCarKitPayload(org, hint, hint, driverId(c));
  return c.json(payload);
}

export async function handleDriverReportsSeenPost(c: InvCtx, org: string) {
  const hint = c.req.query("vehicle_id") ?? null;
  const assignment = await resolveDriverVehicleAssignment(driverId(c), {
    organizationId: org,
    hintVehicleId: hint,
  });
  if (!assignment.vehicleId) {
    return c.json({ error: "No vehicle assigned" }, 409);
  }
  const now = new Date().toISOString();
  const { data, error } = await db()
    .from("fleet_inv_driver_report")
    .update({ seen_by_driver_at: now })
    .eq("organization_id", org)
    .eq("vehicle_id", assignment.vehicleId)
    .eq("status", "fixed")
    .is("seen_by_driver_at", null)
    .select("id");
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ stub: false, markedSeen: (data ?? []).length, organizationId: org });
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

  const itemIds = [...new Set((data ?? []).map((r) => r.item_id).filter(Boolean))] as string[];
  const itemNames = new Map<string, string>();
  if (itemIds.length) {
    const { data: itemRows } = await db()
      .from("fleet_inv_item")
      .select("id, name")
      .eq("organization_id", org)
      .in("id", itemIds);
    for (const row of itemRows ?? []) {
      itemNames.set(String(row.id), String(row.name));
    }
  }

  const items = (data ?? []).map((r) => {
    const fromItem = r.item_id ? itemNames.get(String(r.item_id)) : undefined;
    const itemLabel = fromItem ?? (r.note && String(r.note).trim() ? String(r.note).trim() : "Kit item");
    return {
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
      itemLabel,
      displayName: itemLabel,
    };
  });

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

  let resolvedItemId: string | null = null;
  let resolvedKitLineId: string | null = null;
  if (itemLabel && itemLabel !== "Kit item") {
    const { data: compliance } = await db()
      .from("fleet_inv_v_kit_compliance")
      .select("kit_line_id, item_id")
      .eq("organization_id", org)
      .eq("vehicle_id", assignment.vehicleId);
    const compItemIds = [...new Set((compliance ?? []).map((r) => r.item_id).filter(Boolean))] as string[];
    const nameById = new Map<string, string>();
    if (compItemIds.length) {
      const { data: itemRows } = await db()
        .from("fleet_inv_item")
        .select("id, name")
        .eq("organization_id", org)
        .in("id", compItemIds);
      for (const row of itemRows ?? []) {
        nameById.set(String(row.id), String(row.name));
      }
    }
    for (const row of compliance ?? []) {
      if (!row.item_id) continue;
      const nm = nameById.get(String(row.item_id));
      if (nm && nm.toLowerCase() === itemLabel.toLowerCase()) {
        resolvedItemId = String(row.item_id);
        resolvedKitLineId = String(row.kit_line_id);
        break;
      }
    }
  }

  const noteText = body.notes != null ? String(body.notes).trim() : "";
  const { data: inserted, error } = await db()
    .from("fleet_inv_driver_report")
    .insert({
      organization_id: org,
      report_no: reportNo,
      vehicle_id: assignment.vehicleId,
      kit_line_id: resolvedKitLineId,
      item_id: resolvedItemId,
      issue: mapIssue(body.issueType ?? body.issue ?? itemLabel),
      note: noteText || itemLabel,
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

const DRIVER_UPDATE_KINDS = new Set([
  "found_it",
  "got_replacement",
  "still_missing",
  "replacement_en_route",
  "hub_collection_ready",
  "urgent_safety_item",
]);

export async function handleDriverReportUpdatePost(
  c: InvCtx,
  org: string,
  reportId: string,
  idem: string,
) {
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  const kind = String(body.kind ?? "");
  if (!DRIVER_UPDATE_KINDS.has(kind)) {
    return c.json({ error: "Invalid update kind" }, 400);
  }

  const byRoleRaw = String(body.by_role ?? body.byRole ?? "").toLowerCase();
  const isFleetUpdate = byRoleRaw === "fleet" || body.fleet === true;

  let report: Record<string, unknown> | null = null;
  if (isFleetUpdate) {
    const { data, error: loadErr } = await db()
      .from("fleet_inv_driver_report")
      .select("*")
      .eq("organization_id", org)
      .eq("id", reportId)
      .maybeSingle();
    if (loadErr) return c.json({ error: loadErr.message }, 500);
    if (!data) return c.json({ error: "Not found" }, 404);
    report = data as Record<string, unknown>;
  } else {
    const assignment = await resolveDriverVehicleAssignment(driverId(c), {
      organizationId: org,
      hintVehicleId: (body.vehicleId ?? body.vehicle_id) as string | null ?? null,
    });
    if (!assignment.vehicleId) {
      return c.json({ error: "No vehicle assigned" }, 409);
    }

    const { data, error: loadErr } = await db()
      .from("fleet_inv_driver_report")
      .select("*")
      .eq("organization_id", org)
      .eq("id", reportId)
      .eq("vehicle_id", assignment.vehicleId)
      .maybeSingle();
    if (loadErr) return c.json({ error: loadErr.message }, 500);
    if (!data) return c.json({ error: "Not found" }, 404);
    report = data as Record<string, unknown>;
  }

  const note = body.note != null ? String(body.note) : null;
  const photoPaths = Array.isArray(body.photoPaths ?? body.photo_paths)
    ? (body.photoPaths ?? body.photo_paths).map(String).filter(Boolean)
    : [];

  if (!isFleetUpdate && kind === "got_replacement" && photoPaths.length === 0) {
    return c.json({ error: "Photo required for replacement updates" }, 400);
  }

  const byRole = isFleetUpdate ? "fleet" : "driver";

  const { data: updateRow, error: insErr } = await db()
    .from("fleet_inv_driver_report_update")
    .insert({
      organization_id: org,
      report_id: reportId,
      by_role: byRole,
      kind,
      note,
      photo_paths: photoPaths,
    })
    .select("*")
    .single();
  if (insErr) return c.json({ error: insErr.message }, 500);

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {};
  if (note) patch.note = note;
  if (photoPaths.length) patch.photo_paths = photoPaths;
  if (kind === "found_it" || kind === "got_replacement") {
    patch.status = "fixed";
    patch.fixed_at = now;
  }

  const { data: updatedReport, error: updErr } = await db()
    .from("fleet_inv_driver_report")
    .update(patch)
    .eq("organization_id", org)
    .eq("id", reportId)
    .select("*")
    .maybeSingle();
  if (updErr) return c.json({ error: updErr.message }, 500);

  return c.json({
    stub: false,
    idempotencyKey: idem,
    update: updateRow,
    report: updatedReport,
  }, 202);
}
