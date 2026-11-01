/**
 * Inspection / DVIR routes (extracted from maintenance_routes.ts).
 */
import type { Context } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { requireAuth, requireAnyPermission, effectiveRole, type RbacUser } from "../rbac_middleware.ts";
import { getOrgId } from "../org_scope.ts";
import { fleetDb } from "../repos/baseRepo.ts";
import { insertMaintenanceEvent } from "../maintenance_logging_helpers.ts";
import { projectFromMaintenanceLog } from "../odometer_ledger.ts";

type RouteApp = {
  post: (path: string, ...handlers: unknown[]) => void;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function rbacUserId(c: Context): string | null {
  const id = (c.get("rbacUser") as RbacUser | undefined)?.userId;
  return id && isUuid(String(id)) ? String(id) : null;
}

function parseOptionalUuidField(raw: unknown): { ok: true; value: string | null } | { ok: false } {
  if (raw == null || raw === "") return { ok: true, value: null };
  const s = String(raw).trim();
  if (!isUuid(s)) return { ok: false };
  return { ok: true, value: s };
}

function mapApiLineToDb(
  raw: Record<string, unknown>,
  sortOrder: number,
  workOrderId: string,
  updatedBy: string | null,
): Record<string, unknown> {
  return {
    work_order_id: workOrderId,
    sort_order: sortOrder,
    component_name: raw.componentName != null
      ? String(raw.componentName)
      : (raw.categoryName != null ? String(raw.categoryName) : (raw.label != null ? String(raw.label) : "Inspection item")),
    action: "inspect",
    recommended: true,
    declined: false,
    notes: raw.notes != null ? String(raw.notes) : null,
    updated_by: updatedBy,
  };
}

export function registerMaintenanceInspectionRoutes(route: RouteApp, supabase: SupabaseClient) {
  route.post(
    "/maintenance-inspection-findings",
    requireAuth(),
    requireAnyPermission("vehicles.edit", "maintenance.inspect"),
    async (c: Context) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const rbacUser = c.get("rbacUser") as RbacUser | undefined;
        const body = (await c.req.json()) as Record<string, unknown>;
        const rawFindings = Array.isArray(body.findings) ? body.findings : [];
        if (!rawFindings.length) return c.json({ error: "findings[] is required" }, 400);

        const bodyVehicleHint = String(body.vehicleId ?? "").trim();
        let assignedVehicleId: string | null = null;
        if (rbacUser && effectiveRole(rbacUser) === "driver") {
          const { resolveDriverVehicleAssignment } = await import("../driver_vehicle_assignment.ts");
          const resolved = await resolveDriverVehicleAssignment(rbacUser.userId, {
            organizationId: orgId,
            hintVehicleId: bodyVehicleHint || undefined,
          });
          assignedVehicleId = resolved.vehicleId;
          if (!assignedVehicleId) {
            return c.json({
              error: "No assigned vehicle",
              code: "NO_ASSIGNED_VEHICLE",
              message: "You need an assigned vehicle before submitting an inspection.",
            }, 400);
          }
        }

        const actorId = rbacUserId(c);
        const bodyWoParsed = parseOptionalUuidField(body.workOrderId ?? body.work_order_id);
        if (!bodyWoParsed.ok) return c.json({ error: "Invalid workOrderId" }, 400);

        let sharedWoId = bodyWoParsed.value;
        let needsWo = false;
        for (const raw of rawFindings) {
          if (!raw || typeof raw !== "object") continue;
          const st = String((raw as Record<string, unknown>).status ?? "pass").trim();
          if (st === "fail" || st === "attention") needsWo = true;
        }

        const firstVehicleId = String(
          (rawFindings[0] as Record<string, unknown>).vehicleId
          ?? (rawFindings[0] as Record<string, unknown>).vehicle_id
          ?? body.vehicleId
          ?? "",
        ).trim();

        if (assignedVehicleId && firstVehicleId && firstVehicleId !== assignedVehicleId) {
          return c.json({ error: "Vehicle must match your assigned vehicle" }, 403);
        }
        const primaryVehicleId = assignedVehicleId || firstVehicleId;
        if (!primaryVehicleId) return c.json({ error: "vehicleId is required" }, 400);

        if (needsWo && !sharedWoId) {
          sharedWoId = crypto.randomUUID();
          const { error: woErr } = await supabase.from("maintenance_work_orders").insert({
            id: sharedWoId,
            organization_id: orgId,
            vehicle_id: primaryVehicleId,
            status: "draft",
            source: "inspection",
            opened_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            updated_by: actorId,
            performed_at_date: String(body.date ?? body.performedAtDate ?? todayIso()).slice(0, 10),
            currency: "JMD",
            provider: "DVIR",
          });
          if (woErr) throw woErr;
        }

        const created: Record<string, unknown>[] = [];
        let lineSort = 0;
        for (const raw of rawFindings) {
          if (!raw || typeof raw !== "object") continue;
          const f = raw as Record<string, unknown>;
          const vehicleId = String(f.vehicleId ?? f.vehicle_id ?? body.vehicleId ?? primaryVehicleId).trim();
          if (!vehicleId) return c.json({ error: "vehicleId is required on each finding" }, 400);
          if (assignedVehicleId && vehicleId !== assignedVehicleId) {
            return c.json({ error: "Vehicle must match your assigned vehicle" }, 403);
          }

          const statusRaw = String(f.status ?? "pass").trim();
          const status = ["pass", "attention", "fail"].includes(statusRaw) ? statusRaw : "pass";
          const woParsed = parseOptionalUuidField(f.workOrderId ?? f.work_order_id ?? sharedWoId);
          if (!woParsed.ok) return c.json({ error: "Invalid workOrderId" }, 400);
          const itemParsed = parseOptionalUuidField(f.itemId ?? f.item_id);
          if (!itemParsed.ok) return c.json({ error: "Invalid itemId" }, 400);

          const photoUrl = f.photoUrl != null
            ? String(f.photoUrl)
            : (f.photo_url != null ? String(f.photo_url) : null);
          if (status === "fail" && (!photoUrl || !photoUrl.trim())) {
            return c.json({ error: "Photo is required for failed inspection items" }, 400);
          }

          let itemSafetyCritical = false;
          let itemLabel: string | null = null;
          if (itemParsed.value) {
            const { data: itemRow } = await supabase
              .from("maintenance_inspection_items")
              .select("safety_critical, label")
              .eq("id", itemParsed.value)
              .maybeSingle();
            itemSafetyCritical = (itemRow as { safety_critical?: boolean } | null)?.safety_critical === true;
            itemLabel = (itemRow as { label?: string } | null)?.label ?? null;
          }

          const declined = f.declined === true;
          let recommended_line_id: string | null = null;
          const woIdForLine = woParsed.value ?? sharedWoId;
          if ((status === "attention" || status === "fail") && !declined && woIdForLine) {
            lineSort += 1;
            const lineRow = mapApiLineToDb({
              componentName: f.componentName ?? f.component_name ?? f.label ?? itemLabel,
              notes: f.notes,
            }, lineSort, woIdForLine, actorId);
            const { data: insLine, error: lineInsErr } = await supabase
              .from("maintenance_work_order_lines")
              .insert(lineRow)
              .select("id")
              .single();
            if (lineInsErr) throw lineInsErr;
            recommended_line_id = insLine?.id != null ? String(insLine.id) : null;
          }

          const findingRow = {
            organization_id: orgId,
            vehicle_id: vehicleId,
            work_order_id: woIdForLine,
            item_id: itemParsed.value,
            status,
            notes: f.notes != null ? String(f.notes) : null,
            photo_url: photoUrl,
            recommended_line_id,
            declined,
            updated_at: new Date().toISOString(),
          };
          const { data: inserted, error: insErr } = await supabase
            .from("maintenance_inspection_findings")
            .insert(findingRow)
            .select()
            .single();
          if (insErr) throw insErr;

          const safetyFail = status === "fail"
            && (itemSafetyCritical || f.safetyCritical === true || f.safety_critical === true);
          if (safetyFail) {
            const reason = f.notes != null ? String(f.notes) : (itemLabel || "Inspection safety fail");
            await fleetDb()
              .from("vehicles")
              .update({
                do_not_drive: true,
                do_not_drive_reason: reason,
                do_not_drive_set_at: new Date().toISOString(),
              })
              .eq("id", vehicleId)
              .eq("organization_id", orgId);
            await insertMaintenanceEvent(supabase, {
              organizationId: orgId,
              vehicleId,
              type: "do_not_drive",
              payload: {
                driverId: rbacUser?.userId ?? null,
                reason,
                workOrderId: woIdForLine,
              },
            });
          }

          created.push({
            id: inserted.id,
            organizationId: inserted.organization_id,
            vehicleId: inserted.vehicle_id,
            workOrderId: inserted.work_order_id,
            itemId: inserted.item_id,
            status: inserted.status,
            notes: inserted.notes,
            photoUrl: inserted.photo_url,
            declined: inserted.declined === true,
            recommendedLineId: inserted.recommended_line_id,
          });
        }

        const inspectionOdo = body.odometer ?? body.odo;
        const inspectionDate = body.date ?? body.performedAtDate ?? todayIso();
        if (inspectionOdo != null && primaryVehicleId) {
          try {
            await projectFromMaintenanceLog(
              {
                id: crypto.randomUUID(),
                vehicleId: primaryVehicleId,
                odometer: Number(inspectionOdo),
                date: String(inspectionDate).slice(0, 10),
                serviceType: "Inspection (DVIR)",
                organizationId: orgId,
              },
              orgId,
            );
          } catch (odoErr) {
            console.warn("[maintenance-inspection-findings] odometer:", odoErr);
          }
        }

        return c.json({ items: created, workOrderId: sharedWoId ?? null });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );
}
