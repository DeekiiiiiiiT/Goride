/**
 * Maintenance schedule API (Postgres) — templates, per-vehicle schedule, records.
 * Registered from index.tsx with service-role Supabase client.
 */
import type { Context } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";
import { fromKvStore } from "./fleet_sql_bridge.ts";
import { requireAuth, requirePermission, requireAnyPermission, assertPlatformStaffResponse } from "./rbac_middleware.ts";
import { filterByOrg, getOrgId } from "./org_scope.ts";
import {
  analyzeComponentRowStatus,
  backfillServiceLedgerForOrg,
  bootstrapVehicleComponentSchedules,
  getPackageChecklist,
} from "./maintenance_service_ledger_core.ts";
import {
  canonicalOdometerForVehicle,
  canonicalOdometerFromMaps,
  loadOdometerSupplementMaps,
} from "./canonical_vehicle_odometer.ts";
import {
  analyzeMaintenanceScheduleRow,
  FLEET_SERVICES_ATTENTION_CAP,
  formatWorstDueSummary,
  pickWorstMaintenanceDueRow,
  sortFleetServiceAttention,
  type FleetServiceAttentionItem,
} from "../../../packages/finance-core/src/maintenanceOverdueDetails.ts";
import { resolveCatalogIdForKvVehicle } from "./vehicle_catalog_resolve.ts";
import { executeMaintenanceBootstrap } from "./maintenance_bootstrap_core.ts";
import { requireCatalogMatched } from "./vehicle_catalog_gate.ts";
import {
  appendCanonicalMaintenanceIfEligible,
} from "./canonical_from_ops.ts";
import { deleteCanonicalLedgerBySource } from "./ledger_canonical.ts";
import { isMaintenanceLedgerEligible } from "../../../packages/finance-core/src/canonicalMaintenanceLedger.ts";
import { projectFromMaintenanceLog, voidOdometerReading } from "./odometer_ledger.ts";
import { maintenanceRecordAcceptsClientHint, runCompletion } from "./maintenance_completion.ts";
import {
  assessOdometerAnomaly,
  checkMaintenanceOdometerReading,
  findWorkOrderByIdempotency,
  formatOdometerSourceLabel,
  insertMaintenanceAuditLog,
  insertMaintenanceEvent,
  loadFleetVehicleForOrg,
  loadFleetVehiclesForOrg,
  loadLatestMaintenanceJobRun,
  loadOrgDueSoonSettings,
  loadTrustedOdometerMap,
  odometerRequiredResponse,
  parseRequiredOdometer,
  recomputeScheduleForVehicle,
  reserveMaintenanceLogNumber,
  computeWoLineTotal,
  parseDiscount,
  lineSubtotal,
  serviceNetTotal,
  loadDiscountEnabled,
  respondDiscountRejection,
  discountTooLarge,
  discountTooLargeResponse,
  fetchMaintenanceServiceHistoryPage,
} from "./maintenance_logging_helpers.ts";
import {
  canTransitionWorkOrderStatus,
  isMaintenanceWoStatus,
  MAINTENANCE_WO_ACTIVE_STATUSES,
  workOrderTransitionSideEffects,
} from "./maintenance_work_order_lifecycle.ts";
import { registerMaintenanceAlertsKpiRoutes } from "./maintenance/routes_alerts_kpi.ts";
import { registerMaintenanceInspectionRoutes } from "./maintenance/routes_inspections.ts";
import { registerMaintenanceWorkOrderRoutes } from "./maintenance/routes_work_orders.ts";
import { fleetDb, fleetTable } from "./repos/baseRepo.ts";
import { registerMaintenanceMasterRoutes } from "./maintenance_master_routes.ts";
import { buildLogServiceContext } from "./maintenance_log_service_context.ts";
import { buildSystemSections } from "./maintenance_system_sections.ts";
import { assertCatalogWriteResponse, governWriteOrProposal } from "./catalog_access.ts";
import { FEATURE_FLAGS, isFeatureEnabled } from "./feature_flags.ts";
import {
  callSaveWorkOrder,
  isBoardOnlyBody,
  isContentEditBody,
  isMixedPatchBody,
  loadLineItemsForWorkOrders,
  loadSourcingByLineItemForWorkOrder,
  sourcingFieldsFromOutbox,
  loadWorkOrderLinesForRpc,
  mapApiLineToDb,
  prepareWorkOrderLines,
  buildClientPayloadLines,
  loadJobMetaForLines,
  mapDbLineToApi,
  inspectInspectionFindingsOffPayload,
  findingMarks,
  type FindingMarks,
} from "./service_items_save.ts";
import { mapJobItemRowToApi } from "./maintenance_jobs_admin_helpers.ts";
import {
  buildFoundStatusForLine,
  childWorkOrderClosesFoundLine,
  enrichSectionsRecordsFindings,
  mapFoundWorkCloseError,
  type DoneByFoundLine,
} from "./inspection_findings_helpers.ts";
import { displayNamesFor } from "./recon_desk_reads.ts";
import { verifiedCarForVehicle } from "./fleet_parts_access.ts";
import {
  isPlannedWorkOrder,
  mapFleetPlanJobError,
  plannedJobConflictResponse,
} from "./log_service_planned_guard.ts";
import {
  loadExistingLineParts,
  partFitsVerifiedCar,
  validateLinePartFitOnSave,
} from "./log_service_part_fit.ts";
import { positionCodesProblem } from "../../../packages/types/src/partPositions.ts";
import { loadJobPositionMeta } from "./job_position_meta.ts";

const assertVehicleCatalogPlatformAccess = assertPlatformStaffResponse;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function rbacUserId(c: Context): string | null {
  const id = (c.get("rbacUser") as { userId?: string } | undefined)?.userId;
  return id && isUuid(String(id)) ? String(id) : null;
}

async function partsGapsLinePartFitGuard(
  c: Context,
  supabase: SupabaseClient,
  orgId: string,
  vehicleId: string,
  workOrderId: string | null,
  rawLines: unknown[],
): Promise<Response | null> {
  if (!(await isFeatureEnabled(FEATURE_FLAGS.LOG_SERVICE_PARTS_GAPS, orgId))) return null;
  const existing = workOrderId ? await loadExistingLineParts(supabase, workOrderId) : undefined;
  const fit = await validateLinePartFitOnSave(c, supabase, orgId, vehicleId, rawLines, existing);
  if (!fit.ok) return c.json({ code: fit.code, error: fit.error }, fit.status);
  return null;
}

function plannedWorkOrderGuardResponse(
  c: Context,
  wo: Record<string, unknown> | null | undefined,
): Response | null {
  if (!isPlannedWorkOrder(wo)) return null;
  const { status, body } = plannedJobConflictResponse();
  return c.json(body, status);
}

function aggregateFleetStatus(
  rows: Array<{ status: "ok" | "pending" | "overdue" | "fulfilled" }>,
): "Healthy" | "Due Soon" | "Overdue" {
  const relevant = rows.filter((r) => r.status !== "fulfilled");
  if (relevant.some((r) => r.status === "overdue")) return "Overdue";
  if (relevant.some((r) => r.status === "pending")) return "Due Soon";
  return "Healthy";
}

function aggregateFleetStatusFromDue(
  dueStatuses: string[],
): "Healthy" | "Due Soon" | "Overdue" | "Odometer needed" | "No schedule" {
  if (!dueStatuses.length) return "No schedule";
  if (dueStatuses.includes("overdue")) return "Overdue";
  if (dueStatuses.includes("odometer_needed")) return "Odometer needed";
  if (dueStatuses.includes("due_soon")) return "Due Soon";
  if (dueStatuses.every((s) => s === "no_record" || s === "ok")) return "Healthy";
  return "Healthy";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(s: string): boolean {
  return UUID_RE.test(s.trim());
}

async function enrichApiLinesWithFound(
  supabase: SupabaseClient,
  orgId: string,
  currentWorkOrderId: string,
  apiLines: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  const foundLineIds = apiLines
    .filter((l) => l.recommended === true && l.id != null)
    .map((l) => String(l.id));
  if (!foundLineIds.length) return apiLines;

  const { data: childRows, error: childErr } = await supabase
    .from("maintenance_work_order_lines")
    .select("id, from_found_line_id, work_order_id")
    .in("from_found_line_id", foundLineIds)
    .is("voided_at", null);
  if (childErr) throw childErr;

  const childList = (childRows || []) as Record<string, unknown>[];
  const woIds = [...new Set(childList.map((r) => String(r.work_order_id ?? "")).filter((id) => isUuid(id)))];
  const woById = new Map<string, Record<string, unknown>>();
  if (woIds.length) {
    const { data: wos, error: woErr } = await supabase
      .from("maintenance_work_orders")
      .select("id, performed_at_date, voided_at, organization_id, status")
      .in("id", woIds)
      .eq("organization_id", orgId)
      .is("voided_at", null);
    if (woErr) throw woErr;
    for (const wo of wos || []) {
      woById.set(String((wo as { id: string }).id), wo as Record<string, unknown>);
    }
  }

  const doneByFoundId = new Map<string, DoneByFoundLine>();
  for (const row of childList) {
    const fromId = row.from_found_line_id != null ? String(row.from_found_line_id) : "";
    const woId = row.work_order_id != null ? String(row.work_order_id) : "";
    if (!fromId || !woId || !woById.has(woId)) continue;
    if (doneByFoundId.has(fromId)) continue;
    const wo = woById.get(woId)!;
    if (!childWorkOrderClosesFoundLine(wo)) continue;
    const performed = wo.performed_at_date != null ? String(wo.performed_at_date).slice(0, 10) : null;
    doneByFoundId.set(fromId, {
      workOrderId: woId,
      performedAtDate: performed,
      sameWorkOrder: woId === currentWorkOrderId,
    });
  }

  const closedByIds: string[] = [];
  for (const line of apiLines) {
    if (line.recommended !== true) continue;
    const cb = line.closedBy;
    if (cb != null && isUuid(String(cb))) closedByIds.push(String(cb));
  }
  const closedByNames = await displayNamesFor(closedByIds);

  return apiLines.map((line) => {
    if (line.recommended !== true || line.id == null) return line;
    const lineId = String(line.id);
    const found = buildFoundStatusForLine({
      lineId,
      currentWorkOrderId,
      closedReason: line.closedReason != null ? String(line.closedReason) : null,
      closedAt: line.closedAt != null ? String(line.closedAt) : null,
      closedBy: line.closedBy != null ? String(line.closedBy) : null,
      doneByFoundId,
      closedByNames,
    });
    return { ...line, found };
  });
}

async function inspectionFindingsOffResponse(
  c: Context,
  orgId: string,
  rawLines: unknown[],
  inspectionFindingsEnabled?: boolean,
  editWorkOrderId?: string | null,
  db?: SupabaseClient,
): Promise<Response | null> {
  if (!rawLines.length) return null;
  const enabled = inspectionFindingsEnabled !== undefined
    ? inspectionFindingsEnabled
    : await isFeatureEnabled(FEATURE_FLAGS.INSPECTION_FINDINGS, orgId);
  if (enabled) return null;
  if (!inspectInspectionFindingsOffPayload(rawLines)) return null;
  // An edit may send back marks its lines already have; only a new finding is refused (code review #4).
  if (db && editWorkOrderId && isUuid(editWorkOrderId)) {
    const { data: storedRows, error: storedErr } = await db
      .from("maintenance_work_order_lines")
      .select("id, from_found_line_id, values_json")
      .eq("work_order_id", editWorkOrderId);
    if (storedErr) throw storedErr;
    const storedById = new Map<string, FindingMarks>();
    for (const row of (storedRows || []) as Record<string, unknown>[]) {
      storedById.set(String(row.id), findingMarks(row));
    }
    if (!inspectInspectionFindingsOffPayload(rawLines, storedById)) return null;
  }
  return c.json(
    { code: "inspection_findings_off", error: "Inspection findings are not enabled for this fleet." },
    400,
  );
}

type JobFitAnswer = "yes" | "no" | "unknown";

type JobFitContext =
  | { mode: "off" }
  | { mode: "error"; jobFit: { status: "error" } }
  | {
    mode: "on";
    fitMap: Map<string, JobFitAnswer>;
    jobFit: { status: "known" | "unknown"; powertrain: string | null; fuel: string | null };
  };

async function loadJobFitContext(
  c: Context,
  supabase: SupabaseClient,
  orgId: string,
): Promise<JobFitContext | Response> {
  const vehicleId = c.req.query("vehicleId")?.trim() || c.req.query("vehicle_id")?.trim() || "";
  if (!vehicleId) return { mode: "off" };
  const enabled = orgId ? await isFeatureEnabled(FEATURE_FLAGS.JOB_FIT_FILTER, orgId) : false;
  if (!enabled) return { mode: "off" };

  const { data: vehicle, error: vehErr } = await fleetDb()
    .from(fleetTable("vehicles"))
    .select("id, vehicle_catalog_id")
    .eq("organization_id", orgId)
    .eq("id", vehicleId)
    .maybeSingle();
  // A failed lookup must not break Log service: show every job with the "Couldn't check" note (PT-7).
  if (vehErr) return { mode: "error", jobFit: { status: "error" } };
  if (!vehicle) return c.json({ error: "Car not found." }, 404) as Response;

  const rawCatalog = String((vehicle as { vehicle_catalog_id?: string }).vehicle_catalog_id ?? "").trim();
  const catalogId = isUuid(rawCatalog) ? rawCatalog : null;

  const { data: fitRows, error: fitErr } = await supabase.rpc("job_fits_car", {
    p_vehicle_catalog_id: catalogId,
    p_job_ids: null,
  });
  if (fitErr) {
    return { mode: "error", jobFit: { status: "error" } };
  }
  const fitMap = new Map<string, JobFitAnswer>();
  for (const row of fitRows || []) {
    const id = String((row as { job_id: string }).job_id);
    const fits = String((row as { fits: string }).fits) as JobFitAnswer;
    fitMap.set(id, fits);
  }

  let jobFit: { status: "known" | "unknown"; powertrain: string | null; fuel: string | null };
  if (!catalogId) {
    jobFit = { status: "unknown", powertrain: null, fuel: null };
  } else {
    const { data: model, error: modErr } = await supabase
      .from("vehicle_catalog")
      .select("powertrain, fuel, powertrain_status")
      .eq("id", catalogId)
      .maybeSingle();
    if (modErr || !model) {
      jobFit = { status: "unknown", powertrain: null, fuel: null };
    } else {
      const st = String((model as { powertrain_status?: string }).powertrain_status ?? "");
      const pt = (model as { powertrain?: string | null }).powertrain ?? null;
      const fu = (model as { fuel?: string | null }).fuel ?? null;
      jobFit = st === "needs_check" || pt == null || fu == null
        ? { status: "unknown", powertrain: pt, fuel: fu }
        : { status: "known", powertrain: pt, fuel: fu };
    }
  }

  return { mode: "on", fitMap, jobFit };
}

export function groupFitCounts(
  fitMap: Map<string, JobFitAnswer>,
  childJobIds: string[],
): { fitJobCount: number; hiddenJobCount: number } {
  let fitJobCount = 0;
  let hiddenJobCount = 0;
  for (const id of childJobIds) {
    const f = fitMap.get(id) ?? "unknown";
    if (f === "no") hiddenJobCount += 1;
    else fitJobCount += 1;
  }
  return { fitJobCount, hiddenJobCount };
}

function enrichCategoryListWithFit(
  items: Record<string, unknown>[],
  ctx: Extract<JobFitContext, { mode: "on" }>,
): Record<string, unknown>[] {
  const childrenBySystem = new Map<string, string[]>();
  for (const row of items) {
    if (String(row.kind ?? "") !== "component") continue;
    if (String(row.status ?? "active") === "retired") continue;
    const parent = String(row.parent_id ?? "");
    if (!parent) continue;
    const list = childrenBySystem.get(parent) || [];
    list.push(String(row.id));
    childrenBySystem.set(parent, list);
  }
  return items.map((row) => {
    const kind = String(row.kind ?? "");
    if (kind === "component") {
      return { ...row, fits: ctx.fitMap.get(String(row.id)) ?? "unknown" };
    }
    if (kind === "system") {
      const counts = groupFitCounts(ctx.fitMap, childrenBySystem.get(String(row.id)) || []);
      return { ...row, fitJobCount: counts.fitJobCount, hiddenJobCount: counts.hiddenJobCount };
    }
    return row;
  });
}

function enrichSectionsWithFit(
  payload: ReturnType<typeof buildSystemSections>,
  fitMap: Map<string, JobFitAnswer>,
): ReturnType<typeof buildSystemSections> & { jobFit?: unknown } {
  const withJob = (job: Record<string, unknown>) => {
    const id = String(job.id ?? "");
    const recommendedWith = Array.isArray(job.recommendedWith)
      ? (job.recommendedWith as Record<string, unknown>[]).map((r) => ({
        ...r,
        fits: fitMap.get(String(r.categoryId ?? "")) ?? "unknown",
      }))
      : job.recommendedWith;
    return { ...job, fits: fitMap.get(id) ?? "unknown", recommendedWith };
  };
  return {
    groups: payload.groups.map((g) => ({
      ...g,
      sections: g.sections.map((s) => ({
        ...s,
        jobs: s.jobs.map((j) => withJob(j as Record<string, unknown>) as typeof j),
      })),
    })),
    otherJobs: payload.otherJobs.map((j) => withJob(j as Record<string, unknown>) as typeof j),
  };
}

function parseTaskCode(body: Record<string, unknown>): string | null {
  if (body.task_code === undefined || body.task_code === null) return null;
  const s = String(body.task_code).trim();
  return s.length ? s.slice(0, 120) : null;
}

function parseOptionalNumberField(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Returns error message or null if OK. */
function assertIntervalKmRange(km: number | null, kmMax: number | null): string | null {
  if (kmMax == null) return null;
  if (km == null) return "interval_km is required when interval_km_max is set";
  if (kmMax < km) return "interval_km_max must be greater than or equal to interval_km";
  return null;
}

function parseFieldSchema(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.fields)) return o;
  }
  return {
    fields: [
      { key: "material", type: "number", label: "Parts / materials", required: false },
      { key: "labor", type: "number", label: "Labor", required: false },
    ],
  };
}

function parseCategoryKind(v: unknown): "system" | "component" | null {
  if (v === undefined || v === null || v === "") return null;
  const s = String(v).trim();
  if (s === "system" || s === "component") return s;
  return null;
}

function parseOptionalUuidField(v: unknown): { ok: true; value: string | null } | { ok: false } {
  if (v === undefined || v === null || v === "") return { ok: true, value: null };
  const s = String(v).trim();
  if (!isUuid(s)) return { ok: false };
  return { ok: true, value: s };
}

/** Returns error message or null if OK. */
function assertCategoryKindParent(
  kind: "system" | "component",
  parentId: string | null,
): string | null {
  if (kind === "component" && !parentId) return "parent_id is required when kind is component";
  if (kind === "system" && parentId != null) return "parent_id must be null when kind is system";
  return null;
}

function parseDueKind(v: unknown): "service_package" | "statutory_inspection" | null {
  if (v === undefined || v === null || v === "") return null;
  const s = String(v).trim();
  if (s === "service_package" || s === "statutory_inspection") return s;
  return null;
}

/**
 * Full path of the work-orders collection for an internal app.request, including the
 * function prefix (e.g. "/fleet-ops"). fleet-ops is built with basePath("/fleet-ops"), so a
 * bare "/maintenance-work-orders/…" internal request is a route miss (404) and leaves the
 * new work order stuck "in_progress".
 */
export function workOrdersBasePath(requestPath: string): string {
  const marker = "/maintenance-work-orders";
  const i = requestPath.indexOf(marker);
  return i >= 0 ? requestPath.slice(0, i + marker.length) : marker;
}

function legacyMaintenanceLogPayloadExtra(log: Record<string, unknown>): Record<string, unknown> {
  const out = { ...log };
  for (const k of ["lines", "cost", "status", "id", "vehicleId", "vehicle_id"]) {
    delete out[k];
  }
  return out;
}

async function legacyCompleteRecordId(
  sb: SupabaseClient,
  clientId: string,
  workOrderId: string,
  orgId: string,
  vehicleId: string,
): Promise<string> {
  if (!isUuid(clientId)) return crypto.randomUUID();
  const { data: existing, error } = await sb
    .from("maintenance_records")
    .select("id, organization_id, vehicle_id, work_order_id")
    .eq("id", clientId)
    .maybeSingle();
  if (error) throw error;
  if (!existing) return clientId;
  if (maintenanceRecordAcceptsClientHint(existing as Record<string, unknown>, {
    orgId,
    vehicleId,
    workOrderId,
  })) {
    return clientId;
  }
  return crypto.randomUUID();
}

function internalWorkOrderCompleteRequest(
  app: unknown,
  c: Context,
  workOrderId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const honoApp = app as {
    request: (path: string, init?: RequestInit, env?: unknown) => Promise<Response>;
  };
  return honoApp.request(
    `${workOrdersBasePath(c.req.path)}/${workOrderId}/complete`,
    {
      method: "POST",
      headers: c.req.raw.headers,
      body: JSON.stringify(body),
    },
    c.env,
  );
}

async function enrichLinesWithItems(
  supabase: SupabaseClient,
  workOrderId: string,
  lines: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  const itemsByLine = await loadLineItemsForWorkOrders(supabase, [workOrderId]);
  const sourcingByItem = await loadSourcingByLineItemForWorkOrder(supabase, workOrderId);
  for (const [lineId, items] of itemsByLine) {
    itemsByLine.set(
      lineId,
      items.map((item) => ({
        ...item,
        ...sourcingFieldsFromOutbox(sourcingByItem.get(String(item.id))),
      })),
    );
  }
  // One lookup for each line's job: high voltage and its position kind (code review #9).
  const jobMeta = await loadJobMetaForLines(supabase, lines.map((l) => l.component_id));
  return lines.map((line) => {
    const meta = jobMeta.get(String(line.component_id ?? ""));
    const merged = meta ? { ...line, ...meta } : line;
    return {
      ...mapDbLineToApi(merged),
      items: itemsByLine.get(String(line.id)) ?? [],
    };
  });
}

function workOrderNotFinished(wo: Record<string, unknown>): boolean {
  if (String(wo.status) !== "in_progress") return false;
  const updatedAt = wo.updated_at != null ? new Date(String(wo.updated_at)).getTime() : 0;
  return updatedAt > 0 && Date.now() - updatedAt > 120_000;
}

async function mapSavedRpcToApiItem(
  supabase: SupabaseClient,
  saved: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const wo = (saved.work_order ?? {}) as Record<string, unknown>;
  const lineRows = (Array.isArray(saved.lines) ? saved.lines : []) as Record<string, unknown>[];
  const lines = await enrichLinesWithItems(supabase, String(wo.id), lineRows);
  return mapDbWorkOrderToApi(wo, lines);
}

function buildSnakeWorkOrderPayload(
  body: Record<string, unknown>,
  opts: { includeKeys?: Set<string> } = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const allow = opts.includeKeys;
  const put = (key: string, val: unknown) => {
    if (allow && !allow.has(key)) return;
    if (val !== undefined) out[key] = val;
  };
  put("vehicle_id", body.vehicleId ?? body.vehicle_id);
  put("log_mode", (() => {
    const lm = String(body.logMode ?? body.log_mode ?? "").trim();
    if (!lm) return undefined;
    return lm === "package" ? "package" : "quick_job";
  })());
  put("idempotency_key", body.idempotencyKey ?? body.idempotency_key);
  put("log_number", body.logNumber ?? body.log_number);
  if (body.performedAtDate !== undefined || body.performed_at_date !== undefined) {
    const v = body.performedAtDate ?? body.performed_at_date;
    put("performed_at_date", v == null || v === "" ? null : String(v).slice(0, 10));
  }
  if (body.odometer !== undefined) {
    put("odometer", body.odometer == null || body.odometer === "" ? null : Number(body.odometer));
  }
  if (body.provider !== undefined) put("provider", body.provider == null ? null : String(body.provider));
  if (body.currency !== undefined) {
    const cur = String(body.currency).trim().toUpperCase();
    put("currency", cur || "JMD");
  }
  if (body.templateId !== undefined || body.template_id !== undefined) {
    const tp = parseOptionalUuidField(body.templateId ?? body.template_id);
    if (tp.ok) put("template_id", tp.value);
  }
  if (body.packageComplete !== undefined || body.package_complete !== undefined) {
    put("package_complete", body.packageComplete === true || body.package_complete === true);
  }
  if (body.notes !== undefined) put("notes", body.notes == null ? null : String(body.notes));
  if (body.invoiceUrl !== undefined || body.invoice_url !== undefined) {
    const u = body.invoiceUrl ?? body.invoice_url;
    put("invoice_url", u == null || u === "" ? null : String(u));
  }
  if (body.discount !== undefined || body.discount_amount !== undefined) {
    const d = parseDiscount(body.discount ?? body.discount_amount);
    put("discount_amount", d ?? 0);
  }
  return out;
}

function isIdempotencyUniqueViolation(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("duplicate key") || msg.includes("unique constraint")
    || msg.includes("idempotency");
}

async function attachFleetJobItemsToSections(
  supabase: SupabaseClient,
  payload: ReturnType<typeof buildSystemSections>,
): Promise<ReturnType<typeof buildSystemSections>> {
  const jobIds = new Set<string>();
  for (const g of payload.groups) {
    for (const s of g.sections) {
      for (const j of s.jobs) jobIds.add(String(j.id));
    }
  }
  for (const j of payload.otherJobs) jobIds.add(String(j.id));
  if (!jobIds.size) return payload;

  const [itemsRes, suppliesRes, unitsRes] = await Promise.all([
    supabase
      .from("maintenance_job_item")
      .select("*")
      .in("job_id", [...jobIds])
      .is("removed_at", null)
      .order("sort_order")
      .order("created_at"),
    supabase.from("maintenance_supply").select("id, name, status, unit_id"),
    supabase.from("maintenance_unit").select("id, label_one, label_many"),
  ]);
  if (itemsRes.error) throw itemsRes.error;
  if (suppliesRes.error) throw suppliesRes.error;
  if (unitsRes.error) throw unitsRes.error;

  const partTypeIds = new Set<string>();
  for (const row of itemsRes.data || []) {
    const pt = (row as { part_type_id?: string }).part_type_id;
    if (pt) partTypeIds.add(String(pt));
  }
  const categoriesById = new Map<string, Record<string, unknown>>();
  if (partTypeIds.size > 0) {
    const { data, error } = await supabase
      .from("maintenance_service_categories")
      .select("id, name, status, default_fit_mode")
      .in("id", [...partTypeIds]);
    if (error) throw error;
    for (const row of data || []) {
      categoriesById.set(String((row as { id: string }).id), row as Record<string, unknown>);
    }
  }

  const suppliesById = new Map(
    (suppliesRes.data || []).map((s) => [String((s as { id: string }).id), s as Record<string, unknown>]),
  );
  const unitsById = new Map(
    (unitsRes.data || []).map((u) => [String((u as { id: string }).id), u as Record<string, unknown>]),
  );

  const itemsByJob = new Map<string, Record<string, unknown>[]>();
  for (const link of itemsRes.data || []) {
    const lr = link as Record<string, unknown>;
    const jobId = String(lr.job_id);
    if (lr.part_type_id != null) {
      const cat = categoriesById.get(String(lr.part_type_id));
      if (!cat || String(cat.status) !== "active") continue;
      const mapped = mapJobItemRowToApi(lr, String(cat.name), false);
      const item = {
        linkId: mapped.linkId,
        kind: mapped.kind,
        itemId: mapped.itemId,
        name: mapped.name,
        need: mapped.need,
        qtyHint: mapped.qtyHint,
        note: mapped.note,
        sortOrder: mapped.sortOrder,
        unitLabelOne: "piece",
        unitLabelMany: "pieces",
        defaultFitMode: cat.default_fit_mode != null ? String(cat.default_fit_mode) : null,
      };
      const list = itemsByJob.get(jobId) || [];
      list.push(item);
      itemsByJob.set(jobId, list);
      continue;
    }
    const sup = suppliesById.get(String(lr.supply_id));
    if (!sup || String(sup.status) !== "active") continue;
    const unit = unitsById.get(String(sup.unit_id));
    const mapped = mapJobItemRowToApi(
      lr,
      String(sup.name),
      false,
      unit ? { label_one: String(unit.label_one), label_many: String(unit.label_many) } : undefined,
    );
    const item = {
      linkId: mapped.linkId,
      kind: mapped.kind,
      itemId: mapped.itemId,
      name: mapped.name,
      need: mapped.need,
      qtyHint: mapped.qtyHint,
      note: mapped.note,
      sortOrder: mapped.sortOrder,
      unitLabelOne: mapped.unitLabelOne ?? "piece",
      unitLabelMany: mapped.unitLabelMany ?? "pieces",
      defaultFitMode: null,
    };
    const list = itemsByJob.get(jobId) || [];
    list.push(item);
    itemsByJob.set(jobId, list);
  }

  const withItems = (job: Record<string, unknown>) => ({
    ...job,
    items: itemsByJob.get(String(job.id)) ?? [],
  });

  return {
    groups: payload.groups.map((g) => ({
      ...g,
      sections: g.sections.map((s) => ({
        ...s,
        jobs: s.jobs.map((j) => withItems(j as Record<string, unknown>) as typeof j),
      })),
    })),
    otherJobs: payload.otherJobs.map((j) => withItems(j as Record<string, unknown>) as typeof j),
  };
}

function mapDbWorkOrderToApi(
  wo: Record<string, unknown>,
  lines?: Record<string, unknown>[],
): Record<string, unknown> {
  // Callers pass either database rows or lines already mapped by enrichLinesWithItems (with items).
  // Mapping a mapped line again wipes its name, amounts and items, so only database rows are mapped.
  const isDbRow = (l: Record<string, unknown>) => "work_order_id" in l;
  const apiLines = lines?.map((l) => (isDbRow(l) ? mapDbLineToApi(l) : l));
  const subtotal = !lines
    ? null
    : lines.every(isDbRow)
    // CR-04: deleted (voided) jobs are not part of the bill.
    ? lineSubtotal(lines.filter((l) => l.voided_at == null))
    : Math.round(
      (apiLines ?? [])
        .filter((l) => l.voidedAt == null)
        .reduce((s, l) => s + (Number(l.lineTotal) || 0), 0) * 100,
    ) / 100;
  return {
    id: wo.id,
    organizationId: wo.organization_id,
    vehicleId: wo.vehicle_id,
    status: wo.status,
    openedAt: wo.opened_at,
    closedAt: wo.closed_at,
    performedAtDate: wo.performed_at_date,
    odometer: wo.odometer,
    provider: wo.provider,
    currency: wo.currency,
    templateId: wo.template_id,
    packageComplete: wo.package_complete === true,
    logMode: wo.log_mode,
    notes: wo.notes,
    invoiceUrl: wo.invoice_url,
    totalCost: wo.total_cost != null ? Number(wo.total_cost) : null,
    discountAmount: Number(wo.discount_amount ?? 0),
    subtotal,
    maintenanceRecordId: wo.maintenance_record_id,
    priority: wo.priority,
    vendorId: wo.vendor_id,
    offRoadAt: wo.off_road_at,
    backOnRoadAt: wo.back_on_road_at,
    approvedBy: wo.approved_by,
    approvedAt: wo.approved_at,
    source: wo.source,
    cancelReason: wo.cancel_reason,
    logNumber: wo.log_number,
    lines: apiLines,
    version: wo.version != null ? Number(wo.version) : 1,
    notFinished: workOrderNotFinished(wo),
    createdAt: wo.created_at,
    updatedAt: wo.updated_at,
  };
}

async function loadCategoriesForTemplateIds(
  sb: SupabaseClient,
  templateIds: string[],
): Promise<Map<string, Array<Record<string, unknown>>>> {
  const map = new Map<string, Array<Record<string, unknown>>>();
  if (!templateIds.length) return map;
  // Components only for package membership; include parent system when joinable
  const { data, error } = await sb
    .from("maintenance_package_categories")
    .select(
      "template_id, sort_order, required, category:maintenance_service_categories(*, parent:maintenance_service_categories!parent_id(*))",
    )
    .in("template_id", templateIds)
    .order("sort_order", { ascending: true });
  if (error) {
    // Fallback without parent join (older PostgREST / missing FK name)
    const { data: fallback, error: fbErr } = await sb
      .from("maintenance_package_categories")
      .select("template_id, sort_order, required, category:maintenance_service_categories(*)")
      .in("template_id", templateIds)
      .order("sort_order", { ascending: true });
    if (fbErr) throw fbErr;
    for (const row of fallback || []) {
      const tid = String((row as { template_id: string }).template_id);
      const cat = (row as { category?: Record<string, unknown> | null }).category;
      if (!cat) continue;
      const kind = cat.kind != null ? String(cat.kind) : "component";
      if (kind !== "component") continue;
      const list = map.get(tid) || [];
      list.push(cat);
      map.set(tid, list);
    }
    return map;
  }
  for (const row of data || []) {
    const tid = String((row as { template_id: string }).template_id);
    const cat = (row as { category?: Record<string, unknown> | null }).category;
    if (!cat) continue;
    const kind = cat.kind != null ? String(cat.kind) : "component";
    if (kind !== "component") continue;
    const list = map.get(tid) || [];
    list.push(cat);
    map.set(tid, list);
  }
  return map;
}

async function syncTemplateDescriptionFromCategories(
  sb: SupabaseClient,
  templateId: string,
): Promise<void> {
  const { data } = await sb
    .from("maintenance_package_categories")
    .select("sort_order, category:maintenance_service_categories(name)")
    .eq("template_id", templateId)
    .order("sort_order", { ascending: true });
  const names = (data || [])
    .map((r) => {
      const c = (r as { category?: { name?: string } | null }).category;
      return c?.name?.trim() || "";
    })
    .filter(Boolean);
  await sb
    .from("maintenance_task_templates")
    .update({ description: names.length ? names.join("\n") : null, updated_at: new Date().toISOString() })
    .eq("id", templateId);
}

export function registerMaintenanceRoutes(app: { get: unknown; post: unknown; put: unknown; patch: unknown; delete: unknown; request?: (path: string, init?: RequestInit, env?: unknown) => Promise<Response> }, supabase: SupabaseClient) {
  const route = app as {
    get: (path: string, ...handlers: unknown[]) => void;
    post: (path: string, ...handlers: unknown[]) => void;
    put: (path: string, ...handlers: unknown[]) => void;
    patch: (path: string, ...handlers: unknown[]) => void;
    delete: (path: string, ...handlers: unknown[]) => void;
  };
  // -------------------------------------------------------------------------
  // Super Admin — templates CRUD
  // -------------------------------------------------------------------------
  route.get(
    "/admin/vehicle-catalog/:catalogId/maintenance-templates",
    requireAuth(),
    async (c) => {
      const denied = assertVehicleCatalogPlatformAccess(c);
      if (denied) return denied;
      const catalogId = c.req.param("catalogId")?.trim() ?? "";
      if (!isUuid(catalogId)) {
        return c.json({ error: "Invalid catalog id" }, 400);
      }
      try {
        const { data, error } = await supabase
          .from("maintenance_task_templates")
          .select("*")
          .eq("vehicle_catalog_id", catalogId)
          .in("template_scope", ["variant", "catalog"])
          .is("component_id", null)
          .order("sort_order", { ascending: true })
          .order("task_name", { ascending: true });
        if (error) throw error;
        return c.json({ items: data || [] });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[maintenance-templates] GET:", msg);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.post(
    "/admin/vehicle-catalog/:catalogId/maintenance-templates",
    requireAuth(),
    async (c) => {
      const denied = assertCatalogWriteResponse(c);
      if (denied) return denied;
      const catalogId = c.req.param("catalogId")?.trim() ?? "";
      if (!isUuid(catalogId)) {
        return c.json({ error: "Invalid catalog id" }, 400);
      }
      try {
        const body = (await c.req.json()) as Record<string, unknown>;
        const task_name = String(body.task_name ?? "").trim();
        if (!task_name) return c.json({ error: "task_name is required" }, 400);
        const fkRaw = String(body.frequency_kind ?? "recurring").trim();
        const frequency_kind = ["recurring", "once_milestone", "manual_only"].includes(fkRaw)
          ? fkRaw
          : "recurring";
        const fl = body.frequency_label != null ? String(body.frequency_label).trim() : "";
        const frequency_label = fl.length ? fl.slice(0, 120) : null;
        const interval_km = body.interval_km != null && body.interval_km !== ""
          ? Number(body.interval_km)
          : null;
        let interval_km_max = parseOptionalNumberField(body.interval_km_max);
        if (interval_km != null && interval_km_max != null && interval_km_max === interval_km) {
          interval_km_max = null;
        }
        const rangeErr = assertIntervalKmRange(interval_km, interval_km_max);
        if (rangeErr) return c.json({ error: rangeErr }, 400);
        const iconKeyRaw = body.icon_key != null ? String(body.icon_key).trim() : "wrench";
        const icon_key = (iconKeyRaw || "wrench").slice(0, 40);
        const dueKindParsed = parseDueKind(body.due_kind);
        if (body.due_kind !== undefined && body.due_kind !== null && body.due_kind !== "" && !dueKindParsed) {
          return c.json({ error: "due_kind must be service_package or statutory_inspection" }, 400);
        }
        const row = {
          template_scope: "variant",
          vehicle_catalog_id: catalogId,
          component_id: typeof body.component_id === "string" && body.component_id ? body.component_id : null,
          task_name,
          task_code: parseTaskCode(body),
          description: body.description != null ? String(body.description) : null,
          interval_km,
          interval_km_max,
          interval_months: body.interval_months != null && body.interval_months !== ""
            ? Number(body.interval_months)
            : null,
          frequency_kind,
          frequency_label,
          due_kind: dueKindParsed ?? "service_package",
          priority: String(body.priority ?? "standard"),
          sort_order: body.sort_order != null ? Number(body.sort_order) : 0,
          icon_key,
          updated_at: new Date().toISOString(),
        };
        const { data, error } = await supabase.from("maintenance_task_templates").insert(row).select().single();
        if (error) throw error;
        return c.json({ item: data });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.patch(
    "/admin/maintenance-templates/:id",
    requireAuth(),
    async (c) => {
      const denied = assertCatalogWriteResponse(c);
      if (denied) return denied;
      const id = c.req.param("id");
      try {
        const body = (await c.req.json()) as Record<string, unknown>;
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (body.task_name !== undefined) patch.task_name = String(body.task_name).trim();
        if (body.task_code !== undefined) patch.task_code = parseTaskCode(body);
        if (body.description !== undefined) patch.description = body.description;
        if (body.interval_km !== undefined) {
          patch.interval_km = body.interval_km === "" || body.interval_km == null
            ? null
            : Number(body.interval_km);
        }
        if (body.interval_km_max !== undefined) {
          patch.interval_km_max = body.interval_km_max === "" || body.interval_km_max == null
            ? null
            : Number(body.interval_km_max);
        }
        if (body.interval_months !== undefined) {
          patch.interval_months = body.interval_months === "" || body.interval_months == null
            ? null
            : Number(body.interval_months);
        }
        if (body.priority !== undefined) patch.priority = String(body.priority);
        if (body.sort_order !== undefined) patch.sort_order = Number(body.sort_order);
        if (body.frequency_kind !== undefined) {
          const fk = String(body.frequency_kind).trim();
          patch.frequency_kind = ["recurring", "once_milestone", "manual_only"].includes(fk) ? fk : "recurring";
        }
        if (body.frequency_label !== undefined) {
          const fl = body.frequency_label != null ? String(body.frequency_label).trim() : "";
          patch.frequency_label = fl.length ? fl.slice(0, 120) : null;
        }
        if (body.icon_key !== undefined) {
          const iconKeyRaw = body.icon_key != null ? String(body.icon_key).trim() : "wrench";
          patch.icon_key = (iconKeyRaw || "wrench").slice(0, 40);
        }
        if (body.due_kind !== undefined) {
          const dk = parseDueKind(body.due_kind);
          if (!dk) return c.json({ error: "due_kind must be service_package or statutory_inspection" }, 400);
          patch.due_kind = dk;
        }

        const { data: existingRow } = await supabase
          .from("maintenance_task_templates")
          .select("interval_km, interval_km_max")
          .eq("id", id)
          .maybeSingle();
        if (!existingRow) return c.json({ error: "Not found" }, 404);

        const mergedMiles = patch.interval_km !== undefined
          ? (patch.interval_km as number | null)
          : (existingRow.interval_km != null ? Number(existingRow.interval_km) : null);
        let mergedMax = patch.interval_km_max !== undefined
          ? (patch.interval_km_max as number | null)
          : (existingRow.interval_km_max != null ? Number(existingRow.interval_km_max) : null);
        if (mergedMiles != null && mergedMax != null && mergedMax === mergedMiles) {
          mergedMax = null;
          patch.interval_km_max = null;
        }
        const patchRangeErr = assertIntervalKmRange(mergedMiles, mergedMax);
        if (patchRangeErr) return c.json({ error: patchRangeErr }, 400);

        const { data, error } = await supabase
          .from("maintenance_task_templates")
          .update(patch)
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;
        if (!data) return c.json({ error: "Not found" }, 404);
        return c.json({ item: data });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.delete(
    "/admin/maintenance-templates/:id",
    requireAuth(),
    async (c) => {
      const denied = assertCatalogWriteResponse(c);
      if (denied) return denied;
      const id = c.req.param("id");
      try {
        const { count, error: countErr } = await supabase
          .from("vehicle_maintenance_schedule")
          .select("id", { count: "exact", head: true })
          .eq("template_id", id);
        if (countErr) throw countErr;
        const usageCount = count ?? 0;

        const { data, error } = await supabase
          .from("maintenance_task_templates")
          .update({ archived_at: new Date().toISOString() })
          .eq("id", id)
          .is("archived_at", null)
          .select("id, archived_at")
          .maybeSingle();
        if (error) throw error;
        if (!data) return c.json({ error: "Not found or already archived" }, 404);
        return c.json({
          success: true,
          archived: true,
          usageCount,
          message:
            usageCount > 0
              ? `Archived. ${usageCount} vehicle schedule row(s) still reference this template.`
              : "Archived.",
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.get(
    "/admin/maintenance-templates/global",
    requireAuth(),
    async (c) => {
      const denied = assertVehicleCatalogPlatformAccess(c);
      if (denied) return denied;
      try {
        const { data, error } = await supabase
          .from("maintenance_task_templates")
          .select("*")
          .eq("template_scope", "global")
          .is("archived_at", null)
          .is("component_id", null)
          .order("sort_order", { ascending: true })
          .order("task_name", { ascending: true });
        if (error) throw error;
        return c.json({ items: data || [] });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[maintenance-templates-global] GET:", msg);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.get("/admin/maintenance-templates/scoped", requireAuth(), async (c) => {
    const denied = assertVehicleCatalogPlatformAccess(c);
    if (denied) return denied;
    try {
      const scope = String(c.req.query("scope") ?? "");
      const targetId = String(c.req.query("targetId") ?? "");
      if (!["platform", "engine_family", "variant"].includes(scope)) return c.json({ error: "Invalid scope" }, 400);
      let q = supabase
        .from("maintenance_task_templates")
        .select("*")
        .eq("template_scope", scope)
        .is("archived_at", null)
        .is("component_id", null);
      if (scope === "platform") q = q.eq("platform_id", targetId);
      if (scope === "engine_family") q = q.eq("engine_family_id", targetId);
      if (scope === "variant") q = q.eq("vehicle_catalog_id", targetId);
      const { data, error } = await q.order("task_name");
      if (error) throw error;
      return c.json({ items: data || [] });
    } catch (e: unknown) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });

  route.post("/admin/maintenance-templates/scoped", requireAuth(), async (c) => {
    const denied = assertVehicleCatalogPlatformAccess(c);
    if (denied) return denied;
    try {
      const body = (await c.req.json()) as Record<string, unknown>;
      const scope = String(body.template_scope ?? "");
      const task_name = String(body.task_name ?? "").trim();
      if (!task_name || !["platform", "engine_family", "variant"].includes(scope)) {
        return c.json({ error: "A name and a scope are required." }, 400);
      }
      const row: Record<string, unknown> = {
        template_scope: scope,
        task_name,
        task_code: body.task_code != null ? String(body.task_code) : null,
        component_id: typeof body.component_id === "string" && body.component_id ? body.component_id : null,
        vehicle_catalog_id: scope === "variant" ? body.vehicle_catalog_id : null,
        platform_id: scope === "platform" ? body.platform_id : null,
        engine_family_id: scope === "engine_family" ? body.engine_family_id : null,
        interval_km: body.interval_km != null && body.interval_km !== ""
          ? Number(body.interval_km)
          : null,
        interval_months: body.interval_months != null && body.interval_months !== "" ? Number(body.interval_months) : null,
        icon_key: body.icon_key != null ? String(body.icon_key) : "wrench",
      };
      const { data, error } = await supabase.from("maintenance_task_templates").insert(row).select("*").single();
      if (error) throw error;
      return c.json({ item: data });
    } catch (e: unknown) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });

  route.post(
    "/admin/maintenance-templates/global",
    requireAuth(),
    async (c) => {
      const denied = assertCatalogWriteResponse(c);
      if (denied) return denied;
      try {
        const body = (await c.req.json()) as Record<string, unknown>;
        const task_name = String(body.task_name ?? "").trim();
        if (!task_name) return c.json({ error: "task_name is required" }, 400);
        const fkRaw = String(body.frequency_kind ?? "recurring").trim();
        const frequency_kind = ["recurring", "once_milestone", "manual_only"].includes(fkRaw)
          ? fkRaw
          : "recurring";
        const fl = body.frequency_label != null ? String(body.frequency_label).trim() : "";
        const frequency_label = fl.length ? fl.slice(0, 120) : null;
        const interval_km = body.interval_km != null && body.interval_km !== ""
          ? Number(body.interval_km)
          : null;
        let interval_km_max = parseOptionalNumberField(body.interval_km_max);
        if (interval_km != null && interval_km_max != null && interval_km_max === interval_km) {
          interval_km_max = null;
        }
        const rangeErrG = assertIntervalKmRange(interval_km, interval_km_max);
        if (rangeErrG) return c.json({ error: rangeErrG }, 400);
        const iconKeyRawG = body.icon_key != null ? String(body.icon_key).trim() : "wrench";
        const icon_key = (iconKeyRawG || "wrench").slice(0, 40);
        const dueKindParsedG = parseDueKind(body.due_kind);
        if (body.due_kind !== undefined && body.due_kind !== null && body.due_kind !== "" && !dueKindParsedG) {
          return c.json({ error: "due_kind must be service_package or statutory_inspection" }, 400);
        }
        const row = {
          template_scope: "global",
          vehicle_catalog_id: null as string | null,
          component_id: typeof body.component_id === "string" && body.component_id ? body.component_id : null,
          task_name,
          task_code: parseTaskCode(body),
          description: body.description != null ? String(body.description) : null,
          interval_km,
          interval_km_max,
          interval_months: body.interval_months != null && body.interval_months !== ""
            ? Number(body.interval_months)
            : null,
          frequency_kind,
          frequency_label,
          due_kind: dueKindParsedG ?? "service_package",
          priority: String(body.priority ?? "standard"),
          sort_order: body.sort_order != null ? Number(body.sort_order) : 0,
          icon_key,
          updated_at: new Date().toISOString(),
        };
        const { data, error } = await supabase.from("maintenance_task_templates").insert(row).select().single();
        if (error) throw error;
        return c.json({ item: data });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  // -------------------------------------------------------------------------
  // Super Admin — service categories + package membership
  // -------------------------------------------------------------------------
  route.get(
    "/admin/maintenance-categories",
    requireAuth(),
    async (c) => {
      const denied = assertVehicleCatalogPlatformAccess(c);
      if (denied) return denied;
      try {
        const kindFilter = parseCategoryKind(c.req.query("kind"));
        let q = supabase
          .from("maintenance_service_categories")
          .select("*")
          .order("sort_order", { ascending: true });
        if (kindFilter) q = q.eq("kind", kindFilter);
        const { data, error } = await q;
        if (error) throw error;
        return c.json({ items: data || [] });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.post(
    "/admin/maintenance-categories",
    requireAuth(),
    async (c) => {
      const denied = assertCatalogWriteResponse(c);
      if (denied) return denied;
      try {
        const body = (await c.req.json()) as Record<string, unknown>;
        const code = String(body.code ?? "").trim();
        const name = String(body.name ?? "").trim();
        if (!code) return c.json({ error: "code is required" }, 400);
        if (!name) return c.json({ error: "name is required" }, 400);
        const kind = parseCategoryKind(body.kind) ?? "component";
        const parentParsed = parseOptionalUuidField(body.parent_id);
        if (!parentParsed.ok) return c.json({ error: "Invalid parent_id" }, 400);
        let parent_id = parentParsed.value;
        if (kind === "system") parent_id = null;
        const kindErr = assertCategoryKindParent(kind, parent_id);
        if (kindErr) return c.json({ error: kindErr }, 400);
        const op_code = body.op_code === undefined || body.op_code === null || body.op_code === ""
          ? null
          : String(body.op_code).trim().slice(0, 80);
        const iconKeyRaw = body.icon_key != null ? String(body.icon_key).trim() : "wrench";
        const isPart = kind === "component" && body.is_part !== false;
        const WO_ACTIONS = new Set([
          "inspect", "clean", "adjust", "replace", "rotate", "balance", "flush", "top_up", "repair",
          "machine", "rebuild", "other",
        ]);
        let default_action: string | undefined;
        if (kind === "component") {
          const rawAction = body.default_action != null ? String(body.default_action).trim() : "";
          default_action = WO_ACTIONS.has(rawAction) ? rawAction : (isPart ? "replace" : "other");
        }
        const row: Record<string, unknown> = {
          code: code.slice(0, 80),
          name: name.slice(0, 200),
          icon_key: (iconKeyRaw || "wrench").slice(0, 40),
          field_schema: parseFieldSchema(body.field_schema),
          quick_job_eligible: body.quick_job_eligible === true,
          sort_order: body.sort_order != null ? Number(body.sort_order) : 0,
          kind,
          parent_id,
          op_code,
          position_aware: kind === "component" && body.position_aware === true,
          updated_at: new Date().toISOString(),
        };
        if (default_action !== undefined) row.default_action = default_action;
        const { data, error } = await supabase
          .from("maintenance_service_categories")
          .insert(row)
          .select()
          .single();
        if (error) throw error;
        return c.json({ item: data });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.patch(
    "/admin/maintenance-categories/:id",
    requireAuth(),
    async (c) => {
      const denied = assertCatalogWriteResponse(c);
      if (denied) return denied;
      const id = c.req.param("id");
      try {
        const body = (await c.req.json()) as Record<string, unknown>;
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (body.code !== undefined) patch.code = String(body.code).trim().slice(0, 80);
        if (body.name !== undefined) patch.name = String(body.name).trim().slice(0, 200);
        if (body.icon_key !== undefined) {
          const iconKeyRaw = body.icon_key != null ? String(body.icon_key).trim() : "wrench";
          patch.icon_key = (iconKeyRaw || "wrench").slice(0, 40);
        }
        if (body.field_schema !== undefined) patch.field_schema = parseFieldSchema(body.field_schema);
        if (body.quick_job_eligible !== undefined) patch.quick_job_eligible = body.quick_job_eligible === true;
        if (body.sort_order !== undefined) patch.sort_order = Number(body.sort_order);
        if (body.op_code !== undefined) {
          patch.op_code = body.op_code === null || body.op_code === ""
            ? null
            : String(body.op_code).trim().slice(0, 80);
        }
        if (body.position_aware !== undefined) {
          patch.position_aware = body.position_aware === true;
        }

        const { data: existingCat } = await supabase
          .from("maintenance_service_categories")
          .select("kind, parent_id")
          .eq("id", id)
          .maybeSingle();
        if (!existingCat) return c.json({ error: "Not found" }, 404);

        const nextKindRaw = body.kind !== undefined ? parseCategoryKind(body.kind) : null;
        if (body.kind !== undefined && !nextKindRaw) {
          return c.json({ error: "kind must be system or component" }, 400);
        }
        const nextKind = (nextKindRaw ?? String(existingCat.kind ?? "component")) as "system" | "component";
        if (body.kind !== undefined) patch.kind = nextKind;
        if (nextKind === "system") patch.position_aware = false;

        let nextParent: string | null =
          existingCat.parent_id != null ? String(existingCat.parent_id) : null;
        if (body.parent_id !== undefined) {
          const parentParsed = parseOptionalUuidField(body.parent_id);
          if (!parentParsed.ok) return c.json({ error: "Invalid parent_id" }, 400);
          nextParent = parentParsed.value;
        }
        if (nextKind === "system") nextParent = null;
        if (body.kind !== undefined || body.parent_id !== undefined) {
          const kindErr = assertCategoryKindParent(nextKind, nextParent);
          if (kindErr) return c.json({ error: kindErr }, 400);
          patch.parent_id = nextParent;
        }

        const { data, error } = await supabase
          .from("maintenance_service_categories")
          .update(patch)
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;
        if (!data) return c.json({ error: "Not found" }, 404);
        return c.json({ item: data });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.delete(
    "/admin/maintenance-categories/:id",
    requireAuth(),
    async (c) => {
      const denied = assertCatalogWriteResponse(c);
      if (denied) return denied;
      const id = c.req.param("id");
      try {
        const { data: deps, error: depErr } = await supabase.rpc("maintenance_part_type_dependents", { p_id: id });
        if (depErr) throw depErr;
        const total = (deps || []).reduce(
          (sum: number, row: { row_count?: number }) => sum + Number(row.row_count ?? 0),
          0,
        );
        if (total > 0) {
          return c.json(
            { error: "Part type has dependents; retire it instead", code: "PART_TYPE_HAS_DEPENDENTS", dependents: deps },
            409,
          );
        }
        const { error } = await supabase.from("maintenance_service_categories").delete().eq("id", id);
        if (error) throw error;
        return c.json({ success: true, deleted: true });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.post(
    "/admin/maintenance-categories/:id/retire",
    requireAuth(),
    async (c) => {
      return governWriteOrProposal(
        c,
        supabase,
        {
          entityTable: "maintenance_service_categories",
          entityId: c.req.param("id"),
          action: "retire",
          payload: {},
        },
        async () => {
          const id = c.req.param("id");
          const now = new Date().toISOString();
          const { data, error } = await supabase
            .from("maintenance_service_categories")
            .update({ status: "retired", retired_at: now, updated_at: now })
            .eq("id", id)
            .select("*")
            .maybeSingle();
          if (error) throw error;
          if (!data) return c.json({ error: "Not found" }, 404);
          await supabase
            .from("vehicle_component_schedule")
            .update({ schedule_status: "retired", updated_at: now })
            .eq("category_id", id);
          await fleetDb()
            .from("fleet_maintenance_alerts")
            .update({
              status: "superseded",
              resolution_reason: "schedule_retired",
              resolved_at: now,
            })
            .eq("category_id", id)
            .eq("status", "open");
          return c.json({ item: data, retired: true });
        },
      );
    },
  );

  route.get(
    "/admin/maintenance-templates/:id/categories",
    requireAuth(),
    async (c) => {
      const denied = assertVehicleCatalogPlatformAccess(c);
      if (denied) return denied;
      const id = c.req.param("id");
      try {
        const { data, error } = await supabase
          .from("maintenance_package_categories")
          .select("*, category:maintenance_service_categories(*)")
          .eq("template_id", id)
          .order("sort_order", { ascending: true });
        if (error) throw error;
        return c.json({ items: data || [] });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.put(
    "/admin/maintenance-templates/:id/categories",
    requireAuth(),
    async (c) => {
      const denied = assertCatalogWriteResponse(c);
      if (denied) return denied;
      const id = c.req.param("id");
      try {
        const body = (await c.req.json()) as Record<string, unknown>;
        const rawItems = Array.isArray(body.items) ? body.items : null;
        const rawIds = Array.isArray(body.categoryIds) ? body.categoryIds : [];
        const categoryIds = rawIds.map((x) => String(x).trim()).filter((x) => isUuid(x));
        const { error: delErr } = await supabase
          .from("maintenance_package_categories")
          .delete()
          .eq("template_id", id);
        if (delErr) throw delErr;
        if (rawItems && rawItems.length) {
          const rows = rawItems.map((item, sort_order) => {
            const row = item as Record<string, unknown>;
            const category_id = String(row.categoryId ?? row.category_id ?? "").trim();
            if (!isUuid(category_id)) return null;
            return {
              template_id: id,
              category_id,
              sort_order: row.sortOrder != null ? Number(row.sortOrder) : sort_order,
              required: row.required !== false,
            };
          }).filter(Boolean) as Array<{
            template_id: string;
            category_id: string;
            sort_order: number;
            required: boolean;
          }>;
          if (rows.length) {
            const { error: insErr } = await supabase.from("maintenance_package_categories").insert(rows);
            if (insErr) throw insErr;
          }
        } else if (categoryIds.length) {
          const rows = categoryIds.map((category_id, sort_order) => ({
            template_id: id,
            category_id,
            sort_order,
            required: true,
          }));
          const { error: insErr } = await supabase.from("maintenance_package_categories").insert(rows);
          if (insErr) throw insErr;
        }
        await syncTemplateDescriptionFromCategories(supabase, id);
        const { data, error } = await supabase
          .from("maintenance_package_categories")
          .select("*, category:maintenance_service_categories(*)")
          .eq("template_id", id)
          .order("sort_order", { ascending: true });
        if (error) throw error;
        return c.json({ items: data || [] });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.get(
    "/maintenance-categories",
    requireAuth(),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        const kindFilter = parseCategoryKind(c.req.query("kind"));
        let q = supabase
          .from("maintenance_service_categories")
          .select("*")
          .order("sort_order", { ascending: true });
        if (kindFilter) q = q.eq("kind", kindFilter);
        const { data, error } = await q;
        if (error) throw error;
        const baseItems = (data || []) as Record<string, unknown>[];
        const fitCtx = orgId ? await loadJobFitContext(c, supabase, orgId) : { mode: "off" as const };
        if (fitCtx instanceof Response) return fitCtx;
        if (fitCtx.mode === "off") {
          return c.json({ items: baseItems });
        }
        if (fitCtx.mode === "error") {
          return c.json({ items: baseItems, jobFit: fitCtx.jobFit });
        }
        let items = baseItems;
        if (kindFilter === "component") {
          items = baseItems.map((row) => ({
            ...row,
            fits: fitCtx.fitMap.get(String(row.id)) ?? "unknown",
          }));
        } else {
          let componentsForCounts: Record<string, unknown>[] = [];
          if (kindFilter === "system") {
            const { data: comps, error: compErr } = await supabase
              .from("maintenance_service_categories")
              .select("id, parent_id, kind, status")
              .eq("kind", "component");
            if (compErr) throw compErr;
            componentsForCounts = (comps || []) as Record<string, unknown>[];
          }
          const enrichSource = kindFilter === "system"
            ? [...baseItems, ...componentsForCounts]
            : baseItems;
          items = enrichCategoryListWithFit(enrichSource, fitCtx).filter((row) =>
            kindFilter === "system" ? String(row.kind ?? "") === "system" : true
          );
        }
        return c.json({ items, jobFit: fitCtx.jobFit });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.get(
    "/maintenance-categories/quick-jobs",
    requireAuth(),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        const { data, error } = await supabase
          .from("maintenance_service_categories")
          .select("*")
          .eq("kind", "system")
          .eq("quick_job_eligible", true)
          .order("sort_order", { ascending: true });
        if (error) throw error;
        const baseItems = (data || []) as Record<string, unknown>[];
        const fitCtx = orgId ? await loadJobFitContext(c, supabase, orgId) : { mode: "off" as const };
        if (fitCtx instanceof Response) return fitCtx;
        if (fitCtx.mode === "off") {
          return c.json({ items: baseItems });
        }
        if (fitCtx.mode === "error") {
          return c.json({ items: baseItems, jobFit: fitCtx.jobFit });
        }
        const { data: comps, error: compErr } = await supabase
          .from("maintenance_service_categories")
          .select("id, parent_id, kind, status")
          .eq("kind", "component");
        if (compErr) throw compErr;
        const items = enrichCategoryListWithFit(
          [...baseItems, ...((comps || []) as Record<string, unknown>[])],
          fitCtx,
        ).filter((row) => String(row.kind ?? "") === "system");
        return c.json({ items, jobFit: fitCtx.jobFit });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.get(
    "/maintenance-categories/systems/:systemId/components",
    requireAuth(),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        const systemId = c.req.param("systemId")?.trim() ?? "";
        if (!isUuid(systemId)) return c.json({ error: "Invalid system id" }, 400);
        const { data, error } = await supabase
          .from("maintenance_service_categories")
          .select("*")
          .eq("kind", "component")
          .eq("parent_id", systemId)
          .order("sort_order", { ascending: true });
        if (error) throw error;
        const baseItems = (data || []) as Record<string, unknown>[];
        const fitCtx = orgId ? await loadJobFitContext(c, supabase, orgId) : { mode: "off" as const };
        if (fitCtx instanceof Response) return fitCtx;
        if (fitCtx.mode === "off") {
          return c.json({ items: baseItems });
        }
        if (fitCtx.mode === "error") {
          return c.json({ items: baseItems, jobFit: fitCtx.jobFit });
        }
        const items = baseItems.map((row) => ({
          ...row,
          fits: fitCtx.fitMap.get(String(row.id)) ?? "unknown",
        }));
        return c.json({ items, jobFit: fitCtx.jobFit });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.get(
    "/maintenance-categories/systems/:systemId/sections",
    requireAuth(),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        const systemId = c.req.param("systemId")?.trim() ?? "";
        if (!isUuid(systemId)) return c.json({ error: "Invalid system id" }, 400);

        const [sgRes, secRes, memRes, homeRes, relRes, sysRes] = await Promise.all([
          supabase
            .from("maintenance_job_section_groups")
            .select("id, code, name, sort_order")
            .eq("system_id", systemId)
            .order("sort_order"),
          supabase
            .from("maintenance_job_sections")
            .select("id, group_id, code, name, description, icon_key, sort_order")
            .eq("system_id", systemId)
            .order("sort_order"),
          supabase
            .from("maintenance_job_section_members")
            .select("section_id, category_id, sort_order")
            .eq("system_id", systemId),
          supabase
            .from("maintenance_service_categories")
            .select("*")
            .eq("kind", "component")
            .eq("parent_id", systemId),
          supabase.from("maintenance_job_relations").select("from_category_id, to_category_id, note"),
          supabase
            .from("maintenance_service_categories")
            .select("id, name")
            .eq("kind", "system"),
        ]);

        for (const r of [sgRes, secRes, memRes, homeRes, relRes, sysRes]) {
          if (r.error) throw r.error;
        }

        const { data: allComp, error: allErr } = await supabase
          .from("maintenance_service_categories")
          .select("*")
          .eq("kind", "component");
        if (allErr) throw allErr;
        const allJobsById = new Map<string, Record<string, unknown>>();
        for (const j of allComp || []) {
          allJobsById.set(String((j as { id: string }).id), j as Record<string, unknown>);
        }
        const homeList = (homeRes.data || []) as Record<string, unknown>[];

        const systemsById = new Map(
          (sysRes.data || []).map((s) => [
            String((s as { id: string }).id),
            { id: String((s as { id: string }).id), name: String((s as { name: string }).name) },
          ]),
        );

        const payload = buildSystemSections(
          systemId,
          (sgRes.data || []).map((g) => ({
            id: String((g as { id: string }).id),
            code: String((g as { code: string }).code),
            name: String((g as { name: string }).name),
            sort_order: Number((g as { sort_order: number }).sort_order),
          })),
          (secRes.data || []).map((s) => ({
            id: String((s as { id: string }).id),
            group_id: String((s as { group_id: string }).group_id),
            code: String((s as { code: string }).code),
            name: String((s as { name: string }).name),
            description: String((s as { description: string }).description),
            icon_key: String((s as { icon_key: string }).icon_key),
            sort_order: Number((s as { sort_order: number }).sort_order),
          })),
          (memRes.data || []).map((m) => ({
            section_id: String((m as { section_id: string }).section_id),
            category_id: String((m as { category_id: string }).category_id),
            sort_order: (m as { sort_order: number | null }).sort_order,
          })),
          homeList,
          (relRes.data || []).map((r) => ({
            from_category_id: String((r as { from_category_id: string }).from_category_id),
            to_category_id: String((r as { to_category_id: string }).to_category_id),
            note: String((r as { note: string }).note),
          })),
          systemsById,
          allJobsById,
        );
        const withItems = await attachFleetJobItemsToSections(supabase, payload);
        const [serviceItemsEnabled, inspectionFindingsEnabled, logServicePartsGapsEnabled] = orgId
          ? await Promise.all([
            isFeatureEnabled(FEATURE_FLAGS.SERVICE_ITEMS, orgId),
            isFeatureEnabled(FEATURE_FLAGS.INSPECTION_FINDINGS, orgId),
            isFeatureEnabled(FEATURE_FLAGS.LOG_SERVICE_PARTS_GAPS, orgId),
          ])
          : [false, false, false];
        const withRecords = enrichSectionsRecordsFindings(withItems, inspectionFindingsEnabled);
        const fitCtx = orgId ? await loadJobFitContext(c, supabase, orgId) : { mode: "off" as const };
        const flagPayload = { serviceItemsEnabled, inspectionFindingsEnabled, logServicePartsGapsEnabled };
        if (fitCtx instanceof Response) return fitCtx;
        if (fitCtx.mode === "off") {
          return c.json({ ...withRecords, ...flagPayload });
        }
        if (fitCtx.mode === "error") {
          return c.json({ ...withRecords, ...flagPayload, jobFit: fitCtx.jobFit });
        }
        const enriched = enrichSectionsWithFit(withRecords, fitCtx.fitMap);
        return c.json({ ...enriched, ...flagPayload, jobFit: fitCtx.jobFit });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  // One-shot KV → Postgres migration (platform)
  route.post(
    "/admin/migrate-maintenance-from-kv",
    requireAuth(),
    async (c) => {
      const denied = assertCatalogWriteResponse(c);
      if (denied) return denied;
      try {
        const { data: rows, error } = await fromKvStore()
          .select("key, value")
          .like("key", "maintenance_log:%");
        if (error) throw error;
        let inserted = 0;
        let skipped = 0;
        for (const row of rows || []) {
          const val = row.value as Record<string, unknown>;
          if (!val || typeof val !== "object") continue;
          const vehicleId = String(val.vehicleId ?? "");
          const legacyId = String(val.id ?? "");
          const orgId = String(val.organizationId ?? "roam-default-org");
          if (!vehicleId || !legacyId) {
            skipped++;
            continue;
          }
          const { data: existing } = await supabase
            .from("maintenance_records")
            .select("id")
            .eq("organization_id", orgId)
            .eq("legacy_kv_id", legacyId)
            .maybeSingle();
          if (existing) {
            skipped++;
            continue;
          }
          const performed_at_date = String(val.date ?? todayIso()).slice(0, 10);
          const performed_at_miles = Number(val.odo ?? 0);
          const { error: upErr } = await supabase.from("maintenance_records").insert({
            organization_id: orgId,
            vehicle_id: vehicleId,
            template_id: null,
            performed_at_miles,
            performed_at_date,
            cost: val.cost != null ? Number(val.cost) : null,
            service_type: val.type != null ? String(val.type) : null,
            provider: val.provider != null ? String(val.provider) : null,
            notes: val.notes != null ? String(val.notes) : null,
            invoice_url: val.invoiceUrl != null ? String(val.invoiceUrl) : null,
            status: val.status != null ? String(val.status) : null,
            legacy_kv_id: legacyId,
            payload_json: val,
            updated_at: new Date().toISOString(),
          });
          if (upErr) {
            console.warn("[migrate-maintenance]", legacyId, upErr.message);
            skipped++;
          } else {
            inserted++;
          }
        }
        return c.json({ ok: true, inserted, skipped, scanned: (rows || []).length });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  async function getVehicleFromKv(c: Context, vehicleId: string): Promise<Record<string, unknown> | null> {
    const orgId = getOrgId(c);
    if (!orgId) return null;
    const row = await loadFleetVehicleForOrg(orgId, vehicleId);
    if (!row) return null;
    return {
      id: row.id,
      vehicleId: row.id,
      licensePlate: row.license_plate,
      make: row.make,
      model: row.model,
      year: row.year,
      fleetUnitId: row.fleet_unit_id,
      homeBase: row.home_base,
      vin: row.vin,
      organizationId: row.organization_id,
    };
  }

  // -------------------------------------------------------------------------
  // Tenant — schedule
  // -------------------------------------------------------------------------
  route.get(
    "/maintenance-schedule/:vehicleId",
    requireAuth(),
    async (c) => {
      try {
        const vehicleId = c.req.param("vehicleId");
        const v = await getVehicleFromKv(c, vehicleId);
        if (!v) return c.json({ error: "Vehicle not found" }, 404);
        const metricsBase = Number(v.metrics && typeof v.metrics === "object"
          ? (v.metrics as { odometer?: number }).odometer
          : 0) || 0;
        const currentOdo = await canonicalOdometerForVehicle(supabase, vehicleId, metricsBase, c);
        const catalogId = await resolveCatalogIdForKvVehicle(supabase, v);
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);

        const { data: scheduleRows, error: schErr } = await supabase
          .from("vehicle_maintenance_schedule")
          .select("*")
          .eq("organization_id", orgId)
          .eq("vehicle_id", vehicleId);
        if (schErr) throw schErr;

        const templateIds = [...new Set((scheduleRows || []).map((r: { template_id?: string }) => r.template_id).filter(Boolean))] as string[];
        const { data: tplRows } = templateIds.length
          ? await supabase
            .from("maintenance_task_templates")
            .select("*")
            .in("id", templateIds)
            .is("component_id", null)
          : { data: [] as Record<string, unknown>[] };
        const catsByTpl = await loadCategoriesForTemplateIds(supabase, templateIds);
        const tplById: Record<string, Record<string, unknown>> = {};
        for (const t of tplRows || []) {
          const tid = String((t as { id: string }).id);
          tplById[tid] = {
            ...(t as Record<string, unknown>),
            categories: catsByTpl.get(tid) || [],
          };
        }

        const today = todayIso();
        const enriched = (scheduleRows || []).map((row: Record<string, unknown>) => {
          const nextMiles = row.next_due_miles != null ? Number(row.next_due_miles) : null;
          const nextMilesMaxRaw = row.next_due_miles_max != null ? Number(row.next_due_miles_max) : null;
          const nextDate = row.next_due_date != null ? String(row.next_due_date).slice(0, 10) : null;
          const schRowStatus = row.schedule_status != null ? String(row.schedule_status) : "active";
          const st = analyzeMaintenanceScheduleRow(
            currentOdo,
            today,
            nextMiles,
            nextMilesMaxRaw,
            nextDate,
            schRowStatus,
          ).status;
          const tid = String(row.template_id ?? "");
          return { ...row, template: tplById[tid] || null, computed_status: st };
        });

        const fleetStatus = enriched.length
          ? aggregateFleetStatus(enriched.map((r: { computed_status: string }) => ({
            status: r.computed_status as "ok" | "pending" | "overdue" | "fulfilled",
          })))
          : "No schedule";

        const dueSoonRows = enriched.filter((r: Record<string, unknown>) => {
          const st = r.computed_status as string;
          if (st === "fulfilled") return false;
          return r.next_due_miles != null;
        });
        const minNextMiles = dueSoonRows.length
          ? dueSoonRows
            .map((r: Record<string, unknown>) =>
              r.next_due_miles != null ? Number(r.next_due_miles) : Infinity
            )
            .reduce((a: number, b: number) => Math.min(a, b), Infinity)
          : Infinity;
        const nextOdo = minNextMiles === Infinity ? currentOdo + 5000 : minNextMiles;
        const remainingKm = Math.max(0, nextOdo - currentOdo);
        const daysToService = Math.max(0, Math.ceil(remainingKm / 50));

        const nextTypeLabel = enriched.find((r: Record<string, unknown>) =>
          r.computed_status !== "fulfilled" &&
          r.next_due_miles != null &&
          Number(r.next_due_miles) === minNextMiles
        );
        const tpl = nextTypeLabel?.template as { task_name?: string } | null | undefined;

        return c.json({
          catalogId,
          catalogMatched: !!catalogId,
          maintenanceStatus: {
            status: fleetStatus,
            nextTypeLabel: tpl?.task_name || "Service",
            daysToService,
            nextOdo,
            remainingKm,
          },
          schedule: enriched,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.post(
    "/maintenance-schedule/:vehicleId/bootstrap",
    requireAuth(),
    requirePermission("vehicles.edit"),
    async (c) => {
      try {
        const vehicleId = c.req.param("vehicleId");
        const body = await c.req.json().catch(() => ({})) as { currentOdometer?: number };
        const v = await getVehicleFromKv(c, vehicleId);
        if (!v) return c.json({ error: "Vehicle not found" }, 404);
        const catalogId = await resolveCatalogIdForKvVehicle(supabase, v);
        if (!catalogId) return c.json({ error: "No vehicle catalog match for make/model/year", catalogMatched: false }, 400);
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const metricsBase = Number((v.metrics as { odometer?: number })?.odometer ?? 0) || 0;
        const currentOdo = body.currentOdometer != null && Number.isFinite(Number(body.currentOdometer))
          ? Number(body.currentOdometer)
          : await canonicalOdometerForVehicle(supabase, vehicleId, metricsBase, c);

        const run = await executeMaintenanceBootstrap({
          supabase,
          organizationId: orgId,
          vehicleId,
          currentOdo,
          catalogId,
        });
        if (!run.ok) {
          return c.json({ error: run.error, catalogId: run.catalogId, created: 0 }, 400);
        }
        if (run.emptyTemplates) {
          return c.json({
            created: 0,
            message: "No global or catalog templates for this vehicle",
            catalogId: run.catalogId,
            globalApplied: 0,
            catalogApplied: 0,
            skippedDuplicates: 0,
          });
        }
        return c.json({
          created: run.created,
          catalogId: run.catalogId,
          globalApplied: run.globalApplied,
          catalogApplied: run.catalogApplied,
          skippedDuplicates: run.skippedDuplicates,
          warnings: run.warnings,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  // -------------------------------------------------------------------------
  // Tenant — records (replaces KV maintenance_log)
  // -------------------------------------------------------------------------
  route.get(
    "/maintenance-logs/:vehicleId",
    requireAuth(),
    async (c) => {
      try {
        const vehicleId = c.req.param("vehicleId");
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);

        let q = supabase
          .from("maintenance_records")
          .select("*")
          .eq("vehicle_id", vehicleId)
          .eq("organization_id", orgId)
          .order("performed_at_date", { ascending: false });

        const { data, error } = await q;
        if (error) throw error;

        const records = (data || []) as Record<string, unknown>[];
        const woIds = new Set<string>();
        for (const row of records) {
          const woCol = row.work_order_id != null ? String(row.work_order_id) : "";
          if (woCol && isUuid(woCol)) woIds.add(woCol);
          const payload = row.payload_json && typeof row.payload_json === "object"
            ? row.payload_json as Record<string, unknown>
            : null;
          const payloadWo = payload?.workOrderId != null ? String(payload.workOrderId) : "";
          if (payloadWo && isUuid(payloadWo)) woIds.add(payloadWo);
        }

        const woVersionById = new Map<string, number>();
        const lineMetaById = new Map<string, { itemsAmount: number }>();
        const itemsByLineId = new Map<string, Record<string, unknown>[]>();

        if (woIds.size > 0) {
          const { data: wos, error: woErr } = await supabase
            .from("maintenance_work_orders")
            .select("id, version")
            .in("id", [...woIds]);
          if (woErr) throw woErr;
          for (const wo of wos || []) {
            woVersionById.set(
              String((wo as { id: string }).id),
              Number((wo as { version?: number }).version ?? 1),
            );
          }
          const { data: lines, error: lineErr } = await supabase
            .from("maintenance_work_order_lines")
            .select("id, items_amount")
            .in("work_order_id", [...woIds]);
          if (lineErr) throw lineErr;
          for (const line of lines || []) {
            const lr = line as { id: string; items_amount?: number };
            lineMetaById.set(String(lr.id), {
              itemsAmount: Number(lr.items_amount ?? 0),
            });
          }
          const itemsMap = await loadLineItemsForWorkOrders(supabase, [...woIds]);
          for (const [lineId, items] of itemsMap.entries()) {
            itemsByLineId.set(lineId, items);
          }
        }

        const logs = records.map((row: Record<string, unknown>) => {
          const base = row.payload_json && typeof row.payload_json === "object"
            ? { ...(row.payload_json as Record<string, unknown>) }
            : {
              id: row.id,
              vehicleId: row.vehicle_id,
              date: row.performed_at_date,
              type: row.service_type || "Service",
              cost: row.cost != null ? Number(row.cost) : 0,
              odo: row.performed_at_miles,
              provider: row.provider || "",
              notes: row.notes || "",
              invoiceUrl: row.invoice_url || "",
              status: row.status || "Completed",
            };
          const woId = row.work_order_id != null && isUuid(String(row.work_order_id))
            ? String(row.work_order_id)
            : (base.workOrderId != null && isUuid(String(base.workOrderId))
              ? String(base.workOrderId)
              : "");
          if (woId) {
            base.version = woVersionById.get(woId) ?? 1;
          }
          if (Array.isArray(base.lines)) {
            base.lines = base.lines.map((lineRaw: unknown) => {
              if (!lineRaw || typeof lineRaw !== "object") return lineRaw;
              const line = lineRaw as Record<string, unknown>;
              const lineId = line.id != null ? String(line.id) : "";
              if (!lineId) return line;
              const meta = lineMetaById.get(lineId);
              return {
                ...line,
                itemsAmount: meta?.itemsAmount ?? 0,
                items: itemsByLineId.get(lineId) ?? [],
              };
            });
          }
          return base;
        });

        return c.json(logs);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.get(
    "/maintenance-logs",
    requireAuth(),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const { data, error } = await supabase
          .from("maintenance_records")
          .select("*")
          .eq("organization_id", orgId)
          .order("performed_at_date", { ascending: false })
          .limit(5000);
        if (error) throw error;
        return c.json(data || []);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.post(
    "/maintenance-logs",
    requireAuth(),
    requirePermission("vehicles.edit"),
    requireCatalogMatched({
      label: "POST /maintenance-logs",
      vehicleId: (_c, body) => {
        if (!body || typeof body !== "object") return null;
        const id = (body as { vehicleId?: unknown }).vehicleId;
        return typeof id === "string" && id.trim() ? id.trim() : null;
      },
    }),
    async (c) => {
      try {
        const log = ((c.get("__cachedRequestBody") as Record<string, unknown> | null) ?? (await c.req.json())) as Record<string, unknown>;
        const vehicleId = String(log.vehicleId ?? "");
        if (!vehicleId) return c.json({ error: "vehicleId is required" }, 400);
        const id = String(log.id || crypto.randomUUID());
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);

        const performed_at_date = String(log.date ?? todayIso()).slice(0, 10);
        const odoCheck = parseRequiredOdometer({ odometer: log.odo, odo: log.odo });
        if (typeof odoCheck === "object") return odometerRequiredResponse(c);
        const performed_at_miles = odoCheck;
        const templateId = log.templateId != null ? String(log.templateId) : null;
        const logMode = log.logMode != null ? String(log.logMode) : null;

        const currencyRaw = log.currency != null ? String(log.currency).trim().toUpperCase() : "JMD";
        const currency = currencyRaw || "JMD";
        const status = log.status != null ? String(log.status) : "Completed";
        const jobCompleted = status.trim().toLowerCase() === "completed";
        const idempotencyKeyRaw = log.idempotencyKey ?? log.idempotency_key;
        const idempotencyKey = idempotencyKeyRaw != null ? String(idempotencyKeyRaw).trim() : "";

        if (idempotencyKey) {
          const raced = await findWorkOrderByIdempotency(supabase, orgId, idempotencyKey);
          if (raced) {
            const racedStatus = String(raced.status);
            if (racedStatus === "completed") {
              const { data: record } = await supabase
                .from("maintenance_records")
                .select("*")
                .eq("id", raced.maintenance_record_id ?? "")
                .maybeSingle();
              const { data: woLines } = await supabase
                .from("maintenance_work_order_lines")
                .select("*")
                .eq("work_order_id", raced.id)
                .order("sort_order", { ascending: true });
              const enriched = await enrichLinesWithItems(
                supabase,
                String(raced.id),
                (woLines || []) as Record<string, unknown>[],
              );
              return c.json({
                success: true,
                data: record,
                workOrderId: raced.id,
                lines: enriched,
                idempotentReplay: true,
              });
            }
            if (racedStatus === "in_progress") {
              const completeRes = await internalWorkOrderCompleteRequest(app, c, String(raced.id), {
                recordId: await legacyCompleteRecordId(supabase, id, String(raced.id), orgId, vehicleId),
                type: log.type,
                payloadExtra: legacyMaintenanceLogPayloadExtra(log),
              });
              if (!completeRes.ok) {
                const errBody = await completeRes.json().catch(() => ({}));
                return c.json(errBody, completeRes.status as 200);
              }
              const completeJson = await completeRes.json() as Record<string, unknown>;
              return c.json({
                success: true,
                data: completeJson.record,
                workOrderId: raced.id,
                lines: (completeJson.item as { lines?: unknown })?.lines ?? [],
                warrantyPrompts: completeJson.warrantyPrompts,
                stockWarnings: completeJson.stockWarnings,
                ledgerPosted: completeJson.ledgerPosted,
                ledgerWarning: completeJson.ledgerWarning,
                idempotentReplay: true,
              });
            }
          }
        }

        const rawLines = Array.isArray(log.lines) ? log.lines as unknown[] : [];
        if (rawLines.length === 0) {
          const cost = log.cost != null ? Number(log.cost) : null;
          const rowInsert = {
            id,
            organization_id: orgId,
            vehicle_id: vehicleId,
            template_id: templateId || null,
            performed_at_miles,
            performed_at_date,
            cost,
            currency,
            service_type: log.type != null ? String(log.type) : null,
            provider: log.provider != null ? String(log.provider) : null,
            notes: log.notes != null ? String(log.notes) : null,
            invoice_url: log.invoiceUrl != null ? String(log.invoiceUrl) : null,
            status,
            legacy_kv_id: null as string | null,
            payload_json: { ...log, id, vehicleId, currency, status, cost } as Record<string, unknown>,
            updated_at: new Date().toISOString(),
          };
          const { data: inserted, error: insErr } = await supabase
            .from("maintenance_records")
            .insert(rowInsert)
            .select()
            .single();
          if (insErr) throw insErr;
          const ledgerInput = {
            id,
            vehicleId,
            performed_at_date,
            cost: rowInsert.cost,
            status,
            currency,
            service_type: rowInsert.service_type,
            provider: rowInsert.provider,
          };
          const ledgerResult = await appendCanonicalMaintenanceIfEligible(ledgerInput, c);
          try {
            await projectFromMaintenanceLog(
              {
                id,
                vehicleId,
                odometer: performed_at_miles,
                date: performed_at_date,
                serviceType: rowInsert.service_type,
                organizationId: orgId,
              },
              orgId,
            );
          } catch (odoErr) {
            console.error("[maintenance-logs] odometer ledger projection failed:", odoErr);
          }
          return c.json({
            success: true,
            data: inserted,
            ledgerPosted: ledgerResult.posted,
            ledgerWarning: ledgerResult.failed
              ? "Service saved but not posted to books — contact support if this persists"
              : undefined,
          });
        }

        const actorId = rbacUserId(c);
        if (!actorId) return c.json({ code: "actor_required", error: "Actor required" }, 401);
        const [inspectionFindingsEnabled, itemsEnabled] = await Promise.all([
          isFeatureEnabled(FEATURE_FLAGS.INSPECTION_FINDINGS, orgId),
          isFeatureEnabled(FEATURE_FLAGS.SERVICE_ITEMS, orgId),
        ]);
        const findingsBlocked = await inspectionFindingsOffResponse(
          c,
          orgId,
          rawLines,
          inspectionFindingsEnabled,
        );
        if (findingsBlocked) return findingsBlocked;
        const woId = crypto.randomUUID();
        const prepared = await prepareWorkOrderLines(supabase, {
          orgId,
          vehicleId,
          workOrderId: null,
          rawLines,
          itemsEnabled,
        });
        if (!prepared.ok) {
          return c.json({ code: prepared.code, error: prepared.error }, prepared.status);
        }
        const partFitBlocked = await partsGapsLinePartFitGuard(
          c,
          supabase,
          orgId,
          vehicleId,
          null,
          rawLines,
        );
        if (partFitBlocked) return partFitBlocked;
        const discount = parseDiscount(log.discount ?? log.discount_amount) ?? 0;
        const logModeDb = logMode === "package" ? "package" : "quick_job";
        const packageComplete = logModeDb === "package" && !!templateId;
        const saveStatus = jobCompleted ? "in_progress" : "draft";
        const templateParsed = templateId && isUuid(templateId)
          ? { ok: true as const, value: templateId }
          : { ok: true as const, value: null as string | null };
        const pWorkOrder: Record<string, unknown> = {
          id: woId,
          vehicle_id: vehicleId,
          log_mode: logModeDb,
          idempotency_key: idempotencyKey || null,
          performed_at_date,
          odometer: performed_at_miles,
          provider: log.provider != null ? String(log.provider) : null,
          currency,
          template_id: templateParsed.value,
          package_complete: packageComplete || log.packageComplete === true || log.package_complete === true,
          notes: log.notes != null ? String(log.notes) : null,
          invoice_url: log.invoiceUrl != null ? String(log.invoiceUrl) : null,
          discount_amount: discount,
        };
        const saveRes = await callSaveWorkOrder(supabase, {
          orgId,
          actorId,
          status: saveStatus,
          workOrderId: null,
          expectedVersion: null,
          workOrder: pWorkOrder,
          lines: prepared.lines,
        });
        if (!saveRes.ok) {
          if (idempotencyKey) {
            const raced = await findWorkOrderByIdempotency(supabase, orgId, idempotencyKey);
            if (raced && String(raced.status) === "in_progress") {
              const completeRes = await internalWorkOrderCompleteRequest(app, c, String(raced.id), {
                recordId: await legacyCompleteRecordId(supabase, id, String(raced.id), orgId, vehicleId),
                type: log.type,
                payloadExtra: legacyMaintenanceLogPayloadExtra(log),
              });
              if (!completeRes.ok) {
                const errBody = await completeRes.json().catch(() => ({}));
                return c.json(errBody, completeRes.status as 200);
              }
              const completeJson = await completeRes.json() as Record<string, unknown>;
              return c.json({
                success: true,
                data: completeJson.record,
                workOrderId: raced.id,
                lines: (completeJson.item as { lines?: unknown })?.lines ?? [],
                warrantyPrompts: completeJson.warrantyPrompts,
                stockWarnings: completeJson.stockWarnings,
                ledgerPosted: completeJson.ledgerPosted,
                ledgerWarning: completeJson.ledgerWarning,
                idempotentReplay: true,
              });
            }
          }
          return c.json({ code: saveRes.code, error: saveRes.error }, saveRes.status);
        }
        const workOrderId = String((saveRes.data.work_order as Record<string, unknown>).id ?? woId);
        const savedRpcLines = Array.isArray(saveRes.data.lines) ? saveRes.data.lines : [];
        const savedLines = buildClientPayloadLines(rawLines, savedRpcLines);

        if (jobCompleted) {
          const recordId = await legacyCompleteRecordId(supabase, id, workOrderId, orgId, vehicleId);
          const completeRes = await internalWorkOrderCompleteRequest(app, c, workOrderId, {
            recordId,
            type: log.type,
            payloadExtra: legacyMaintenanceLogPayloadExtra(log),
          });
          if (!completeRes.ok) {
            const errBody = await completeRes.json().catch(() => ({}));
            return c.json(errBody, completeRes.status as 200);
          }
          const completeJson = await completeRes.json() as Record<string, unknown>;
          return c.json({
            success: true,
            data: completeJson.record,
            workOrderId,
            lines: (completeJson.item as { lines?: unknown })?.lines ?? savedLines,
            warrantyPrompts: completeJson.warrantyPrompts,
            stockWarnings: completeJson.stockWarnings,
            ledgerPosted: completeJson.ledgerPosted,
            ledgerWarning: completeJson.ledgerWarning,
          });
        }

        const cost = serviceNetTotal(prepared.lines, discount);
        const payload_json = {
          ...log,
          id,
          vehicleId,
          currency,
          status,
          cost,
          lines: savedLines,
          workOrderId,
        };
        const { data: inserted, error: insErr } = await supabase
          .from("maintenance_records")
          .insert({
            id,
            organization_id: orgId,
            vehicle_id: vehicleId,
            template_id: templateId || null,
            performed_at_miles,
            performed_at_date,
            cost,
            currency,
            service_type: log.type != null ? String(log.type) : null,
            provider: log.provider != null ? String(log.provider) : null,
            notes: log.notes != null ? String(log.notes) : null,
            invoice_url: log.invoiceUrl != null ? String(log.invoiceUrl) : null,
            status,
            legacy_kv_id: null,
            work_order_id: workOrderId,
            payload_json,
            updated_at: new Date().toISOString(),
          })
          .select()
          .single();
        if (insErr) throw insErr;

        return c.json({
          success: true,
          data: inserted,
          workOrderId,
          lines: savedLines,
          warrantyPrompts: [],
          stockWarnings: [],
          ledgerPosted: false,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.patch(
    "/maintenance-logs/:vehicleId/:id",
    requireAuth(),
    requirePermission("vehicles.edit"),
    async (c) => {
      try {
        const vehicleId = c.req.param("vehicleId");
        const id = c.req.param("id");
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const body = (await c.req.json()) as Record<string, unknown>;

        const { data: existing, error: fetchErr } = await supabase
          .from("maintenance_records")
          .select("*")
          .eq("id", id)
          .eq("vehicle_id", vehicleId)
          .eq("organization_id", orgId)
          .maybeSingle();
        if (fetchErr) throw fetchErr;
        if (!existing) return c.json({ error: "Maintenance record not found" }, 404);

        const prevPayloadEarly = (existing.payload_json && typeof existing.payload_json === "object")
          ? existing.payload_json as Record<string, unknown>
          : {};

        const prevStatus = String(existing.status ?? "").trim().toLowerCase();
        if (prevStatus === "completed") {
          const hasDiscountField = body.discount !== undefined
            || body.discount_amount !== undefined
            || body.discountAmount !== undefined;
          if (hasDiscountField) {
            const woIdForDiscount = prevPayloadEarly.workOrderId != null
              ? String(prevPayloadEarly.workOrderId)
              : "";
            let storedDiscount = 0;
            if (isUuid(woIdForDiscount)) {
              const { data: woRow } = await supabase
                .from("maintenance_work_orders")
                .select("discount_amount")
                .eq("id", woIdForDiscount)
                .maybeSingle();
              storedDiscount = Number(
                (woRow as { discount_amount?: number } | null)?.discount_amount ?? 0,
              );
            }
            const requested = parseDiscount(
              body.discount ?? body.discount_amount ?? body.discountAmount,
            );
            if (requested === null) {
              return c.json({ code: "discount_invalid" }, 400);
            }
            if (requested !== storedDiscount) {
              return c.json(
                {
                  code: "discount_locked",
                  error: "A saved service's discount can't be changed. Delete the service and log it again.",
                },
                409,
              );
            }
          }
          return c.json(
            { error: "Completed services can't be changed — void it and log again.", code: "immutable" },
            409,
          );
        }

        const nextStatus = body.status != null ? String(body.status) : String(existing.status ?? "Completed");
        const nextStatusLc = nextStatus.trim().toLowerCase();

        const performed_at_date = body.date != null
          ? String(body.date).slice(0, 10)
          : String(existing.performed_at_date ?? todayIso()).slice(0, 10);
        const performed_at_miles = body.odo != null
          ? Number(body.odo)
          : Number(existing.performed_at_miles ?? 0);

        const prevPayload = (existing.payload_json && typeof existing.payload_json === "object")
          ? existing.payload_json as Record<string, unknown>
          : {};
        const lines = body.lines !== undefined
          ? body.lines
          : prevPayload.lines;

        const currencyRaw = body.currency != null
          ? String(body.currency).trim().toUpperCase()
          : String((existing as { currency?: string }).currency ?? "JMD").trim().toUpperCase();
        const currency = currencyRaw || "JMD";
        const service_type = body.type != null
          ? String(body.type)
          : (existing.service_type != null ? String(existing.service_type) : null);
        const provider = body.provider != null
          ? String(body.provider)
          : (existing.provider != null ? String(existing.provider) : null);
        const notes = body.notes != null
          ? String(body.notes)
          : (existing.notes != null ? String(existing.notes) : null);
        const invoice_url = body.invoiceUrl != null
          ? String(body.invoiceUrl)
          : (existing.invoice_url != null ? String(existing.invoice_url) : null);
        const templateId = body.templateId != null
          ? String(body.templateId)
          : (existing.template_id != null ? String(existing.template_id) : null);
        const logMode = body.logMode != null
          ? String(body.logMode)
          : (prevPayload.logMode != null ? String(prevPayload.logMode) : null);

        const jobCompleted = nextStatusLc === "completed";
        const rawEditLines = Array.isArray(lines) ? lines as unknown[] : [];
        let editWorkOrderId = (existing as { work_order_id?: string | null }).work_order_id != null
          ? String((existing as { work_order_id: string }).work_order_id)
          : (prevPayload.workOrderId != null ? String(prevPayload.workOrderId) : "");

        if (rawEditLines.length || isUuid(editWorkOrderId)) {
          const evRaw = body.expectedVersion ?? body.expected_version;
          if (isUuid(editWorkOrderId) && (evRaw == null || evRaw === "")) {
            return c.json({ code: "version_required", error: "Reload this service and try again." }, 428);
          }
          const actorId = rbacUserId(c);
          if (!actorId) return c.json({ code: "actor_required", error: "Actor required" }, 401);

          const [inspectionFindingsEnabled, itemsEnabled] = await Promise.all([
            isFeatureEnabled(FEATURE_FLAGS.INSPECTION_FINDINGS, orgId),
            isFeatureEnabled(FEATURE_FLAGS.SERVICE_ITEMS, orgId),
          ]);
          const findingsBlocked = await inspectionFindingsOffResponse(
            c,
            orgId,
            rawEditLines,
            inspectionFindingsEnabled,
            editWorkOrderId,
            supabase,
          );
          if (findingsBlocked) return findingsBlocked;
          let workOrderId = editWorkOrderId;
          if (!isUuid(workOrderId) && rawEditLines.length) {
            workOrderId = crypto.randomUUID();
          }

          const prepared = rawEditLines.length
            ? await prepareWorkOrderLines(supabase, {
              orgId,
              vehicleId,
              workOrderId: isUuid(editWorkOrderId) ? editWorkOrderId : null,
              rawLines: rawEditLines,
              itemsEnabled,
            })
            : { ok: true as const, lines: await loadWorkOrderLinesForRpc(supabase, workOrderId) };

          if (!prepared.ok) {
            return c.json({ code: prepared.code, error: prepared.error }, prepared.status);
          }
          // S5: editing a logged service checks a newly chosen part fits the car, like every other save.
          if (rawEditLines.length) {
            const partFitBlocked = await partsGapsLinePartFitGuard(
              c,
              supabase,
              orgId,
              vehicleId,
              isUuid(editWorkOrderId) ? editWorkOrderId : null,
              rawEditLines,
            );
            if (partFitBlocked) return partFitBlocked;
          }

          let storedDiscount = 0;
          if (isUuid(editWorkOrderId)) {
            const { data: woDiscountRow } = await supabase
              .from("maintenance_work_orders")
              .select("discount_amount")
              .eq("id", editWorkOrderId)
              .maybeSingle();
            storedDiscount = Number(
              (woDiscountRow as { discount_amount?: number } | null)?.discount_amount ?? 0,
            );
          }
          if (prepared.lines.length && discountTooLarge(prepared.lines, storedDiscount)) {
            return discountTooLargeResponse(c);
          }

          const logModeDb = logMode === "package" ? "package" : "quick_job";
          const saveStatus = jobCompleted ? "in_progress" : "draft";
          const pWorkOrder: Record<string, unknown> = {
            id: workOrderId,
            vehicle_id: vehicleId,
            log_mode: logModeDb,
            performed_at_date,
            odometer: performed_at_miles,
            provider,
            currency,
            template_id: templateId && isUuid(templateId) ? templateId : null,
            notes,
            invoice_url,
            discount_amount: storedDiscount,
          };
          if (body.packageComplete !== undefined || body.package_complete !== undefined) {
            pWorkOrder.package_complete = body.packageComplete === true || body.package_complete === true;
          }

          const saveRes = await callSaveWorkOrder(supabase, {
            orgId,
            actorId,
            status: saveStatus,
            workOrderId: isUuid(editWorkOrderId) ? editWorkOrderId : null,
            expectedVersion: isUuid(editWorkOrderId) ? Number(evRaw) : null,
            workOrder: pWorkOrder,
            lines: prepared.lines,
          });
          if (!saveRes.ok) {
            return c.json({ code: saveRes.code, error: saveRes.error }, saveRes.status);
          }

          workOrderId = String((saveRes.data.work_order as Record<string, unknown>).id ?? workOrderId);
          const savedRpcLines = Array.isArray(saveRes.data.lines) ? saveRes.data.lines : [];
          const savedLines = buildClientPayloadLines(rawEditLines, savedRpcLines);
          const cost = serviceNetTotal(prepared.lines, storedDiscount);

          if (jobCompleted) {
            const completeRes = await internalWorkOrderCompleteRequest(app, c, workOrderId, {
              recordId: id,
              type: service_type,
              payloadExtra: legacyMaintenanceLogPayloadExtra({ ...prevPayload, ...body }),
            });
            if (!completeRes.ok) {
              const errBody = await completeRes.json().catch(() => ({}));
              return c.json(errBody, completeRes.status as 200);
            }
            const completeJson = await completeRes.json() as Record<string, unknown>;
            return c.json({
              success: true,
              data: completeJson.record,
              lines: (completeJson.item as { lines?: unknown })?.lines ?? savedLines,
              warrantyPrompts: completeJson.warrantyPrompts,
              stockWarnings: completeJson.stockWarnings,
              ledgerPosted: completeJson.ledgerPosted,
              ledgerWarning: completeJson.ledgerWarning,
            });
          }

          const payload_json = {
            ...prevPayload,
            ...body,
            id,
            vehicleId,
            date: performed_at_date,
            odo: performed_at_miles,
            cost,
            currency,
            type: service_type,
            provider,
            notes,
            invoiceUrl: invoice_url,
            templateId: templateId || undefined,
            status: nextStatus,
            lines: savedLines,
            logMode: logMode || undefined,
            workOrderId,
          };

          const { data: updated, error: upErr } = await supabase
            .from("maintenance_records")
            .update({
              performed_at_miles,
              performed_at_date,
              cost,
              currency,
              service_type,
              provider,
              notes,
              invoice_url,
              status: nextStatus,
              template_id: templateId || null,
              work_order_id: workOrderId,
              payload_json,
              updated_at: new Date().toISOString(),
            })
            .eq("id", id)
            .eq("vehicle_id", vehicleId)
            .eq("organization_id", orgId)
            .select()
            .single();
          if (upErr) throw upErr;

          return c.json({
            success: true,
            data: updated,
            lines: savedLines,
            warrantyPrompts: [],
            stockWarnings: [],
            ledgerPosted: false,
          });
        }

        const cost = body.cost !== undefined
          ? (body.cost != null ? Number(body.cost) : null)
          : (existing.cost != null ? Number(existing.cost) : null);
        const payload_json = {
          ...prevPayload,
          ...body,
          id,
          vehicleId,
          date: performed_at_date,
          odo: performed_at_miles,
          cost,
          currency,
          type: service_type,
          provider,
          notes,
          invoiceUrl: invoice_url,
          templateId: templateId || undefined,
          status: nextStatus,
          logMode: logMode || undefined,
        };
        const { data: updated, error: upErr } = await supabase
          .from("maintenance_records")
          .update({
            performed_at_miles,
            performed_at_date,
            cost,
            currency,
            service_type,
            provider,
            notes,
            invoice_url,
            status: nextStatus,
            template_id: templateId || null,
            payload_json,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id)
          .eq("vehicle_id", vehicleId)
          .eq("organization_id", orgId)
          .select()
          .single();
        if (upErr) throw upErr;

        await deleteCanonicalLedgerBySource("financial_event", [id]);
        const ledgerInput = {
          id,
          vehicleId,
          performed_at_date,
          cost,
          status: nextStatus,
          currency,
          service_type,
          provider,
        };
        let ledgerPosted = false;
        let ledgerWarning: string | undefined;
        if (isMaintenanceLedgerEligible(ledgerInput)) {
          const ledgerResult = await appendCanonicalMaintenanceIfEligible(ledgerInput, c);
          ledgerPosted = ledgerResult.posted;
          if (ledgerResult.failed) {
            ledgerWarning = "Service updated but not posted to books — contact support if this persists";
          }
        }

        try {
          await projectFromMaintenanceLog(
            {
              id,
              vehicleId,
              odometer: performed_at_miles,
              date: performed_at_date,
              serviceType: service_type,
              organizationId: orgId,
            },
            orgId,
          );
        } catch (odoErr) {
          console.error("[maintenance-logs PATCH] odometer ledger projection failed:", odoErr);
        }

        return c.json({
          success: true,
          data: updated,
          ledgerPosted,
          ledgerWarning,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.delete(
    "/maintenance-logs/:vehicleId/:id",
    requireAuth(),
    requirePermission("vehicles.edit"),
    async (c) => {
      try {
        const vehicleId = c.req.param("vehicleId");
        const id = c.req.param("id");
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const { data: existing, error: fetchErr } = await supabase
          .from("maintenance_records")
          .select("status")
          .eq("id", id)
          .eq("vehicle_id", vehicleId)
          .eq("organization_id", orgId)
          .maybeSingle();
        if (fetchErr) throw fetchErr;
        if (existing && String(existing.status ?? "").trim().toLowerCase() === "completed") {
          return c.json(
            { error: "Completed services can't be changed — void it and log again.", code: "immutable" },
            409,
          );
        }
        const { error } = await supabase
          .from("maintenance_records")
          .delete()
          .eq("id", id)
          .eq("vehicle_id", vehicleId)
          .eq("organization_id", orgId);
        if (error) throw error;
        // Clean books even if UI retries after DB delete succeeded
        try {
          await deleteCanonicalLedgerBySource("financial_event", [id]);
        } catch (ledgerErr) {
          console.error("[maintenance] ledger delete after record delete failed:", ledgerErr);
        }
        try {
          await voidOdometerReading(
            { vehicleId, source: "service", referenceId: id },
            "Maintenance record deleted",
          );
        } catch (odoErr) {
          console.error("[maintenance] odometer ledger void after delete failed:", odoErr);
        }
        return c.json({ success: true });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  // -------------------------------------------------------------------------
  // Driver service requests → maintenance_records (status Requested, no ledger)
  // -------------------------------------------------------------------------
  route.post(
    "/maintenance-requests",
    requireAuth({ requireOrg: true }),
    async (c) => {
      try {
        const body = (await c.req.json()) as Record<string, unknown>;
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const rbacUser = c.get("rbacUser") as { userId?: string } | undefined;
        const driverId = String(rbacUser?.userId ?? "").trim();
        if (!driverId) return c.json({ error: "Unauthorized" }, 401);

        const { resolveDriverVehicleAssignment } = await import("./driver_vehicle_assignment.ts");
        const hintVehicleId = body.vehicleId != null ? String(body.vehicleId).trim() : undefined;
        const resolved = await resolveDriverVehicleAssignment(driverId, {
          organizationId: orgId,
          hintVehicleId: hintVehicleId || undefined,
        });
        const vehicleId = resolved.vehicleId;
        if (!vehicleId) {
          return c.json({
            error: "No assigned vehicle",
            code: "NO_ASSIGNED_VEHICLE",
            message: "You need an assigned vehicle before requesting service.",
          }, 400);
        }

        // Catalog gate — clear 4xx when unmatched (same philosophy as log create)
        const catalogId = await resolveCatalogIdForKvVehicle(
          supabase,
          { id: vehicleId, ...(resolved.vehicle || {}) },
        );
        if (!catalogId) {
          return c.json({
            error: "Vehicle is not matched to the motor catalog",
            code: "CATALOG_UNMATCHED",
            message: "Ask a fleet manager to link this vehicle to the catalog before requesting service.",
          }, 400);
        }

        const id = crypto.randomUUID();
        const performed_at_date = String(body.date ?? todayIso()).slice(0, 10);
        const performed_at_miles = Number(body.odometer ?? body.odo ?? 0);
        const serviceType = body.type != null ? String(body.type) : "Maintenance";
        const description = body.description != null ? String(body.description) : "";
        const priority = body.priority != null ? String(body.priority) : "Medium";
        const notes = [description, priority ? `Priority: ${priority}` : ""].filter(Boolean).join("\n");

        const payload_json = {
          source: "driver_service_request",
          driverId,
          priority,
          type: serviceType,
          description,
          date: performed_at_date,
          odo: performed_at_miles,
          vehicleId,
          id,
          status: "Requested",
        };

        const rowInsert = {
          id,
          organization_id: orgId,
          vehicle_id: vehicleId,
          template_id: null as string | null,
          performed_at_miles,
          performed_at_date,
          cost: null as number | null,
          currency: "JMD",
          service_type: serviceType,
          provider: "Driver Request",
          notes,
          invoice_url: null as string | null,
          status: "Requested",
          legacy_kv_id: null as string | null,
          payload_json,
          updated_at: new Date().toISOString(),
        };

        const { data: inserted, error: insErr } = await supabase
          .from("maintenance_records")
          .insert(rowInsert)
          .select()
          .single();
        if (insErr) throw insErr;

        // Phase 6: open a draft work order so fleet completes via garage job card
        let workOrderId: string | null = null;
        try {
          const woId = crypto.randomUUID();
          const { error: woErr } = await supabase.from("maintenance_work_orders").insert({
            id: woId,
            organization_id: orgId,
            vehicle_id: vehicleId,
            status: "draft",
            performed_at_date,
            odometer: performed_at_miles,
            provider: "Driver Request",
            currency: "JMD",
            log_mode: "quick_job",
            package_complete: false,
            notes,
            maintenance_record_id: id,
            source: "driver_request",
            payload_json: {
              ...payload_json,
              workOrderId: woId,
            },
            updated_at: new Date().toISOString(),
          });
          if (!woErr) {
            workOrderId = woId;
            await supabase
              .from("maintenance_records")
              .update({
                payload_json: { ...payload_json, workOrderId: woId },
                updated_at: new Date().toISOString(),
              })
              .eq("id", id);
          } else {
            console.error("[maintenance-requests] draft WO:", woErr.message);
          }
        } catch (woCreateErr: unknown) {
          console.error("[maintenance-requests] draft WO:", woCreateErr);
        }

        // Never post Requested rows to the ledger
        return c.json({ success: true, data: inserted, workOrderId });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.get(
    "/maintenance-requests",
    requireAuth(),
    requirePermission("vehicles.edit"),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const status = String(c.req.query("status") || "Requested").trim() || "Requested";
        const { data, error } = await supabase
          .from("maintenance_records")
          .select("*")
          .eq("organization_id", orgId)
          .eq("status", status)
          .order("created_at", { ascending: false })
          .limit(200);
        if (error) throw error;
        const rows = (data || []) as Record<string, unknown>[];
        const woIds = new Set<string>();
        for (const row of rows) {
          const direct = row.work_order_id;
          if (direct != null && isUuid(String(direct))) woIds.add(String(direct));
          const payload = row.payload_json;
          if (payload && typeof payload === "object") {
            const wo = (payload as Record<string, unknown>).workOrderId;
            if (wo != null && isUuid(String(wo))) woIds.add(String(wo));
          }
        }
        const versionByWoId = new Map<string, number>();
        if (woIds.size > 0) {
          const { data: woRows, error: woErr } = await supabase
            .from("maintenance_work_orders")
            .select("id, version")
            .in("id", [...woIds]);
          if (woErr) throw woErr;
          for (const wo of woRows || []) {
            const w = wo as { id: string; version?: number };
            if (typeof w.version === "number" && Number.isFinite(w.version)) {
              versionByWoId.set(String(w.id), w.version);
            }
          }
        }
        const enriched = rows.map((row) => {
          let woId = row.work_order_id != null ? String(row.work_order_id) : "";
          if (!isUuid(woId) && row.payload_json && typeof row.payload_json === "object") {
            const fromPayload = (row.payload_json as Record<string, unknown>).workOrderId;
            if (fromPayload != null) woId = String(fromPayload);
          }
          const version = isUuid(woId) ? versionByWoId.get(woId) : undefined;
          return version != null ? { ...row, version } : row;
        });
        return c.json({ data: enriched });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );


  // Fleet summary for Maintenance hub (all vehicles in org with odometer + status)
  route.get(
    "/maintenance-fleet-summary",
    requireAuth(),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);

        const vehicles = await loadFleetVehiclesForOrg(orgId);
        const { data: dndVehicleRows } = await fleetDb()
          .from("vehicles")
          .select("id, do_not_drive, do_not_drive_reason, do_not_drive_set_at")
          .eq("organization_id", orgId);
        const doNotDriveByVehicle = new Map<string, {
          doNotDrive: boolean;
          doNotDriveReason?: string | null;
          doNotDriveSetAt?: string | null;
        }>();
        for (const row of dndVehicleRows || []) {
          const id = String((row as { id: string }).id ?? "");
          if (!id) continue;
          doNotDriveByVehicle.set(id, {
            doNotDrive: (row as { do_not_drive?: boolean }).do_not_drive === true,
            doNotDriveReason: (row as { do_not_drive_reason?: string | null }).do_not_drive_reason ?? null,
            doNotDriveSetAt: (row as { do_not_drive_set_at?: string | null }).do_not_drive_set_at ?? null,
          });
        }
        const trustedOdo = await loadTrustedOdometerMap(orgId);
        const dueSoonSettings = await loadOrgDueSoonSettings(orgId);
        const nightlyRun = await loadLatestMaintenanceJobRun(orgId);

        let dueRows: Record<string, unknown>[] = [];
        const { data: dueData, error: dueErr } = await fleetDb()
          .from("fleet_maintenance_due_v")
          .select("*")
          .eq("organization_id", orgId)
          .limit(5000);
        if (!dueErr && dueData) dueRows = dueData as Record<string, unknown>[];

        const { data: lastServices } = await supabase
          .from("maintenance_work_orders")
          .select("vehicle_id, performed_at_date, odometer")
          .eq("organization_id", orgId)
          .eq("status", "completed")
          .is("voided_at", null)
          .order("performed_at_date", { ascending: false })
          .limit(500);

        const lastServiceByVehicle = new Map<string, { date: string; miles: number | null }>();
        for (const row of lastServices || []) {
          const vid = String((row as { vehicle_id: string }).vehicle_id ?? "");
          if (!vid || lastServiceByVehicle.has(vid)) continue;
          lastServiceByVehicle.set(vid, {
            date: String((row as { performed_at_date: string }).performed_at_date ?? "").slice(0, 10),
            miles: (row as { odometer: number | null }).odometer,
          });
        }

        const odoMaps = await loadOdometerSupplementMaps(supabase, c);

        const { data: schedules } = await supabase
          .from("vehicle_maintenance_schedule")
          .select("vehicle_id, next_due_miles, next_due_miles_max, next_due_date, template_id, schedule_status")
          .eq("organization_id", orgId);

        const { data: componentSchedules } = await supabase
          .from("vehicle_component_schedule")
          .select(
            "vehicle_id, position, next_due_km, next_due_km_max, next_due_date, schedule_status, rule_id, category:maintenance_service_categories(id, code, name)",
          )
          .eq("organization_id", orgId);

        const compRuleIds = [
          ...new Set((componentSchedules || []).map((s) => s.rule_id).filter(Boolean)),
        ] as string[];
        const compRulesById = new Map<string, Record<string, unknown>>();
        if (compRuleIds.length) {
          const { data: compRules } = await supabase
            .from("maintenance_task_templates")
            .select("id, source_type, status")
            .in("id", compRuleIds);
          for (const r of compRules || []) compRulesById.set(String(r.id), r as Record<string, unknown>);
        }
        const { computeDominionScheduleStatus } = await import("./maintenance_master_fleet_enrich.ts");

        const byVehicle: Record<string, Record<string, unknown>[]> = {};
        for (const s of schedules || []) {
          const vid = s.vehicle_id as string;
          if (!byVehicle[vid]) byVehicle[vid] = [];
          byVehicle[vid].push(s as Record<string, unknown>);
        }

        const componentsByVehicle: Record<string, Record<string, unknown>[]> = {};
        for (const s of componentSchedules || []) {
          const vid = String(s.vehicle_id ?? "");
          if (!vid) continue;
          if (!componentsByVehicle[vid]) componentsByVehicle[vid] = [];
          componentsByVehicle[vid].push(s as Record<string, unknown>);
        }

        const templateIds = [...new Set((schedules || []).map((s) => s.template_id).filter(Boolean))] as string[];
        const { data: fleetTplRows } = templateIds.length
          ? await supabase
            .from("maintenance_task_templates")
            .select("id, task_name")
            .in("id", templateIds)
            .is("component_id", null)
          : { data: [] as { id: string; task_name?: string | null }[] };
        const fleetTplById: Record<string, string> = {};
        for (const t of fleetTplRows || []) {
          const id = String((t as { id: string }).id);
          fleetTplById[id] = String((t as { task_name?: string | null }).task_name ?? "").trim() || "Service";
        }

        const today = todayIso();
        const items = await Promise.all(vehicles.map(async (v) => {
          const vid = String(v.id ?? "");
          const metricsBase = 0;
          const trusted = trustedOdo.get(vid);
          const odo = trusted?.reading ?? canonicalOdometerFromMaps(vid, metricsBase, odoMaps);
          const vehicleDue = dueRows.filter((r) => String(r.vehicle_id) === vid);
          const sch = byVehicle[vid] || [];
          const compRows = componentsByVehicle[vid] || [];
          const attention: FleetServiceAttentionItem[] = [];
          let maxCalendarDaysOverdue: number | null = null;
          let maxKmOverdue: number | null = null;

          if (vehicleDue.length) {
            for (const row of vehicleDue) {
              const st = String(row.due_status ?? "ok");
              if (st === "overdue" || st === "due_soon") {
                const name = String(row.category_name ?? row.category_code ?? "Service");
                const pos = row.position != null ? String(row.position) : "";
                const taskName = pos ? `${name} (${pos})` : name;
                attention.push({
                  kind: st === "overdue" ? "overdue" : "due_soon",
                  taskName,
                });
              }
              if (row.days_overdue != null) {
                const d = Number(row.days_overdue);
                maxCalendarDaysOverdue = maxCalendarDaysOverdue == null ? d : Math.max(maxCalendarDaysOverdue, d);
              }
              if (row.km_overdue != null) {
                const k = Number(row.km_overdue);
                maxKmOverdue = maxKmOverdue == null ? k : Math.max(maxKmOverdue, k);
              }
            }
          }

          const statuses: Array<"ok" | "pending" | "overdue" | "fulfilled"> = [];
          for (const row of sch) {
            const nextMiles = row.next_due_miles != null ? Number(row.next_due_miles) : null;
            const nextMilesMaxRaw = row.next_due_miles_max != null ? Number(row.next_due_miles_max) : null;
            const nextDate = row.next_due_date != null ? String(row.next_due_date).slice(0, 10) : null;
            const schSt = row.schedule_status != null ? String(row.schedule_status) : "active";
            const a = analyzeMaintenanceScheduleRow(odo, today, nextMiles, nextMilesMaxRaw, nextDate, schSt);
            if (a.calendarDaysOverdue != null) {
              maxCalendarDaysOverdue = maxCalendarDaysOverdue == null
                ? a.calendarDaysOverdue
                : Math.max(maxCalendarDaysOverdue, a.calendarDaysOverdue);
            }
            if (a.kmOverdue != null) {
              maxKmOverdue = maxKmOverdue == null ? a.kmOverdue : Math.max(maxKmOverdue, a.kmOverdue);
            }
            const tid = String(row.template_id ?? "");
            const taskName = fleetTplById[tid] ?? "Service";
            if (a.status === "overdue" || a.status === "pending") {
              const kind = a.status === "overdue" ? "overdue" as const : "due_soon" as const;
              let expanded = false;
              if (tid) {
                try {
                  const checklist = await getPackageChecklist({
                    sb: supabase,
                    organizationId: orgId,
                    vehicleId: vid,
                    templateId: tid,
                    currentOdo: odo,
                    today,
                  });
                  const dueItems = checklist.filter(
                    (i) => i.status === "outstanding" || i.status === "partial",
                  );
                  for (const item of dueItems) {
                    const pos =
                      item.positionAware && item.outstandingPositions.length
                        ? ` (${item.outstandingPositions.join(", ")})`
                        : "";
                    attention.push({
                      kind,
                      taskName: `${item.categoryName}${pos}`,
                    });
                    expanded = true;
                  }
                } catch {
                  /* fall through */
                }
              }
              if (!expanded) attention.push({ kind, taskName });
            }
            statuses.push(a.status);
          }

          // Component / corner schedules (service ledger truth) — fill Overdue / Services due
          // even when package schedule rows are missing.
          let minComponentNext: number | null = null;
          for (const row of compRows) {
            const schSt = row.schedule_status != null ? String(row.schedule_status) : "active";
            if (schSt === "retired") continue;
            const nextMiles = row.next_due_km != null ? Number(row.next_due_km) : null;
            const nextMilesMaxRaw = row.next_due_km_max != null ? Number(row.next_due_km_max) : null;
            const nextDate = row.next_due_date != null ? String(row.next_due_date).slice(0, 10) : null;
            const a = analyzeMaintenanceScheduleRow(odo, today, nextMiles, nextMilesMaxRaw, nextDate, schSt);
            if (a.calendarDaysOverdue != null) {
              maxCalendarDaysOverdue = maxCalendarDaysOverdue == null
                ? a.calendarDaysOverdue
                : Math.max(maxCalendarDaysOverdue, a.calendarDaysOverdue);
            }
            if (a.kmOverdue != null) {
              maxKmOverdue = maxKmOverdue == null ? a.kmOverdue : Math.max(maxKmOverdue, a.kmOverdue);
            }
            if (nextMiles != null && Number.isFinite(nextMiles) && schSt !== "fulfilled") {
              minComponentNext =
                minComponentNext == null ? nextMiles : Math.min(minComponentNext, nextMiles);
            }
            if (a.status === "overdue" || a.status === "pending") {
              const cat = row.category as { name?: string; code?: string } | null;
              const baseName = String(cat?.name || cat?.code || "Service").trim() || "Service";
              const pos = row.position != null ? String(row.position) : "";
              const taskName = pos ? `${baseName} (${pos})` : baseName;
              const kind = a.status === "overdue" ? "overdue" as const : "due_soon" as const;
              // Avoid duplicate labels already added from package checklist
              if (!attention.some((x) => x.taskName === taskName && x.kind === kind)) {
                attention.push({ kind, taskName });
              }
              statuses.push(a.status);
            } else if (a.status === "ok" || a.status === "fulfilled") {
              statuses.push(a.status);
            }
          }

          const hasAnySchedule = sch.length > 0 || compRows.length > 0;
          const dueStatuses = vehicleDue.map((r) => String(r.due_status ?? "ok"));
          const st = dueStatuses.length
            ? aggregateFleetStatusFromDue(dueStatuses)
            : (hasAnySchedule
              ? aggregateFleetStatus(statuses.map((s) => ({ status: s })))
              : "No schedule");
          const worstDue = pickWorstMaintenanceDueRow(
            vehicleDue.map((r) => ({
              category_name: r.category_name,
              due_status: r.due_status,
              km_overdue: r.km_overdue,
              days_overdue: r.days_overdue,
            })),
          );
          const nextDueSummary = formatWorstDueSummary(worstDue);
          const worstDueTaskName = worstDue?.category_name
            ? String(worstDue.category_name)
            : null;
          const eligibleForNext = sch.filter((r) => String(r.schedule_status ?? "active") !== "fulfilled");
          const minPkg = eligibleForNext.length
            ? eligibleForNext
              .map((r) => r.next_due_miles != null ? Number(r.next_due_miles) : Infinity)
              .reduce((a, b) => Math.min(a, b), Infinity)
            : Infinity;
          const nextOdoCandidates = [minPkg, minComponentNext ?? Infinity].filter((n) => n !== Infinity);
          const nextOdo = nextOdoCandidates.length ? Math.min(...nextOdoCandidates) : null;
          const sortedAttention = sortFleetServiceAttention(attention);
          const servicesAttentionTruncated = sortedAttention.length > FLEET_SERVICES_ATTENTION_CAP;
          const servicesAttention = sortedAttention.slice(0, FLEET_SERVICES_ATTENTION_CAP);
          const hasOdoReading = (trusted?.reading ?? (odo > 0 ? odo : 0)) > 0;
          const dominionScheduleStatus = computeDominionScheduleStatus(
            compRows,
            compRulesById,
            hasOdoReading,
          );
          return {
            vehicleId: vid,
            licensePlate: v.license_plate ?? undefined,
            make: v.make ?? undefined,
            model: v.model ?? undefined,
            year: v.year ?? undefined,
            fleetUnitId: v.fleet_unit_id ?? undefined,
            homeBase: v.home_base ?? undefined,
            odometer: trusted?.reading ?? (odo > 0 ? odo : 0),
            odometerMeta: trusted
              ? {
                reading: trusted.reading,
                recordedAt: trusted.recordedAt,
                source: trusted.source,
                sourceLabel: formatOdometerSourceLabel(trusted.source),
              }
              : null,
            fleetStatus: st,
            nextDueOdometer: nextOdo,
            nextDueSummary,
            worstDueTaskName,
            scheduleRowCount: sch.length + compRows.length,
            maxCalendarDaysOverdue,
            maxKmOverdue,
            lastService: lastServiceByVehicle.get(vid) ?? null,
            servicesAttention,
            servicesAttentionTruncated,
            dueCounts: {
              overdue: vehicleDue.filter((r) => r.due_status === "overdue").length,
              dueSoon: vehicleDue.filter((r) => r.due_status === "due_soon").length,
            },
            dominionScheduleStatus,
            severeDuty: (v as { severe_duty?: boolean }).severe_duty === true,
            ...(doNotDriveByVehicle.get(vid) ?? { doNotDrive: false }),
          };
        }));

        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
        const nowMs = Date.now();
        let telemetryMissingCount = 0;
        for (const row of items) {
          const meta = row.odometerMeta as { recordedAt?: string } | null | undefined;
          if (!meta?.recordedAt) {
            telemetryMissingCount += 1;
            continue;
          }
          const ts = Date.parse(meta.recordedAt);
          if (!Number.isFinite(ts) || nowMs - ts > sevenDaysMs) telemetryMissingCount += 1;
        }

        let nextScheduledDate: string | null = null;
        let nextScheduledVehicleId: string | null = null;
        for (const row of dueRows) {
          const st = String(row.due_status ?? "ok");
          if (st === "overdue") continue;
          const pd = row.projected_due_date != null ? String(row.projected_due_date).slice(0, 10) : null;
          if (!pd) continue;
          if (!nextScheduledDate || pd < nextScheduledDate) {
            nextScheduledDate = pd;
            nextScheduledVehicleId = String(row.vehicle_id ?? "");
          }
        }
        const nextVehicle = nextScheduledVehicleId
          ? vehicles.find((v) => String(v.id) === nextScheduledVehicleId)
          : null;
        const nextScheduledWindow = nextScheduledDate
          ? {
              date: nextScheduledDate,
              site: nextVehicle?.home_base?.trim() || nextVehicle?.license_plate?.trim() || "",
            }
          : null;

        const dueAttentionRows = dueRows.filter((r) => {
          const st = String(r.due_status ?? "ok");
          return st === "overdue" || st === "due_soon";
        });
        const catalogIds = [...new Set(vehicles.map((v) => String(v.vehicle_catalog_id ?? "")).filter(Boolean))];
        let partsReady = dueAttentionRows.length === 0;
        if (!partsReady && catalogIds.length > 0) {
          const { count, error: fitErr } = await supabase
            .from("part_fitment")
            .select("id", { count: "exact", head: true })
            .in("vehicle_catalog_id", catalogIds);
          partsReady = !fitErr && (count ?? 0) > 0;
        }
        const partsRequisition = {
          status: partsReady ? "Ready" as const : "Needs part numbers" as const,
          detail: partsReady ? "Catalogue linked" : "Add part numbers for due items",
        };

        let nearestDateBasedDays: number | null = null;
        const todayYmd = new Date().toISOString().slice(0, 10);
        for (const row of dueRows) {
          const st = String(row.due_status ?? "ok");
          if (st === "overdue" || st === "no_record") continue;
          const nd = row.next_due_date != null ? String(row.next_due_date).slice(0, 10) : null;
          if (!nd) continue;
          const daysUntil = Math.ceil(
            (Date.UTC(Number(nd.slice(0, 4)), Number(nd.slice(5, 7)) - 1, Number(nd.slice(8, 10)))
              - Date.UTC(
                Number(todayYmd.slice(0, 4)),
                Number(todayYmd.slice(5, 7)) - 1,
                Number(todayYmd.slice(8, 10)),
              )) / 86400000,
          );
          if (nearestDateBasedDays == null || daysUntil < nearestDateBasedDays) {
            nearestDateBasedDays = Math.max(0, daysUntil);
          }
        }
        const nextScheduledDateLine =
          nearestDateBasedDays != null
            ? `Time-based check due in ${nearestDateBasedDays} days`
            : null;

        return c.json({
          items,
          nightlyRun: nightlyRun ?? null,
          dueSoonKm: dueSoonSettings.dueSoonKm,
          dueSoonDays: dueSoonSettings.dueSoonDays,
          telemetryMissingCount,
          nextScheduledWindow,
          nextScheduledDateLine,
          partsRequisition,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  // -------------------------------------------------------------------------
  // Service ledger + outstanding (ops truth, not finance)
  // -------------------------------------------------------------------------
  route.get(
    "/maintenance-service-ledger",
    requireAuth(),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const vehicleId = c.req.query("vehicleId")?.trim() || "";
        const limit = Math.min(Number(c.req.query("limit") || 100) || 100, 500);
        let q = supabase
          .from("maintenance_service_ledger")
          .select("*")
          .eq("organization_id", orgId)
          .is("voided_at", null)
          .order("performed_at_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(limit);
        if (vehicleId) q = q.eq("vehicle_id", vehicleId);
        const { data, error } = await q;
        if (error) throw error;
        const items = (data || []).map((r) => ({
          id: r.id,
          organizationId: r.organization_id,
          vehicleId: r.vehicle_id,
          performedAtDate: r.performed_at_date,
          performedAtMiles: r.performed_at_miles != null ? Number(r.performed_at_miles) : null,
          categoryId: r.category_id,
          categoryCode: r.category_code,
          categoryName: r.category_name,
          position: r.position,
          action: r.action,
          templateId: r.template_id,
          maintenanceRecordId: r.maintenance_record_id,
          workOrderId: r.work_order_id,
          notes: r.notes,
          createdAt: r.created_at,
        }));
        return c.json({ items });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.get(
    "/maintenance-outstanding/:vehicleId",
    requireAuth(),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const vehicleId = c.req.param("vehicleId");
        const trustedOdo = orgId ? await loadTrustedOdometerMap(orgId) : new Map();
        const trusted = trustedOdo.get(vehicleId);
        const metricsBase = 0;
        const odo = trusted?.reading ?? await canonicalOdometerForVehicle(supabase, vehicleId, metricsBase, c);
        const today = todayIso();

        const { data: states, error } = await supabase
          .from("vehicle_component_schedule")
          .select("*, category:maintenance_service_categories(id, code, name, position_aware, icon_key)")
          .eq("organization_id", orgId)
          .eq("vehicle_id", vehicleId);
        if (error) throw error;

        const items = [];
        for (const row of states || []) {
          const st = analyzeComponentRowStatus(odo, today, {
            next_due_km: row.next_due_km as number | null,
            next_due_km_max: row.next_due_km_max as number | null,
            next_due_date: row.next_due_date as string | null,
            schedule_status: row.schedule_status as string | null,
          });
          if (st !== "pending" && st !== "overdue") continue;
          const cat = row.category as Record<string, unknown> | null;
          items.push({
            categoryId: String(row.category_id),
            categoryCode: cat?.code != null ? String(cat.code) : "",
            categoryName: cat?.name != null ? String(cat.name) : "",
            position: row.position != null ? String(row.position) : null,
            status: st,
            lastPerformedDate: row.last_performed_date
              ? String(row.last_performed_date).slice(0, 10)
              : null,
            lastPerformedMiles:
              row.last_performed_km != null ? Number(row.last_performed_km) : null,
            nextDueKm: row.next_due_km != null ? Number(row.next_due_km) : null,
            nextDueDate: row.next_due_date != null ? String(row.next_due_date).slice(0, 10) : null,
          });
        }
        return c.json({ vehicleId, odometer: odo, items });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.get(
    "/maintenance-package-checklist/:vehicleId/:templateId",
    requireAuth(),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const vehicleId = c.req.param("vehicleId");
        const templateId = c.req.param("templateId");
        const trustedOdo = await loadTrustedOdometerMap(orgId);
        const trusted = trustedOdo.get(vehicleId);
        const odo = trusted?.reading ?? await canonicalOdometerForVehicle(supabase, vehicleId, 0, c);
        const today = todayIso();
        const items = await getPackageChecklist({
          sb: supabase,
          organizationId: orgId,
          vehicleId,
          templateId,
          currentOdo: odo,
          today,
        });
        return c.json({ vehicleId, templateId, odometer: odo, items });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.post(
    "/maintenance-service-ledger/backfill",
    requireAuth(),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const result = await backfillServiceLedgerForOrg({
          sb: supabase,
          organizationId: orgId,
        });
        return c.json({ success: true, ...result });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  // -------------------------------------------------------------------------
  // Tenant — found work from inspections
  // -------------------------------------------------------------------------
  route.get(
    "/maintenance-found-work",
    requireAuth(),
    requirePermission("vehicles.view"),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const enabled = await isFeatureEnabled(FEATURE_FLAGS.INSPECTION_FINDINGS, orgId);
        if (!enabled) return c.json({ code: "inspection_findings_off" }, 404);
        const vehicleId = String(c.req.query("vehicleId") || "").trim() || null;
        const { data, error } = await supabase.rpc("fleet_open_found_work", {
          p_organization_id: orgId,
          p_vehicle_id: vehicleId,
        });
        if (error) throw error;
        const items = Array.isArray(data) ? data : (data ?? []);
        return c.json({ items });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.get(
    "/maintenance-found-work/counts",
    requireAuth(),
    requirePermission("vehicles.view"),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const enabled = await isFeatureEnabled(FEATURE_FLAGS.INSPECTION_FINDINGS, orgId);
        if (!enabled) return c.json({ code: "inspection_findings_off" }, 404);
        const { data, error } = await supabase.rpc("fleet_found_work_counts", {
          p_organization_id: orgId,
        });
        if (error) throw error;
        return c.json(data ?? {
          total: 0,
          cars: 0,
          oldestDays: null,
          byVehicle: {},
          oldestVehicleId: null,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.post(
    "/maintenance-found-work/:lineId/not-needed",
    requireAuth(),
    requirePermission("vehicles.edit"),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const enabled = await isFeatureEnabled(FEATURE_FLAGS.INSPECTION_FINDINGS, orgId);
        if (!enabled) return c.json({ code: "inspection_findings_off" }, 404);
        const lineId = c.req.param("lineId");
        if (!isUuid(lineId)) return c.json({ error: "Invalid id" }, 400);
        const actorId = rbacUserId(c);
        if (!actorId) return c.json({ code: "actor_required", error: "Sign in again." }, 401);
        const { data, error } = await supabase.rpc("fleet_close_found_work", {
          p_organization_id: orgId,
          p_actor_id: actorId,
          p_line_id: lineId,
        });
        if (error) {
          const mapped = mapFoundWorkCloseError(error.message || "");
          if (mapped) {
            return c.json({ code: mapped.code, error: mapped.error }, mapped.status);
          }
          throw error;
        }
        return c.json(data ?? {});
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.post(
    "/maintenance-planned-jobs",
    requireAuth(),
    requirePermission("vehicles.edit"),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        if (!(await isFeatureEnabled(FEATURE_FLAGS.LOG_SERVICE_PARTS_GAPS, orgId))) {
          return c.json({ code: "log_service_parts_gaps_off" }, 404);
        }
        // A planned job lives on the Not done yet list (found work): without that switch nobody could see, close or
        // log it (code review #2).
        if (!(await isFeatureEnabled(FEATURE_FLAGS.INSPECTION_FINDINGS, orgId))) {
          return c.json({ code: "inspection_findings_off" }, 404);
        }
        const body = (await c.req.json()) as Record<string, unknown>;
        const vehicleId = String(body.vehicleId ?? body.vehicle_id ?? "").trim();
        const jobId = String(body.jobId ?? body.job_id ?? body.componentId ?? body.component_id ?? "").trim();
        const actorId = rbacUserId(c);
        if (!actorId) return c.json({ code: "actor_required", error: "Sign in again." }, 401);
        if (!vehicleId || !jobId || !isUuid(jobId)) {
          return c.json({ error: "vehicleId and jobId are required" }, 400);
        }

        const access = await verifiedCarForVehicle(c, supabase, vehicleId);
        if (access.status === 404) return c.json({ error: "Not found" }, 404);
        if (access.status === 403) return c.json({ error: "Forbidden" }, 403);

        const partIdRaw = body.partId ?? body.part_id;
        const partId = partIdRaw != null && String(partIdRaw).trim() !== ""
          ? String(partIdRaw).trim()
          : null;
        if (partId) {
          // Same rule as every save (partFitsVerifiedCar, code review #4).
          const fits = await partFitsVerifiedCar(supabase, access.catalogId ?? null, partId);
          if (!fits) {
            return c.json({
              code: "line_part_not_for_car",
              error: "That part does not fit this car.",
            }, 400);
          }
        }

        const placesRaw = body.places ?? body.positions ?? body.positionCodes ?? body.position_codes;
        let positions: string[] | null = null;
        if (Array.isArray(placesRaw)) {
          positions = placesRaw.map(String).filter(Boolean);
        }
        if (positions?.length) {
          const jobRow = await loadJobPositionMeta(supabase, jobId);
          if (jobRow && positionCodesProblem(jobRow, positions)) {
            return c.json({ code: "position_invalid", error: "That position doesn't fit this job. Pick again." }, 400);
          }
        }

        const note = body.note != null ? String(body.note) : null;
        const idempotencyKey = body.idempotencyKey ?? body.idempotency_key;
        const key = idempotencyKey != null ? String(idempotencyKey).trim() : "";

        const { data, error } = await supabase.rpc("fleet_plan_job", {
          p_organization_id: orgId,
          p_actor_id: actorId,
          p_vehicle_id: vehicleId,
          p_component_id: jobId,
          p_positions: positions ?? [],
          p_part_id: partId,
          p_note: note,
          p_idempotency_key: key,
        });
        if (error) {
          const mapped = mapFleetPlanJobError(error.message ?? String(error));
          if (mapped) return c.json({ code: mapped.code, error: mapped.error }, mapped.status);
          throw error;
        }
        const row = (data ?? {}) as Record<string, unknown>;
        return c.json({
          workOrderId: row.workOrderId ?? row.work_order_id,
          lineId: row.lineId ?? row.line_id,
          created: row.created === true,
          alreadyListed: row.alreadyListed === true,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  // -------------------------------------------------------------------------
  // Tenant — work orders (job cards)
  // -------------------------------------------------------------------------
  route.get(
    "/maintenance-work-orders",
    requireAuth(),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const vehicleId = String(c.req.query("vehicleId") || "").trim();
        const statusRaw = String(c.req.query("status") || "").trim();
        const board = c.req.query("board") === "true" || c.req.query("board") === "1";
        let q = supabase
          .from("maintenance_work_orders")
          .select("*")
          .eq("organization_id", orgId)
          .order("opened_at", { ascending: false })
          .limit(200);
        if (vehicleId) q = q.eq("vehicle_id", vehicleId);
        if (statusRaw) {
          const statuses = statusRaw.split(",").map((s) => s.trim()).filter(Boolean);
          if (statuses.length) q = q.in("status", statuses);
        } else if (board) {
          q = q.in("status", [...MAINTENANCE_WO_ACTIVE_STATUSES]);
        } else {
          q = q.neq("status", "planned");
        }
        const { data, error } = await q;
        if (error) throw error;
        return c.json({ items: (data || []).map((wo) => mapDbWorkOrderToApi(wo as Record<string, unknown>)) });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.get(
    "/maintenance-work-orders/:id",
    requireAuth(),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const id = c.req.param("id");
        if (!isUuid(id)) return c.json({ error: "Invalid id" }, 400);
        const { data: wo, error } = await supabase
          .from("maintenance_work_orders")
          .select("*")
          .eq("id", id)
          .eq("organization_id", orgId)
          .maybeSingle();
        if (error) throw error;
        if (!wo) return c.json({ error: "Not found" }, 404);
        const { data: lines, error: lineErr } = await supabase
          .from("maintenance_work_order_lines")
          .select("*")
          .eq("work_order_id", id)
          .order("sort_order", { ascending: true });
        if (lineErr) throw lineErr;
        const enrichedLines = await enrichLinesWithItems(
          supabase,
          id,
          (lines || []) as Record<string, unknown>[],
        );
        const withFound = await enrichApiLinesWithFound(supabase, orgId, id, enrichedLines);
        return c.json({
          item: mapDbWorkOrderToApi(
            wo as Record<string, unknown>,
            withFound,
          ),
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.post(
    "/maintenance-work-orders",
    requireAuth(),
    requirePermission("vehicles.edit"),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const body = (await c.req.json()) as Record<string, unknown>;
        const vehicleId = String(body.vehicleId ?? body.vehicle_id ?? "").trim();
        if (!vehicleId) return c.json({ error: "vehicleId is required" }, 400);

        const completeNow = body.completeNow === true || body.complete_now === true;
        const idempotencyKeyRaw = body.idempotencyKey ?? body.idempotency_key;
        const idempotencyKey = idempotencyKeyRaw != null ? String(idempotencyKeyRaw).trim() : "";
        if (completeNow && !idempotencyKey) {
          return c.json({ error: "idempotencyKey is required when completeNow is true" }, 400);
        }
        if (completeNow && idempotencyKey) {
          const existing = await findWorkOrderByIdempotency(supabase, orgId, idempotencyKey);
          if (existing) {
            // CR-03: a retry must not silently keep an old discount.
            const replayDiscount = parseDiscount(body.discount ?? body.discount_amount);
            if (
              replayDiscount !== null &&
              replayDiscount !== Number((existing as Record<string, unknown>).discount_amount ?? 0)
            ) {
              return c.json({
                code: "discount_changed",
                error: "The discount changed since this save was started. Save again.",
              }, 409);
            }
            const existingStatus = String(existing.status);
            if (existingStatus === "completed") {
              const { data: lines } = await supabase
                .from("maintenance_work_order_lines")
                .select("*")
                .eq("work_order_id", existing.id)
                .order("sort_order", { ascending: true });
              const enrichedLines = await enrichLinesWithItems(
                supabase,
                String(existing.id),
                (lines || []) as Record<string, unknown>[],
              );
              const withFound = await enrichApiLinesWithFound(
                supabase,
                orgId,
                String(existing.id),
                enrichedLines,
              );
              return c.json({
                item: mapDbWorkOrderToApi(
                  existing as Record<string, unknown>,
                  withFound,
                ),
                idempotentReplay: true,
              });
            }
            if (existingStatus === "in_progress") {
              const honoApp = app as {
                request: (path: string, init?: RequestInit, env?: unknown) => Promise<Response>;
              };
              const replayRes = await honoApp.request(
                `${workOrdersBasePath(c.req.path)}/${existing.id}/complete`,
                {
                  method: "POST",
                  headers: c.req.raw.headers,
                  body: JSON.stringify(body),
                },
                c.env,
              );
              if (!replayRes.ok) {
                return replayRes;
              }
              const replayJson = await replayRes.json();
              return c.json({ ...replayJson, idempotentReplay: true });
            }
          }
        }

        if (completeNow || body.performedAtDate != null || body.performed_at_date != null) {
          const odoCheck = parseRequiredOdometer(body);
          if (typeof odoCheck === "object") return odometerRequiredResponse(c);
        }

        const statusRaw = String(body.status ?? (completeNow ? "in_progress" : "draft")).trim();
        const status = ["draft", "in_progress"].includes(statusRaw) ? statusRaw : "draft";
        const logModeRaw = String(body.logMode ?? body.log_mode ?? "quick_job").trim();
        const log_mode = logModeRaw === "package" ? "package" : "quick_job";
        const templateParsed = parseOptionalUuidField(body.templateId ?? body.template_id);
        if (!templateParsed.ok) return c.json({ error: "Invalid templateId" }, 400);
        const currencyRaw = body.currency != null ? String(body.currency).trim().toUpperCase() : "JMD";
        const currency = currencyRaw || "JMD";
        const woId = crypto.randomUUID();
        const rawLines = Array.isArray(body.lines) ? body.lines : [];
        const [inspectionFindingsEnabled, itemsEnabled] = await Promise.all([
          isFeatureEnabled(FEATURE_FLAGS.INSPECTION_FINDINGS, orgId),
          isFeatureEnabled(FEATURE_FLAGS.SERVICE_ITEMS, orgId),
        ]);
        const findingsBlocked = await inspectionFindingsOffResponse(
          c,
          orgId,
          rawLines,
          inspectionFindingsEnabled,
        );
        if (findingsBlocked) return findingsBlocked;
        const prepared = await prepareWorkOrderLines(supabase, {
          orgId,
          vehicleId,
          workOrderId: null,
          rawLines,
          itemsEnabled,
        });
        if (!prepared.ok) {
          return c.json({ code: prepared.code, error: prepared.error }, prepared.status);
        }
        const partFitBlockedCreate = await partsGapsLinePartFitGuard(
          c,
          supabase,
          orgId,
          vehicleId,
          null,
          rawLines,
        );
        if (partFitBlockedCreate) return partFitBlockedCreate;
        const lineRows = prepared.lines;
        const discountParsed = parseDiscount(body.discount ?? body.discount_amount);
        const discount = discountParsed ?? 0;
        const discountEnabled = await loadDiscountEnabled(orgId);
        const discountReject = respondDiscountRejection(c, discountParsed, discountEnabled, lineRows, discount);
        if (discountReject) return discountReject;
        let logNumber: string | null = null;
        try {
          logNumber = await reserveMaintenanceLogNumber(supabase);
        } catch {
          logNumber = null;
        }

        const pWorkOrder: Record<string, unknown> = {
          id: woId,
          vehicle_id: vehicleId,
          log_mode,
          idempotency_key: idempotencyKey || null,
          log_number: logNumber,
          performed_at_date: body.performedAtDate != null || body.performed_at_date != null
            ? String(body.performedAtDate ?? body.performed_at_date).slice(0, 10)
            : null,
          odometer: body.odometer != null ? Number(body.odometer) : null,
          provider: body.provider != null ? String(body.provider) : null,
          currency,
          template_id: templateParsed.value,
          package_complete: body.packageComplete === true || body.package_complete === true,
          notes: body.notes != null ? String(body.notes) : null,
          invoice_url: body.invoiceUrl != null
            ? String(body.invoiceUrl)
            : (body.invoice_url != null ? String(body.invoice_url) : null),
          discount_amount: discount,
        };

        const saveRes = await callSaveWorkOrder(supabase, {
          orgId,
          actorId: rbacUserId(c),
          status,
          workOrderId: null,
          expectedVersion: null,
          workOrder: pWorkOrder,
          lines: lineRows,
        });
        if (!saveRes.ok) {
          if (idempotencyKey) {
            const raced = await findWorkOrderByIdempotency(supabase, orgId, idempotencyKey);
            if (raced) {
              const existingStatus = String(raced.status);
              if (existingStatus === "completed") {
                const { data: lines } = await supabase
                  .from("maintenance_work_order_lines")
                  .select("*")
                  .eq("work_order_id", raced.id)
                  .order("sort_order", { ascending: true });
                const enrichedLines = await enrichLinesWithItems(
                  supabase,
                  String(raced.id),
                  (lines || []) as Record<string, unknown>[],
                );
                return c.json({
                  item: mapDbWorkOrderToApi(raced as Record<string, unknown>, enrichedLines),
                  idempotentReplay: true,
                });
              }
              if (existingStatus === "in_progress") {
                const honoApp = app as {
                  request: (path: string, init?: RequestInit, env?: unknown) => Promise<Response>;
                };
                const replayRes = await honoApp.request(
                  `${workOrdersBasePath(c.req.path)}/${raced.id}/complete`,
                  {
                    method: "POST",
                    headers: c.req.raw.headers,
                    body: JSON.stringify(body),
                  },
                  c.env,
                );
                if (!replayRes.ok) return replayRes;
                const replayJson = await replayRes.json();
                return c.json({ ...replayJson, idempotentReplay: true });
              }
            }
          }
          return c.json({ code: saveRes.code, error: saveRes.error }, saveRes.status);
        }

        if (completeNow) {
          const honoApp = app as {
            request: (path: string, init?: RequestInit, env?: unknown) => Promise<Response>;
          };
          return honoApp.request(
            `${workOrdersBasePath(c.req.path)}/${woId}/complete`,
            {
              method: "POST",
              headers: c.req.raw.headers,
              body: JSON.stringify(body),
            },
            c.env,
          );
        }

        return c.json({
          item: await mapSavedRpcToApiItem(supabase, saveRes.data),
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.patch(
    "/maintenance-work-orders/:id",
    requireAuth(),
    requirePermission("vehicles.edit"),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const id = c.req.param("id");
        if (!isUuid(id)) return c.json({ error: "Invalid id" }, 400);
        const body = (await c.req.json()) as Record<string, unknown>;

        const { data: existing, error: fetchErr } = await supabase
          .from("maintenance_work_orders")
          .select("*")
          .eq("id", id)
          .eq("organization_id", orgId)
          .maybeSingle();
        if (fetchErr) throw fetchErr;
        if (!existing) return c.json({ error: "Not found" }, 404);
        const plannedBlocked = plannedWorkOrderGuardResponse(c, existing as Record<string, unknown>);
        if (plannedBlocked) return plannedBlocked;

        if (isMixedPatchBody(body)) {
          return c.json({ error: "Save the job details and the status separately." }, 400);
        }

        if (isContentEditBody(body)) {
          const existingSt = String((existing as Record<string, unknown>).status ?? "").trim();
          const existingVoided = (existing as Record<string, unknown>).voided_at != null;
          if (
            existingVoided
            || (existingSt !== "draft" && existingSt !== "in_progress")
          ) {
            return c.json(
              {
                code: "immutable",
                error: "Completed services can't be changed — void it and log again.",
              },
              409,
            );
          }
          const evRaw = body.expectedVersion ?? body.expected_version;
          if (evRaw == null || evRaw === "") {
            return c.json({ code: "version_required", error: "Reload this service and try again." }, 428);
          }
          const expectedVersion = Number(evRaw);
          if (!Number.isFinite(expectedVersion)) {
            return c.json({ code: "version_required", error: "Reload this service and try again." }, 428);
          }
          if (body.status !== undefined) {
            const st = String(body.status).trim();
            if (st !== "draft" && st !== "in_progress") {
              return c.json({ code: "status_invalid", error: "Invalid service status." }, 400);
            }
          }
          const [inspectionFindingsEnabled, itemsEnabled] = await Promise.all([
            isFeatureEnabled(FEATURE_FLAGS.INSPECTION_FINDINGS, orgId),
            isFeatureEnabled(FEATURE_FLAGS.SERVICE_ITEMS, orgId),
          ]);
          const vehicleId = String(existing.vehicle_id ?? "");
          let linesForSave: Record<string, unknown>[];
          if (Array.isArray(body.lines)) {
            const findingsBlocked = await inspectionFindingsOffResponse(
              c,
              orgId,
              body.lines,
              inspectionFindingsEnabled,
              id,
              supabase,
            );
            if (findingsBlocked) return findingsBlocked;
            const prepared = await prepareWorkOrderLines(supabase, {
              orgId,
              vehicleId,
              workOrderId: id,
              rawLines: body.lines,
              itemsEnabled,
            });
            if (!prepared.ok) {
              return c.json({ code: prepared.code, error: prepared.error }, prepared.status);
            }
            linesForSave = prepared.lines;
            const partFitBlocked = await partsGapsLinePartFitGuard(
              c,
              supabase,
              orgId,
              vehicleId,
              id,
              body.lines,
            );
            if (partFitBlocked) return partFitBlocked;
          } else {
            linesForSave = await loadWorkOrderLinesForRpc(supabase, id);
          }

          const discountInBody = body.discount !== undefined || body.discount_amount !== undefined;
          if (discountInBody) {
            const discountParsed = parseDiscount(body.discount ?? body.discount_amount);
            const discount = discountParsed ?? 0;
            const discountEnabled = await loadDiscountEnabled(orgId);
            const discountReject = respondDiscountRejection(
              c,
              discountParsed,
              discountEnabled,
              linesForSave,
              discount,
            );
            if (discountReject) return discountReject;
          } else if (Array.isArray(body.lines)) {
            const effectiveDiscount = Number(existing.discount_amount ?? 0);
            const newLines = linesForSave;
            if (effectiveDiscount > 0 && discountTooLarge(newLines, effectiveDiscount)) {
              return discountTooLargeResponse(c);
            }
          }

          const pWorkOrder = buildSnakeWorkOrderPayload(body);
          let saveStatus = String(existing.status);
          if (body.status !== undefined) saveStatus = String(body.status).trim();
          if (saveStatus !== "draft" && saveStatus !== "in_progress") {
            return c.json({ code: "status_invalid", error: "Invalid service status." }, 400);
          }
          const saveRes = await callSaveWorkOrder(supabase, {
            orgId,
            actorId: rbacUserId(c),
            status: saveStatus,
            workOrderId: id,
            expectedVersion,
            workOrder: pWorkOrder,
            lines: linesForSave,
          });
          if (!saveRes.ok) {
            return c.json({ code: saveRes.code, error: saveRes.error }, saveRes.status);
          }
          return c.json({ item: await mapSavedRpcToApiItem(supabase, saveRes.data) });
        }

        if (!isBoardOnlyBody(body)) {
          return c.json({ error: "Nothing to update" }, 400);
        }

        const expectedBoardVer = body.expectedVersion ?? body.expected_version;
        if (expectedBoardVer != null && expectedBoardVer !== "") {
          const exp = Number(expectedBoardVer);
          if (Number.isFinite(exp) && Number((existing as Record<string, unknown>).version ?? 1) !== exp) {
            return c.json({
              code: "stale_edit",
              error: "Someone else saved this service first. Reload to see their changes.",
            }, 409);
          }
        }

        if (String(existing.status) === "completed") {
          return c.json({ error: "Cannot edit a completed work order" }, 400);
        }

        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        const actorId = rbacUserId(c);
        if (actorId) patch.updated_by = actorId;
        if (body.status !== undefined) {
          const st = String(body.status).trim();
          if (st === "completed") {
            return c.json({
              code: "use_complete",
              error: "Use Finish to complete this service.",
            }, 409);
          }
          if (!isMaintenanceWoStatus(st)) {
            return c.json({ error: "Invalid work order status" }, 400);
          }
          const fromStatus = String(existing.status);
          if (st !== fromStatus && !canTransitionWorkOrderStatus(fromStatus, st)) {
            return c.json({ error: `Cannot transition from ${fromStatus} to ${st}` }, 409);
          }
          if (st === "scheduled") {
            const total = Number(existing.total_cost ?? 0);
            const { data: orgSettings } = await fleetDb()
              .from("organization_settings")
              .select("wo_approval_threshold_jmd")
              .eq("organization_id", orgId)
              .maybeSingle();
            const threshold = Number(
              (orgSettings as { wo_approval_threshold_jmd?: number } | null)?.wo_approval_threshold_jmd ?? 50000,
            );
            if (total >= threshold && !existing.approved_at) {
              const rbacUser = c.get("rbacUser") as { permissions?: string[] } | undefined;
              const perms = rbacUser?.permissions ?? [];
              const canApprove = perms.includes("maintenance.approve") || perms.includes("*");
              if (!canApprove) {
                return c.json({
                  error: "Approval required",
                  code: "WO_APPROVAL_REQUIRED",
                  thresholdJmd: threshold,
                }, 403);
              }
              patch.approved_at = new Date().toISOString();
              patch.approved_by = (c.get("rbacUser") as { userId?: string })?.userId ?? null;
            }
          }
          if (st === "cancelled") {
            const reason = body.cancelReason ?? body.cancel_reason;
            if (reason == null || String(reason).trim() === "") {
              return c.json({ error: "cancelReason is required when cancelling" }, 400);
            }
            patch.cancel_reason = String(reason).trim();
          }
          patch.status = st;
          Object.assign(
            patch,
            workOrderTransitionSideEffects(fromStatus, st, new Date().toISOString()),
          );
        }
        if (body.priority !== undefined) patch.priority = body.priority == null ? null : String(body.priority);
        if (body.vendorId !== undefined || body.vendor_id !== undefined) {
          const v = body.vendorId ?? body.vendor_id;
          patch.vendor_id = v == null || v === "" ? null : String(v);
        }
        if (body.source !== undefined) patch.source = body.source == null ? null : String(body.source);

        const { data: wo, error: upErr } = await supabase
          .from("maintenance_work_orders")
          .update(patch)
          .eq("id", id)
          .eq("organization_id", orgId)
          .select()
          .single();
        if (upErr) throw upErr;

        const newStatus = String((wo as { status?: string }).status ?? existing.status);
        if (newStatus === "completed" || newStatus === "closed") {
          await fleetDb()
            .from("vehicles")
            .update({
              do_not_drive: false,
              do_not_drive_reason: null,
              do_not_drive_set_at: null,
            })
            .eq("id", String(existing.vehicle_id))
            .eq("organization_id", orgId);
        }

        const { data: lines } = await supabase
          .from("maintenance_work_order_lines")
          .select("*")
          .eq("work_order_id", id)
          .order("sort_order", { ascending: true });
        const enrichedLines = await enrichLinesWithItems(
          supabase,
          id,
          (lines || []) as Record<string, unknown>[],
        );
        return c.json({
          item: mapDbWorkOrderToApi(
            wo as Record<string, unknown>,
            enrichedLines,
          ),
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.post(
    "/maintenance-work-orders/:id/complete",
    requireAuth(),
    requirePermission("vehicles.edit"),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const actorId = rbacUserId(c);
        if (!actorId) return c.json({ code: "actor_required", error: "Actor required" }, 401);
        const id = c.req.param("id");
        if (!isUuid(id)) return c.json({ error: "Invalid id" }, 400);
        const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;

        const { data: wo, error: fetchErr } = await supabase
          .from("maintenance_work_orders")
          .select("*")
          .eq("id", id)
          .eq("organization_id", orgId)
          .maybeSingle();
        if (fetchErr) throw fetchErr;
        if (!wo) return c.json({ error: "Not found" }, 404);
        const plannedBlocked = plannedWorkOrderGuardResponse(c, wo as Record<string, unknown>);
        if (plannedBlocked) return plannedBlocked;
        if (String(wo.status) === "cancelled") {
          return c.json({ error: "Cannot complete a cancelled work order" }, 400);
        }

        const { data: lines, error: lineErr } = await supabase
          .from("maintenance_work_order_lines")
          .select("*")
          .eq("work_order_id", id)
          .order("sort_order", { ascending: true });
        if (lineErr) throw lineErr;
        const lineRows = (lines || []) as Record<string, unknown>[];
        const discount = Number(wo.discount_amount ?? 0);
        if (discountTooLarge(lineRows, discount)) return discountTooLargeResponse(c);

        const odoCheck = parseRequiredOdometer({ odometer: wo.odometer });
        if (typeof odoCheck === "object") return odometerRequiredResponse(c);

        const result = await runCompletion(supabase, {
          orgId,
          workOrderId: id,
          actorId,
          wo: wo as Record<string, unknown>,
          lineRows,
          body,
          c,
          // runCompletion calls enrichLines(workOrderId, lines); the helper also needs the client.
          enrichLines: (woId, rows) => enrichLinesWithItems(supabase, woId, rows),
          mapCompletedItem: mapDbWorkOrderToApi,
        });
        return c.json(result.body, result.status);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  // -------------------------------------------------------------------------
  // Tenant — digital vehicle inspection (DVI)
  // -------------------------------------------------------------------------
  route.get(
    "/maintenance-inspection-templates",
    requireAuth(),
    async (c) => {
      try {
        const { data: templates, error } = await supabase
          .from("maintenance_inspection_templates")
          .select("*")
          .order("sort_order", { ascending: true });
        if (error) throw error;
        const ids = (templates || []).map((t: { id: string }) => t.id);
        const { data: items, error: itemErr } = ids.length
          ? await supabase
            .from("maintenance_inspection_items")
            .select("*")
            .in("template_id", ids)
            .order("sort_order", { ascending: true })
          : { data: [] as Record<string, unknown>[], error: null };
        if (itemErr) throw itemErr;
        const byTpl = new Map<string, Record<string, unknown>[]>();
        for (const it of items || []) {
          const tid = String((it as { template_id: string }).template_id);
          const list = byTpl.get(tid) || [];
          list.push(it as Record<string, unknown>);
          byTpl.set(tid, list);
        }
        return c.json({
          items: (templates || []).map((t: Record<string, unknown>) => ({
            ...t,
            items: byTpl.get(String(t.id)) || [],
          })),
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.patch(
    "/maintenance-inspection-findings/:id",
    requireAuth(),
    requirePermission("vehicles.edit"),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const id = c.req.param("id");
        if (!isUuid(id)) return c.json({ error: "Invalid id" }, 400);
        const body = (await c.req.json()) as Record<string, unknown>;

        const { data: existing, error: fetchErr } = await supabase
          .from("maintenance_inspection_findings")
          .select("*")
          .eq("id", id)
          .eq("organization_id", orgId)
          .maybeSingle();
        if (fetchErr) throw fetchErr;
        if (!existing) return c.json({ error: "Not found" }, 404);

        const declined = body.declined === true || body.decline === true;
        if (body.declined === undefined && body.decline === undefined) {
          return c.json({ error: "Set declined: true to decline a finding" }, 400);
        }

        const patch: Record<string, unknown> = {
          declined,
          updated_at: new Date().toISOString(),
        };
        if (body.notes !== undefined) patch.notes = body.notes == null ? null : String(body.notes);

        // When declining, mark linked recommended line as declined
        if (declined && existing.recommended_line_id) {
          await supabase
            .from("maintenance_work_order_lines")
            .update({ declined: true, updated_at: new Date().toISOString() })
            .eq("id", existing.recommended_line_id);
        }

        const { data: updated, error: upErr } = await supabase
          .from("maintenance_inspection_findings")
          .update(patch)
          .eq("id", id)
          .eq("organization_id", orgId)
          .select()
          .single();
        if (upErr) throw upErr;

        return c.json({
          item: {
            id: updated.id,
            organizationId: updated.organization_id,
            vehicleId: updated.vehicle_id,
            workOrderId: updated.work_order_id,
            itemId: updated.item_id,
            systemId: updated.system_id,
            componentId: updated.component_id,
            status: updated.status,
            notes: updated.notes,
            photoUrl: updated.photo_url,
            declined: updated.declined === true,
            recommendedLineId: updated.recommended_line_id,
          },
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  /**
   * Nightly maintenance check — writes alerts + job run (see fleet-maintenance-logging-audit.md).
   */
  route.post(
    "/maintenance/nightly-run",
    async (c) => {
      try {
        const secret = Deno.env.get("FLEET_CRON_SECRET") || Deno.env.get("RIDES_CRON_SECRET");
        const hdr =
          c.req.header("X-Fleet-Cron-Secret") || c.req.header("X-Rides-Cron-Secret");
        const orgId = getOrgId(c);
        if (secret && hdr === secret) {
          const { data: runId, error } = await supabase.rpc("run_maintenance_nightly_check", {
            p_organization_id: null,
          });
          if (error) throw error;
          return c.json({ success: true, runId });
        }
        if (!orgId) return c.json({ error: "Unauthorized" }, 401);
        const { error: permErr } = await supabase.rpc("run_maintenance_nightly_check", {
          p_organization_id: orgId,
        });
        if (permErr) throw permErr;
        return c.json({ success: true });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.post(
    "/maintenance-log-number/reserve",
    requireAuth(),
    requirePermission("vehicles.edit"),
    async (c) => {
      try {
        const logNumber = await reserveMaintenanceLogNumber(supabase);
        return c.json({ logNumber });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.get(
    "/maintenance-due/:vehicleId",
    requireAuth(),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const vehicleId = c.req.param("vehicleId");
        const { data, error } = await fleetDb()
          .from("fleet_maintenance_due_v")
          .select("*")
          .eq("organization_id", orgId)
          .eq("vehicle_id", vehicleId);
        if (error) throw error;
        const { enrichMaintenanceDueItems } = await import("./maintenance_master_fleet_enrich.ts");
        const items = await enrichMaintenanceDueItems(
          supabase,
          orgId,
          vehicleId,
          (data || []) as Record<string, unknown>[],
        );
        const { data: vehRow } = await fleetDb()
          .from("fleet_vehicles")
          .select("severe_duty")
          .eq("organization_id", orgId)
          .eq("id", vehicleId)
          .maybeSingle();
        const severeDuty = (vehRow as { severe_duty?: boolean } | null)?.severe_duty === true;
        const withSevere = items.map((row) => ({ ...row, severe_duty: severeDuty }));
        return c.json({ items: withSevere });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  registerMaintenanceAlertsKpiRoutes(route, supabase);
  registerMaintenanceInspectionRoutes(route, supabase);
  registerMaintenanceWorkOrderRoutes(route, supabase);
  registerMaintenanceMasterRoutes(route, supabase);

  /**
   * Legacy cron path — forwards to nightly SQL job.
   */
  route.post(
    "/maintenance/overdue-digest",
    async (c) => {
      try {
        const secret = Deno.env.get("FLEET_CRON_SECRET") || Deno.env.get("RIDES_CRON_SECRET");
        if (!secret) return c.json({ error: "Cron secret not configured" }, 503);
        const hdr =
          c.req.header("X-Fleet-Cron-Secret") || c.req.header("X-Rides-Cron-Secret");
        if (hdr !== secret) return c.json({ error: "Unauthorized" }, 401);

        const { data: runId, error } = await supabase.rpc("run_maintenance_nightly_check", {
          p_organization_id: null,
        });
        if (error) throw error;

        const { data: runRow } = await fleetDb()
          .from("fleet_maintenance_job_runs")
          .select("vehicles_checked, alerts_written, success")
          .eq("id", runId)
          .maybeSingle();

        return c.json({
          success: true,
          runId,
          alertsWritten: (runRow as { alerts_written?: number })?.alerts_written ?? 0,
          vehiclesChecked: (runRow as { vehicles_checked?: number })?.vehicles_checked ?? 0,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[maintenance overdue-digest]", e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.post(
    "/maintenance-work-orders/:id/triage",
    requireAuth(),
    requirePermission("vehicles.edit"),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const id = c.req.param("id");
        if (!isUuid(id)) return c.json({ error: "Invalid id" }, 400);
        const body = (await c.req.json()) as Record<string, unknown>;
        const action = String(body.action ?? "").trim().toLowerCase();
        if (!["approve", "merge", "decline"].includes(action)) {
          return c.json({ error: "action must be approve, merge, or decline" }, 400);
        }

        const { data: wo, error: fetchErr } = await supabase
          .from("maintenance_work_orders")
          .select("*")
          .eq("id", id)
          .eq("organization_id", orgId)
          .maybeSingle();
        if (fetchErr) throw fetchErr;
        if (!wo) return c.json({ error: "Not found" }, 404);

        if (action === "approve") {
          const patch = {
            status: "open",
            updated_at: new Date().toISOString(),
            ...workOrderTransitionSideEffects(String(wo.status), "open", new Date().toISOString()),
          };
          const { data: updated, error: upErr } = await supabase
            .from("maintenance_work_orders")
            .update(patch)
            .eq("id", id)
            .select()
            .single();
          if (upErr) throw upErr;
          await insertMaintenanceEvent(supabase, {
            organizationId: orgId,
            vehicleId: String(wo.vehicle_id),
            type: "request.approved",
            payload: {
              workOrderId: id,
              driverId: (wo.payload_json as Record<string, unknown> | null)?.driverId
                ?? (wo.payload_json as Record<string, unknown> | null)?.driver_id
                ?? null,
            },
          });
          return c.json({ item: mapDbWorkOrderToApi(updated as Record<string, unknown>) });
        }

        if (action === "decline") {
          const reason = String(body.reason ?? "").trim();
          if (!reason) return c.json({ error: "reason is required to decline" }, 400);
          const { data: updated, error: upErr } = await supabase
            .from("maintenance_work_orders")
            .update({
              status: "cancelled",
              cancel_reason: reason,
              closed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", id)
            .select()
            .single();
          if (upErr) throw upErr;
          await insertMaintenanceEvent(supabase, {
            organizationId: orgId,
            vehicleId: String(wo.vehicle_id),
            type: "request.declined",
            payload: {
              workOrderId: id,
              reason,
              driverId: (wo.payload_json as Record<string, unknown> | null)?.driverId
                ?? (wo.payload_json as Record<string, unknown> | null)?.driver_id
                ?? null,
            },
          });
          return c.json({ item: mapDbWorkOrderToApi(updated as Record<string, unknown>) });
        }

        const targetId = String(body.mergeIntoWorkOrderId ?? body.targetWorkOrderId ?? "").trim();
        if (!isUuid(targetId)) return c.json({ error: "mergeIntoWorkOrderId is required" }, 400);
        const note = String(body.notes ?? wo.notes ?? "").trim();
        await supabase
          .from("maintenance_work_orders")
          .update({
            status: "cancelled",
            cancel_reason: `Merged into ${targetId}`,
            notes: note,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);
        return c.json({ success: true, mergedInto: targetId });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  // Delete ONE job from a saved service (the row the user clicked). The other jobs stay.
  route.post(
    "/maintenance-work-order-lines/:lineId/void",
    requireAuth(),
    requirePermission("vehicles.edit"),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const lineId = c.req.param("lineId");
        if (!isUuid(lineId)) return c.json({ error: "Invalid id" }, 400);
        const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
        const reason = String(body.reason ?? "").trim();
        if (!reason) return c.json({ error: "reason is required" }, 400);

        const { data: res, error: rpcErr } = await supabase.rpc("fleet_void_work_order_line", {
          p_organization_id: orgId,
          p_line_id: lineId,
          p_reason: reason,
        });
        if (rpcErr) {
          const msg = rpcErr.message || "";
          if (/not found|already deleted|Only saved/i.test(msg)) return c.json({ error: msg }, 400);
          throw rpcErr;
        }
        const out = (res || {}) as {
          workOrderId?: string;
          vehicleId?: string;
          recordId?: string | null;
          jobName?: string;
          lineTotal?: number;
          newTotal?: number;
          remainingJobs?: number;
          serviceVoided?: boolean;
        };
        const vehicleId = String(out.vehicleId ?? "");
        const recordId = out.recordId ? String(out.recordId) : null;
        const newTotal = Number(out.newTotal ?? 0) || 0;

        // Books: re-post the service at its new total (same delete + re-append as editing a record).
        let ledgerWarning: string | undefined;
        if (recordId) {
          try {
            await deleteCanonicalLedgerBySource("financial_event", [recordId]);
            if (!out.serviceVoided && newTotal > 0) {
              const { data: rec } = await supabase
                .from("maintenance_records")
                .select("id, vehicle_id, performed_at_date, currency, service_type, provider")
                .eq("id", recordId)
                .maybeSingle();
              if (rec) {
                const ledgerInput = {
                  id: recordId,
                  vehicleId: String(rec.vehicle_id ?? vehicleId),
                  performed_at_date: String(rec.performed_at_date ?? ""),
                  cost: newTotal,
                  status: "Completed",
                  currency: String(rec.currency ?? "JMD"),
                  service_type: rec.service_type != null ? String(rec.service_type) : undefined,
                  provider: rec.provider != null ? String(rec.provider) : undefined,
                };
                if (isMaintenanceLedgerEligible(ledgerInput)) {
                  const r = await appendCanonicalMaintenanceIfEligible(ledgerInput, c);
                  if (r.failed) ledgerWarning = "Job deleted but the books were not updated — contact support";
                }
              }
            }
          } catch (ledgerErr) {
            console.error("[maintenance line void] ledger re-post failed:", ledgerErr);
            ledgerWarning = "Job deleted but the books were not updated — contact support";
          }
          if (out.serviceVoided) {
            try {
              await voidOdometerReading(
                { vehicleId, source: "service", referenceId: recordId },
                `Service voided: ${reason}`,
              );
            } catch (odoErr) {
              console.error("[maintenance line void] odometer reading void failed:", odoErr);
            }
          }
        }

        if (vehicleId) await recomputeScheduleForVehicle(supabase, vehicleId);
        await insertMaintenanceEvent(supabase, {
          organizationId: orgId,
          vehicleId,
          type: out.serviceVoided ? "service.voided" : "service.line_voided",
          payload: { workOrderId: out.workOrderId, lineId, jobName: out.jobName, reason, newTotal },
        });
        await insertMaintenanceAuditLog(supabase, {
          organizationId: orgId,
          entityType: "maintenance_work_order_line",
          entityId: lineId,
          reason,
          before: { lineTotal: out.lineTotal, jobName: out.jobName },
          after: { voided: true, newServiceTotal: newTotal, remainingJobs: out.remainingJobs },
        });

        return c.json({ ...out, ledgerWarning });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.post(
    "/maintenance-work-orders/:id/void",
    requireAuth(),
    requirePermission("vehicles.edit"),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const id = c.req.param("id");
        if (!isUuid(id)) return c.json({ error: "Invalid id" }, 400);
        const body = (await c.req.json()) as Record<string, unknown>;
        const reason = String(body.reason ?? "").trim();
        if (!reason) return c.json({ error: "reason is required" }, 400);

        const { data: wo, error: fetchErr } = await supabase
          .from("maintenance_work_orders")
          .select("*")
          .eq("id", id)
          .eq("organization_id", orgId)
          .maybeSingle();
        if (fetchErr) throw fetchErr;
        if (!wo) return c.json({ error: "Not found" }, 404);
        const plannedVoidBlocked = plannedWorkOrderGuardResponse(c, wo as Record<string, unknown>);
        if (plannedVoidBlocked) return plannedVoidBlocked;
        if (String(wo.status) !== "completed") {
          return c.json({ error: "Only completed work orders can be voided" }, 400);
        }
        if (wo.voided_at != null) return c.json({ error: "Already voided" }, 400);

        const before = { ...(wo as Record<string, unknown>) };
        const { data: voided, error: upErr } = await supabase
          .from("maintenance_work_orders")
          .update({
            voided_at: new Date().toISOString(),
            void_reason: reason,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id)
          .eq("organization_id", orgId)
          .select()
          .single();
        if (upErr) throw upErr;

        const recordId = wo.maintenance_record_id != null ? String(wo.maintenance_record_id) : null;
        if (recordId) {
          try {
            await deleteCanonicalLedgerBySource("financial_event", [recordId]);
          } catch (ledgerErr) {
            console.error("[maintenance void] ledger reversal failed:", ledgerErr);
          }
        }

        // A voided service must stop counting toward due dates and stop being an odometer reading.
        const voidedAtIso = new Date().toISOString();
        const { error: svcLedgerErr } = await supabase
          .from("maintenance_service_ledger")
          .update({ voided_at: voidedAtIso })
          .eq("work_order_id", id)
          .eq("organization_id", orgId)
          .is("voided_at", null);
        if (svcLedgerErr) throw svcLedgerErr;
        if (recordId) {
          try {
            await voidOdometerReading(
              { vehicleId: String(wo.vehicle_id), source: "service", referenceId: recordId },
              `Service voided: ${reason}`,
            );
          } catch (odoErr) {
            console.error("[maintenance void] odometer reading void failed:", odoErr);
          }
        }

        await recomputeScheduleForVehicle(supabase, String(wo.vehicle_id));
        await insertMaintenanceEvent(supabase, {
          organizationId: orgId,
          vehicleId: String(wo.vehicle_id),
          type: "service.voided",
          payload: { workOrderId: id, reason },
        });
        await insertMaintenanceAuditLog(supabase, {
          organizationId: orgId,
          entityType: "maintenance_work_order",
          entityId: id,
          reason,
          before,
          after: voided as Record<string, unknown>,
        });

        return c.json({ item: voided });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("cannot be edited")) {
          return c.json({ error: "Completed services can't be changed — void it and log again." }, 409);
        }
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.get(
    "/maintenance/log-service-context/:vehicleId",
    requireAuth(),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const vehicleId = c.req.param("vehicleId")?.trim() ?? "";
        if (!vehicleId) return c.json({ error: "vehicleId is required" }, 400);
        const vehicle = await loadFleetVehicleForOrg(orgId, vehicleId);
        if (!vehicle) return c.json({ error: "Vehicle not found" }, 404);
        const payload = await buildLogServiceContext({
          supabase,
          c,
          orgId,
          vehicleId,
        });
        return c.json(payload);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.post(
    "/maintenance/odometer/check",
    requireAuth(),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const body = (await c.req.json()) as Record<string, unknown>;
        const vehicleId = String(body.vehicleId ?? body.vehicle_id ?? "").trim();
        const date = String(body.date ?? body.serviceDate ?? "").slice(0, 10);
        const reading = Number(body.reading ?? body.odometer ?? body.odo);
        if (!vehicleId) return c.json({ error: "vehicleId is required" }, 400);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          return c.json({ error: "date must be YYYY-MM-DD" }, 400);
        }
        if (!Number.isFinite(reading) || reading <= 0) {
          return c.json({ error: "reading must be greater than zero", code: "odometer_required" }, 400);
        }
        const vehicle = await loadFleetVehicleForOrg(orgId, vehicleId);
        if (!vehicle) return c.json({ error: "Vehicle not found" }, 404);
        const result = await checkMaintenanceOdometerReading({
          supabase,
          orgId,
          vehicleId,
          serviceDateYmd: date,
          reading,
        });
        return c.json(result);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.get(
    "/maintenance/odometer-history/:vehicleId",
    requireAuth(),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const vehicleId = c.req.param("vehicleId");
        const source = c.req.query("source")?.trim();
        const flagged = c.req.query("flagged") === "true";
        let q = fleetDb()
          .from(fleetTable("odometer_readings"))
          .select("*")
          .eq("vehicle_id", vehicleId)
          .eq("organization_id", orgId)
          .eq("is_voided", false)
          .order("recorded_at", { ascending: false })
          .limit(200);
        if (source) q = q.eq("source", source);
        if (flagged) q = q.eq("is_anomaly", true);
        const { data, error } = await q;
        if (error) throw error;
        return c.json({ items: data || [] });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.post(
    "/maintenance/odometer/:id/accept",
    requireAuth(),
    requirePermission("vehicles.edit"),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const id = c.req.param("id");
        const userId = c.get("userId") as string | undefined;
        const { data, error } = await fleetDb()
          .from(fleetTable("odometer_readings"))
          .update({
            is_anomaly: false,
            is_verified: true,
            verified_by: userId ?? null,
            verified_at: new Date().toISOString(),
          })
          .eq("id", id)
          .eq("organization_id", orgId)
          .select()
          .maybeSingle();
        if (error) throw error;
        if (!data) return c.json({ error: "Not found" }, 404);
        return c.json({ item: data });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.post(
    "/maintenance/odometer/:id/void",
    requireAuth(),
    requirePermission("vehicles.edit"),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const id = c.req.param("id");
        const body = (await c.req.json()) as Record<string, unknown>;
        const reason = String(body.reason ?? "").trim() || "voided";
        const { data, error } = await fleetDb()
          .from(fleetTable("odometer_readings"))
          .update({
            is_voided: true,
            void_reason: reason,
          })
          .eq("id", id)
          .eq("organization_id", orgId)
          .select()
          .maybeSingle();
        if (error) throw error;
        if (!data) return c.json({ error: "Not found" }, 404);
        return c.json({ item: data });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.get(
    "/maintenance/service-history",
    requireAuth(),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const vehicle = c.req.query("vehicle")?.trim() || c.req.query("vehicleId")?.trim() || "";
        const part = c.req.query("part")?.trim() || "";
        const from = c.req.query("from")?.trim() || "";
        const qText = c.req.query("q")?.trim() || "";
        const page = Math.max(1, Number(c.req.query("page") || 1) || 1);
        const rawPageSize = Number(c.req.query("pageSize") || 50) || 50;
        const pageSize = Math.min(50, Math.max(1, rawPageSize));

        const { items, total } = await fetchMaintenanceServiceHistoryPage(
          { orgId, vehicle: vehicle || undefined, part: part || undefined, from: from || undefined, qText: qText || undefined },
          page,
          pageSize,
        );
        // Service items: each job row carries the items used on it ("Items used:" line).
        const woIds = [...new Set(items.map((r) => String(r.work_order_id ?? "")).filter((id) => isUuid(id)))];
        const itemsByLine = await loadLineItemsForWorkOrders(supabase, woIds);
        const withItems = items.map((r) => ({
          ...r,
          fitAtLog: r.fit_at_log != null ? String(r.fit_at_log) : null,
          isHighVoltage: r.is_high_voltage === true,
          items: itemsByLine.get(String(r.line_id ?? "")) ?? [],
        }));
        return c.json({ items: withItems, page, pageSize, total });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  route.post(
    "/maintenance/log-number",
    requireAuth(),
    requirePermission("vehicles.edit"),
    async (c) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 400);
        const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
        const idempotencyKey = String(body.idempotencyKey ?? body.idempotency_key ?? "").trim();
        if (idempotencyKey) {
          const existing = await findWorkOrderByIdempotency(supabase, orgId, idempotencyKey);
          if (existing?.log_number) {
            return c.json({ logNumber: String(existing.log_number), idempotentReplay: true });
          }
        }
        const logNumber = await reserveMaintenanceLogNumber(supabase);
        return c.json({ logNumber, idempotencyKey: idempotencyKey || null });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );
}
