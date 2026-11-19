/**
 * Work-order completion runner (S3): claim → idempotent steps → finish, or release on failure.
 */
import type { Context } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { appendCanonicalMaintenanceIfEligible } from "./canonical_from_ops.ts";
import {
  maybeAdvancePackageSchedule,
  recordCompletedServiceLines,
  type LedgerLineInput,
} from "./maintenance_service_ledger_core.ts";
import {
  assessOdometerAnomaly,
  discountTooLarge,
  lineSubtotal,
  parseRequiredOdometer,
  serviceNetTotal,
} from "./maintenance_logging_helpers.ts";
import { projectFromMaintenanceLog } from "./odometer_ledger.ts";
import { commitPartsUsage } from "./parts_match.ts";
import { FEATURE_FLAGS, isFeatureEnabled } from "./feature_flags.ts";
import { mapDbLineToApi } from "./service_items_save.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(s: string): boolean {
  return UUID_RE.test(s.trim());
}

export function maintenanceRecordAcceptsClientHint(
  record: Record<string, unknown>,
  scope: { orgId: string; vehicleId: string; workOrderId: string },
): boolean {
  if (String(record.organization_id) !== scope.orgId) return false;
  if (String(record.vehicle_id) !== scope.vehicleId) return false;
  const wo = record.work_order_id;
  if (wo != null && String(wo) !== scope.workOrderId) return false;
  return true;
}

export function lineNeedsPartsUsage(row: Record<string, unknown>): boolean {
  if (row.declined === true) return false;
  if (row.recommended === true) return false;
  if (row.part_id && isUuid(String(row.part_id))) return true;
  const num = row.part_number != null ? String(row.part_number).trim() : "";
  return num.length > 0;
}

function usageFromCommit(usageResult: Record<string, unknown>): {
  warrantyPrompts: unknown[];
  stockWarnings: unknown[];
} {
  return {
    warrantyPrompts: Array.isArray(usageResult.warrantyPrompts) ? usageResult.warrantyPrompts : [],
    stockWarnings: Array.isArray(usageResult.stockWarnings) ? usageResult.stockWarnings : [],
  };
}

export function dbLinesToLedgerInputs(lines: Record<string, unknown>[]): LedgerLineInput[] {
  return lines.map((r) => ({
    categoryId: r.component_id != null ? String(r.component_id) : null,
    categoryCode: r.component_code != null ? String(r.component_code) : null,
    categoryName: r.component_name != null ? String(r.component_name) : null,
    action: r.action != null ? String(r.action) : null,
    positions: r.positions,
    notes: r.notes != null ? String(r.notes) : null,
    workOrderLineId: r.id != null ? String(r.id) : null,
    declined: r.declined === true,
    recommended: r.recommended === true,
  }));
}

export type CompletionSteps = {
  commitPartsUsage: () => Promise<{ warrantyPrompts: unknown[]; stockWarnings: unknown[] }>;
  upsertServiceRecord: () => Promise<Record<string, unknown>>;
  refreshRepeatPartAlerts: () => Promise<void>;
  recordCompletedServiceLines: () => Promise<void>;
  maybeAdvancePackageSchedule: () => Promise<void>;
  appendCanonicalMaintenance: () => Promise<{ posted: boolean; failed: boolean }>;
  projectFromMaintenanceLog: () => Promise<void>;
  fleetLogService: () => Promise<unknown>;
  queueUnknownParts: () => Promise<unknown>;
  finishCompletion: (recordId: string) => Promise<Record<string, unknown>>;
};

export type RunCompletionInput = {
  orgId: string;
  workOrderId: string;
  actorId: string;
  wo: Record<string, unknown>;
  lineRows: Record<string, unknown>[];
  body: Record<string, unknown>;
  c: Context;
  enrichLines: (
    workOrderId: string,
    lines: Record<string, unknown>[],
  ) => Promise<Record<string, unknown>[]>;
  mapCompletedItem: (
    wo: Record<string, unknown>,
    lines: Record<string, unknown>[],
  ) => Record<string, unknown>;
};

export type CompletionHttpResult =
  | { status: 200; body: Record<string, unknown> }
  | { status: number; body: Record<string, unknown> };

export function buildDefaultCompletionSteps(
  supabase: SupabaseClient,
  input: RunCompletionInput,
  ctx: {
    vehicleId: string;
    performed_at_date: string;
    performed_at_miles: number;
    roundedTotal: number;
    subtotal: number;
    discount: number;
    currency: string;
    templateId: string | null;
    logMode: string;
    packageComplete: boolean;
    service_type: string;
    provider: string | null;
    notes: string | null;
    invoice_url: string | null;
    apiLines: Record<string, unknown>[];
    recordIdHint: string | null;
  },
): CompletionSteps {
  const {
    orgId,
    workOrderId,
    actorId,
    body,
    c,
    wo,
    lineRows,
  } = input;
  let resolvedRecordId: string | null = null;
  let resolvedRecord: Record<string, unknown> | null = null;

  return {
    async commitPartsUsage() {
      const needsUsage = lineRows.some(lineNeedsPartsUsage);
      if (!needsUsage) {
        return { warrantyPrompts: [], stockWarnings: [] };
      }
      const usageResult = await commitPartsUsage(supabase, workOrderId);
      return usageFromCommit(usageResult);
    },

    async upsertServiceRecord() {
      const workOrderIdStr = workOrderId;
      const payloadExtra = body.payloadExtra && typeof body.payloadExtra === "object"
        ? body.payloadExtra as Record<string, unknown>
        : {};

      const { data: byWo, error: byWoErr } = await supabase
        .from("maintenance_records")
        .select("*")
        .eq("work_order_id", workOrderIdStr)
        .maybeSingle();
      if (byWoErr) throw byWoErr;

      const buildPayloadJson = (recordIdForPayload: string) => ({
        ...payloadExtra,
        id: recordIdForPayload,
        vehicleId: ctx.vehicleId,
        date: ctx.performed_at_date,
        odo: ctx.performed_at_miles,
        type: ctx.service_type,
        cost: ctx.roundedTotal,
        subtotal: ctx.subtotal,
        discount: ctx.discount,
        currency: ctx.currency,
        provider: ctx.provider || "",
        notes: ctx.notes || "",
        invoiceUrl: ctx.invoice_url || "",
        status: "Completed",
        templateId: ctx.templateId || undefined,
        logMode: ctx.logMode,
        workOrderId: workOrderIdStr,
        lines: ctx.apiLines,
        source: "work_order_complete",
      });

      if (byWo) {
        const existingId = String(byWo.id);
        const payload_json = buildPayloadJson(existingId);
        resolvedRecordId = existingId;
        const { data: updated, error } = await supabase
          .from("maintenance_records")
          .update({
            vehicle_id: ctx.vehicleId,
            template_id: ctx.templateId,
            performed_at_miles: ctx.performed_at_miles,
            performed_at_date: ctx.performed_at_date,
            cost: ctx.roundedTotal,
            currency: ctx.currency,
            service_type: ctx.service_type,
            provider: ctx.provider,
            notes: ctx.notes,
            invoice_url: ctx.invoice_url,
            status: "Completed",
            payload_json,
            work_order_id: workOrderIdStr,
            updated_at: new Date().toISOString(),
          })
          .eq("id", byWo.id)
          .select()
          .single();
        if (error) throw error;
        resolvedRecord = updated as Record<string, unknown>;
        return resolvedRecord;
      }

      let insertId = ctx.recordIdHint;
      if (insertId) {
        const { data: byId, error: byIdErr } = await supabase
          .from("maintenance_records")
          .select("*")
          .eq("id", insertId)
          .maybeSingle();
        if (byIdErr) throw byIdErr;
        if (
          byId && maintenanceRecordAcceptsClientHint(byId as Record<string, unknown>, {
            orgId,
            vehicleId: ctx.vehicleId,
            workOrderId: workOrderIdStr,
          })
        ) {
          const payload_json = buildPayloadJson(insertId);
          const { data: updated, error } = await supabase
            .from("maintenance_records")
            .update({
              work_order_id: workOrderIdStr,
              vehicle_id: ctx.vehicleId,
              template_id: ctx.templateId,
              performed_at_miles: ctx.performed_at_miles,
              performed_at_date: ctx.performed_at_date,
              cost: ctx.roundedTotal,
              currency: ctx.currency,
              service_type: ctx.service_type,
              provider: ctx.provider,
              notes: ctx.notes,
              invoice_url: ctx.invoice_url,
              status: "Completed",
              payload_json,
              updated_at: new Date().toISOString(),
            })
            .eq("id", insertId)
            .select()
            .single();
          if (error) throw error;
          resolvedRecordId = insertId;
          resolvedRecord = updated as Record<string, unknown>;
          return resolvedRecord;
        }
        if (byId) insertId = crypto.randomUUID();
      } else {
        insertId = crypto.randomUUID();
      }

      const payload_json = buildPayloadJson(insertId);
      const row = {
        id: insertId,
        organization_id: orgId,
        vehicle_id: ctx.vehicleId,
        template_id: ctx.templateId,
        performed_at_miles: ctx.performed_at_miles,
        performed_at_date: ctx.performed_at_date,
        cost: ctx.roundedTotal,
        currency: ctx.currency,
        service_type: ctx.service_type,
        provider: ctx.provider,
        notes: ctx.notes,
        invoice_url: ctx.invoice_url,
        status: "Completed",
        legacy_kv_id: null,
        payload_json,
        work_order_id: workOrderIdStr,
        updated_at: new Date().toISOString(),
      };
      const { data: inserted, error: recErr } = await supabase
        .from("maintenance_records")
        .insert(row)
        .select()
        .single();
      if (recErr) throw recErr;
      resolvedRecordId = insertId;
      resolvedRecord = inserted as Record<string, unknown>;
      return resolvedRecord;
    },

    async refreshRepeatPartAlerts() {
      const { error } = await supabase.rpc("refresh_repeat_part_alerts", {
        p_km: 10000,
        p_days: 90,
        p_vehicle_id: ctx.vehicleId,
      });
      if (error) throw error;
    },

    async recordCompletedServiceLines() {
      await recordCompletedServiceLines({
        sb: supabase,
        organizationId: orgId,
        vehicleId: ctx.vehicleId,
        performedAtDate: ctx.performed_at_date,
        performedAtMiles: ctx.performed_at_miles,
        lines: dbLinesToLedgerInputs(lineRows),
        templateId: ctx.templateId,
        maintenanceRecordId: resolvedRecordId,
        workOrderId,
      });
    },

    async maybeAdvancePackageSchedule() {
      if (ctx.templateId && ctx.logMode !== "quick_job") {
        await maybeAdvancePackageSchedule({
          sb: supabase,
          organizationId: orgId,
          vehicleId: ctx.vehicleId,
          templateId: ctx.templateId,
          performedMiles: ctx.performed_at_miles,
          performedDate: ctx.performed_at_date,
          currentOdo: ctx.performed_at_miles,
          force: ctx.packageComplete === true,
        });
      }
    },

    async appendCanonicalMaintenance() {
      if (!resolvedRecordId || !resolvedRecord) {
        throw new Error("Service record missing before finance");
      }
      return appendCanonicalMaintenanceIfEligible({
        id: resolvedRecordId,
        vehicleId: ctx.vehicleId,
        performed_at_date: ctx.performed_at_date,
        cost: ctx.roundedTotal,
        status: "Completed",
        currency: ctx.currency,
        service_type: ctx.service_type,
        provider: ctx.provider,
      }, c);
    },

    async projectFromMaintenanceLog() {
      if (!resolvedRecordId) throw new Error("Service record missing before odometer projection");
      await projectFromMaintenanceLog(
        {
          id: resolvedRecordId,
          vehicleId: ctx.vehicleId,
          odometer: ctx.performed_at_miles,
          date: ctx.performed_at_date,
          serviceType: ctx.service_type,
          organizationId: orgId,
        },
        orgId,
      );
    },

    async fleetLogService() {
      if (!resolvedRecordId) throw new Error("Service record missing before finalize");
      const { data: finalizeResult, error: finalizeErr } = await supabase.rpc("fleet_log_service", {
        payload: {
          organizationId: orgId,
          vehicleId: ctx.vehicleId,
          workOrderId,
          recordId: resolvedRecordId,
        },
      });
      if (finalizeErr) throw finalizeErr;
      return finalizeResult;
    },

    queueUnknownParts: () => queueUnknownPartsForWorkOrder(supabase, orgId, workOrderId),

    async finishCompletion(recordId: string) {
      const { data, error } = await supabase.rpc("fleet_finish_completion", {
        p_organization_id: orgId,
        p_work_order_id: workOrderId,
        p_actor_id: actorId,
        p_record_id: recordId,
      });
      if (error) throw error;
      return data as Record<string, unknown>;
    },
  };
}

/**
 * Puts the service's unknown parts on the Roam send list (LS-12). Only when the switch is on. Runs after the service is
 * finished and never fails the save (gate 1, code review #3): an error is logged, and the next "finish" of the same
 * service (a replay) tries again — the queue never adds a row twice.
 */
export async function queueUnknownPartsForWorkOrder(
  supabase: SupabaseClient,
  orgId: string,
  workOrderId: string,
): Promise<null> {
  if (!(await isFeatureEnabled(FEATURE_FLAGS.LOG_SERVICE_PARTS_GAPS, orgId))) {
    return null;
  }
  const { error } = await supabase.rpc("parts_sourcing_outbox_queue", {
    p_work_order_id: workOrderId,
  });
  if (error) throw error;
  return null;
}

async function queueUnknownPartsBestEffort(run: () => Promise<unknown>, workOrderId: string): Promise<void> {
  try {
    await run();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[runCompletion] queueUnknownParts failed (service saved; retried on the next finish):", workOrderId, msg);
  }
}

const STEP_SEQUENCE: Array<{ name: string; run: (steps: CompletionSteps) => Promise<unknown> }> = [
  { name: "commitPartsUsage", run: (s) => s.commitPartsUsage() },
  { name: "upsertServiceRecord", run: (s) => s.upsertServiceRecord() },
  { name: "refreshRepeatPartAlerts", run: (s) => s.refreshRepeatPartAlerts() },
  { name: "recordCompletedServiceLines", run: (s) => s.recordCompletedServiceLines() },
  { name: "maybeAdvancePackageSchedule", run: (s) => s.maybeAdvancePackageSchedule() },
  { name: "appendCanonicalMaintenance", run: (s) => s.appendCanonicalMaintenance() },
  { name: "projectFromMaintenanceLog", run: (s) => s.projectFromMaintenanceLog() },
  { name: "fleetLogService", run: (s) => s.fleetLogService() },
];

export type RunCompletionHooks = {
  assessOdometer?: typeof assessOdometerAnomaly;
};

export async function runCompletion(
  supabase: SupabaseClient,
  input: RunCompletionInput,
  stepsOverride?: Partial<CompletionSteps>,
  hooks?: RunCompletionHooks,
): Promise<CompletionHttpResult> {
  const { orgId, workOrderId, actorId, wo, lineRows, enrichLines, mapCompletedItem } = input;

  const { data: claimRaw, error: claimErr } = await supabase.rpc("fleet_claim_completion", {
    p_organization_id: orgId,
    p_work_order_id: workOrderId,
    p_actor_id: actorId,
  });
  if (claimErr) {
    return { status: 500, body: { error: claimErr.message } };
  }
  const claim = (claimRaw ?? {}) as Record<string, unknown>;

  if (claim.claimed !== true) {
    const reason = String(claim.reason ?? "");
    if (reason === "completed") {
      // A replay of a finished service puts back anything an earlier queue attempt missed (never twice).
      await queueUnknownPartsBestEffort(
        stepsOverride?.queueUnknownParts ?? (() => queueUnknownPartsForWorkOrder(supabase, orgId, workOrderId)),
        workOrderId,
      );
      // lineRows from the route are database-shaped; enrich only for the API response.
      const enrichedLines = await enrichLines(workOrderId, lineRows);
      const recordId = wo.maintenance_record_id != null ? String(wo.maintenance_record_id) : null;
      let record: Record<string, unknown> | null = null;
      if (recordId) {
        const { data } = await supabase.from("maintenance_records").select("*").eq("id", recordId).maybeSingle();
        record = (data as Record<string, unknown>) ?? null;
      }
      return {
        status: 200,
        body: {
          item: mapCompletedItem(wo, enrichedLines),
          record,
          idempotentReplay: true,
        },
      };
    }
    if (reason === "in_progress_elsewhere") {
      return {
        status: 409,
        body: {
          code: "completion_in_progress",
          error: "This service is still finishing saving. Try again in a moment.",
        },
      };
    }
    if (reason === "not_found") {
      return { status: 404, body: { error: "Not found" } };
    }
    if (reason === "not_claimable") {
      return {
        status: 409,
        body: {
          code: "not_claimable",
          error: "Save this service as in progress before finishing it.",
        },
      };
    }
    return { status: 409, body: { code: reason || "not_claimable", error: "Cannot complete this service." } };
  }

  const { data: freshWoRow, error: freshWoErr } = await supabase
    .from("maintenance_work_orders")
    .select("*")
    .eq("id", workOrderId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (freshWoErr) {
    await supabase.rpc("fleet_release_completion", {
      p_organization_id: orgId,
      p_work_order_id: workOrderId,
    });
    return { status: 500, body: { error: freshWoErr.message } };
  }
  if (!freshWoRow) {
    await supabase.rpc("fleet_release_completion", {
      p_organization_id: orgId,
      p_work_order_id: workOrderId,
    });
    return { status: 404, body: { error: "Not found" } };
  }
  const freshWo = freshWoRow as Record<string, unknown>;
  const { data: freshLinesRaw, error: freshLineErr } = await supabase
    .from("maintenance_work_order_lines")
    .select("*")
    .eq("work_order_id", workOrderId)
    .is("voided_at", null)
    .order("sort_order", { ascending: true });
  if (freshLineErr) {
    await supabase.rpc("fleet_release_completion", {
      p_organization_id: orgId,
      p_work_order_id: workOrderId,
    });
    return { status: 500, body: { error: freshLineErr.message } };
  }
  const freshLineRows = (freshLinesRaw || []) as Record<string, unknown>[];
  const discount = Number(freshWo.discount_amount ?? 0);
  if (discountTooLarge(freshLineRows, discount)) {
    await supabase.rpc("fleet_release_completion", {
      p_organization_id: orgId,
      p_work_order_id: workOrderId,
    });
    return {
      status: 400,
      body: { code: "discount_too_large", error: "Discount can't be more than the bill." },
    };
  }

  const roundedTotal = serviceNetTotal(freshLineRows, discount);
  const subtotal = lineSubtotal(freshLineRows);
  const performed_at_date = freshWo.performed_at_date != null
    ? String(freshWo.performed_at_date).slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const odoCheck = parseRequiredOdometer({ odometer: freshWo.odometer });
  if (typeof odoCheck === "object") {
    await supabase.rpc("fleet_release_completion", {
      p_organization_id: orgId,
      p_work_order_id: workOrderId,
    });
    return {
      status: 400,
      body: { code: "odometer_required", error: "Odometer is required to save a service." },
    };
  }
  const performed_at_miles = odoCheck;
  const vehicleId = String(freshWo.vehicle_id);
  const templateId = freshWo.template_id != null ? String(freshWo.template_id) : null;
  const logMode = String(freshWo.log_mode ?? "quick_job");
  const packageComplete = freshWo.package_complete === true;
  const currency = String(freshWo.currency ?? "JMD");
  const provider = freshWo.provider != null ? String(freshWo.provider) : null;
  const notes = freshWo.notes != null ? String(freshWo.notes) : null;
  const invoice_url = freshWo.invoice_url != null ? String(freshWo.invoice_url) : null;
  const service_type = input.body.type != null
    ? String(input.body.type)
    : (packageComplete ? "Package service" : "Quick job");
  const recordIdHint = input.body.recordId != null && isUuid(String(input.body.recordId))
    ? String(input.body.recordId)
    : null;
  const apiLines = freshLineRows.map(mapDbLineToApi);
  const inputForSteps = { ...input, wo: freshWo, lineRows: freshLineRows };

  const defaultSteps = buildDefaultCompletionSteps(supabase, inputForSteps, {
    vehicleId,
    performed_at_date,
    performed_at_miles,
    roundedTotal,
    subtotal,
    discount,
    currency,
    templateId,
    logMode,
    packageComplete,
    service_type,
    provider,
    notes,
    invoice_url,
    apiLines,
    recordIdHint,
  });

  const steps: CompletionSteps = { ...defaultSteps, ...stepsOverride };

  let warrantyPrompts: unknown[] = [];
  let stockWarnings: unknown[] = [];
  let ledgerPosted = false;
  let finalizeResult: unknown;
  let record: Record<string, unknown> | null = null;
  let recordId: string | null = null;

  for (const step of STEP_SEQUENCE) {
    try {
      const result = await step.run(steps);
      if (step.name === "commitPartsUsage") {
        const u = result as { warrantyPrompts: unknown[]; stockWarnings: unknown[] };
        warrantyPrompts = u.warrantyPrompts;
        stockWarnings = u.stockWarnings;
      }
      if (step.name === "upsertServiceRecord") {
        record = result as Record<string, unknown>;
        recordId = String(record.id);
      }
      if (step.name === "appendCanonicalMaintenance") {
        const lr = result as { posted: boolean; failed: boolean };
        ledgerPosted = lr.posted;
        if (lr.failed) {
          throw new Error("Business Finance append failed");
        }
      }
      if (step.name === "fleetLogService") {
        finalizeResult = result;
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[runCompletion] failed at ${step.name}:`, msg);
      await supabase.rpc("fleet_release_completion", {
        p_organization_id: orgId,
        p_work_order_id: workOrderId,
      });
      return {
        status: 500,
        body: {
          code: "completion_failed",
          step: step.name,
          error: msg,
        },
      };
    }
  }

  if (!recordId || !record) {
    await supabase.rpc("fleet_release_completion", {
      p_organization_id: orgId,
      p_work_order_id: workOrderId,
    });
    return { status: 500, body: { code: "completion_failed", step: "upsertServiceRecord", error: "No record" } };
  }

  let finishedWo: Record<string, unknown>;
  try {
    finishedWo = await steps.finishCompletion(recordId);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.rpc("fleet_release_completion", {
      p_organization_id: orgId,
      p_work_order_id: workOrderId,
    });
    return {
      status: 500,
      body: { code: "completion_failed", step: "finishCompletion", error: msg },
    };
  }

  // After finishCompletion, so the drain never finds the service unfinished; best effort, never fails the save.
  await queueUnknownPartsBestEffort(() => steps.queueUnknownParts(), workOrderId);

  const recordedAtIso = `${performed_at_date}T12:00:00.000Z`;
  let odometerAnomaly: Awaited<ReturnType<typeof assessOdometerAnomaly>> | null = null;
  const assessOdometer = hooks?.assessOdometer ?? assessOdometerAnomaly;
  try {
    odometerAnomaly = await assessOdometer(
      supabase,
      vehicleId,
      performed_at_miles,
      recordedAtIso,
    );
  } catch (anomErr) {
    console.warn("[maintenance complete] assess_odometer_anomaly:", anomErr);
  }

  const enrichedLines = await enrichLines(workOrderId, freshLineRows);

  return {
    status: 200,
    body: {
      item: mapCompletedItem(finishedWo, enrichedLines),
      record,
      warrantyPrompts,
      stockWarnings,
      ledgerPosted,
      odometerAnomaly: odometerAnomaly?.isAnomaly ?? false,
      anomalyReason: odometerAnomaly?.anomalyReason ?? null,
      neighbors: odometerAnomaly
        ? {
          expected: odometerAnomaly.priorReading != null
            ? odometerAnomaly.priorReading
            : performed_at_miles,
          before: odometerAnomaly.priorReading,
          after: odometerAnomaly.nextReading,
        }
        : null,
      finalize: finalizeResult,
    },
  };
}

export const COMPLETION_STEP_NAMES = STEP_SEQUENCE.map((s) => s.name);
