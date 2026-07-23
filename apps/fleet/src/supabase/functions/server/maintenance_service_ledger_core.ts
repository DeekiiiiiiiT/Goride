/**
 * Maintenance service ledger + component schedule (ops truth, not finance).
 * Admin catalog (position_aware, intervals) feeds Fleet bootstrap / advance / checklist.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  advanceAfterService,
  computeInitialScheduleRow,
  type TemplateLike,
} from "./maintenance_schedule_engine.ts";

export const MAINTENANCE_POSITIONS = ["LF", "RF", "LR", "RR"] as const;
export type MaintenancePosition = (typeof MAINTENANCE_POSITIONS)[number];

export type ComponentChecklistStatus = "outstanding" | "satisfied" | "partial" | "ok";

function isPosition(v: unknown): v is MaintenancePosition {
  return typeof v === "string" && (MAINTENANCE_POSITIONS as readonly string[]).includes(v);
}

function normalizePositions(raw: unknown): MaintenancePosition[] {
  if (!Array.isArray(raw)) return [];
  const out: MaintenancePosition[] = [];
  for (const p of raw) {
    const s = String(p).trim().toUpperCase();
    if (isPosition(s) && !out.includes(s)) out.push(s);
  }
  return out;
}

/** Prefer tightest (smallest) miles interval among templates; months as tie-break. */
export function pickTightestInterval(templates: TemplateLike[]): TemplateLike {
  if (!templates.length) return { frequency_kind: "recurring" };
  let best = templates[0];
  let bestMiles = Number.POSITIVE_INFINITY;
  for (const t of templates) {
    const m = t.interval_miles != null ? Number(t.interval_miles) : null;
    if (m != null && Number.isFinite(m) && m > 0 && m < bestMiles) {
      bestMiles = m;
      best = t;
    }
  }
  if (bestMiles === Number.POSITIVE_INFINITY) {
    for (const t of templates) {
      const mo = t.interval_months != null ? Number(t.interval_months) : null;
      if (mo != null && Number.isFinite(mo) && mo > 0) return t;
    }
  }
  return best;
}

export function intervalFromCategoryDefaults(cat: Record<string, unknown>): TemplateLike {
  return {
    frequency_kind: "recurring",
    interval_miles: cat.default_interval_miles != null ? Number(cat.default_interval_miles) : null,
    interval_months: cat.default_interval_months != null ? Number(cat.default_interval_months) : null,
  };
}

export async function loadIntervalTemplateForCategory(
  sb: SupabaseClient,
  categoryId: string,
  preferredTemplateId?: string | null,
): Promise<{ template: TemplateLike; sourceTemplateId: string | null }> {
  if (preferredTemplateId) {
    const { data: tpl } = await sb
      .from("maintenance_task_templates")
      .select("id, frequency_kind, interval_miles, interval_miles_max, interval_months")
      .eq("id", preferredTemplateId)
      .maybeSingle();
    if (tpl) {
      return { template: tpl as TemplateLike, sourceTemplateId: String(tpl.id) };
    }
  }

  const { data: memberships } = await sb
    .from("maintenance_package_categories")
    .select(
      "template_id, template:maintenance_task_templates(id, frequency_kind, interval_miles, interval_miles_max, interval_months)",
    )
    .eq("category_id", categoryId);

  const templates: TemplateLike[] = [];
  const ids: string[] = [];
  for (const m of memberships || []) {
    const t = (m as { template?: TemplateLike & { id?: string } }).template;
    if (t) {
      templates.push(t);
      if (t.id) ids.push(String(t.id));
    }
  }

  if (templates.length) {
    const best = pickTightestInterval(templates);
    const match = (memberships || []).find((m) => {
      const t = (m as { template?: { id?: string } }).template;
      return t && String(t.id) === String((best as { id?: string }).id);
    });
    const sid = match
      ? String((match as { template_id?: string }).template_id ?? (best as { id?: string }).id ?? "")
      : ids[0] || null;
    return { template: best, sourceTemplateId: sid };
  }

  const { data: cat } = await sb
    .from("maintenance_service_categories")
    .select("default_interval_miles, default_interval_months")
    .eq("id", categoryId)
    .maybeSingle();

  return {
    template: intervalFromCategoryDefaults((cat || {}) as Record<string, unknown>),
    sourceTemplateId: null,
  };
}

async function upsertComponentScheduleRow(
  sb: SupabaseClient,
  args: {
    organizationId: string;
    vehicleId: string;
    categoryId: string;
    position: string | null;
    performedMiles: number;
    performedDate: string;
    template: TemplateLike;
    sourceTemplateId: string | null;
  },
): Promise<void> {
  const adv = advanceAfterService(args.template, args.performedMiles, args.performedDate);
  const patch = {
    organization_id: args.organizationId,
    vehicle_id: args.vehicleId,
    category_id: args.categoryId,
    position: args.position,
    last_performed_miles: args.performedMiles,
    last_performed_date: args.performedDate,
    next_due_miles: adv.next_due_miles,
    next_due_miles_max: adv.next_due_miles_max,
    next_due_date: adv.next_due_date,
    schedule_status: adv.schedule_status,
    source_template_id: args.sourceTemplateId,
    updated_at: new Date().toISOString(),
  };

  let q = sb
    .from("vehicle_component_schedule")
    .select("id")
    .eq("organization_id", args.organizationId)
    .eq("vehicle_id", args.vehicleId)
    .eq("category_id", args.categoryId);
  q = args.position == null ? q.is("position", null) : q.eq("position", args.position);
  const { data: existing } = await q.maybeSingle();

  if (existing?.id) {
    await sb.from("vehicle_component_schedule").update(patch).eq("id", existing.id);
  } else {
    await sb.from("vehicle_component_schedule").insert(patch);
  }
}

export type LedgerLineInput = {
  categoryId?: string | null;
  categoryCode?: string | null;
  categoryName?: string | null;
  action?: string | null;
  positions?: unknown;
  notes?: string | null;
  workOrderLineId?: string | null;
  declined?: boolean;
};

/**
 * Write ledger rows + advance component/position schedules for completed lines.
 * Returns category ids that were advanced.
 */
export async function recordCompletedServiceLines(args: {
  sb: SupabaseClient;
  organizationId: string;
  vehicleId: string;
  performedAtDate: string;
  performedAtMiles: number;
  lines: LedgerLineInput[];
  templateId?: string | null;
  maintenanceRecordId?: string | null;
  workOrderId?: string | null;
}): Promise<{ ledgerInserted: number; categoriesAdvanced: string[] }> {
  const { sb } = args;
  let ledgerInserted = 0;
  const categoriesAdvanced = new Set<string>();

  for (const line of args.lines) {
    if (line.declined) continue;
    const categoryId = line.categoryId ? String(line.categoryId) : null;
    if (!categoryId) continue;

    const { data: cat } = await sb
      .from("maintenance_service_categories")
      .select("id, code, name, position_aware, default_interval_miles, default_interval_months")
      .eq("id", categoryId)
      .maybeSingle();
    if (!cat) continue;

    const positions = normalizePositions(line.positions);
    const positionAware = cat.position_aware === true;
    // Position-aware: only clear corners that were logged; empty = history only (no schedule credit)
    const targets: (string | null)[] =
      positionAware && positions.length > 0
        ? positions
        : positionAware
          ? []
          : [null];

    const { template, sourceTemplateId } = await loadIntervalTemplateForCategory(
      sb,
      categoryId,
      args.templateId,
    );
    // Prefer category defaults when template has no interval
    const hasInterval =
      (template.interval_miles != null && Number.isFinite(Number(template.interval_miles))) ||
      (template.interval_months != null && Number.isFinite(Number(template.interval_months)));
    const effective = hasInterval ? template : intervalFromCategoryDefaults(cat as Record<string, unknown>);

    if (positionAware && targets.length === 0) {
      const { error: ledErr } = await sb.from("maintenance_service_ledger").insert({
        organization_id: args.organizationId,
        vehicle_id: args.vehicleId,
        performed_at_date: args.performedAtDate,
        performed_at_miles: args.performedAtMiles,
        category_id: categoryId,
        category_code: String(line.categoryCode ?? cat.code ?? ""),
        category_name: String(line.categoryName ?? cat.name ?? ""),
        position: null,
        action: line.action != null ? String(line.action) : null,
        template_id: args.templateId || sourceTemplateId,
        maintenance_record_id: args.maintenanceRecordId || null,
        work_order_id: args.workOrderId || null,
        work_order_line_id: line.workOrderLineId || null,
        notes: line.notes != null ? String(line.notes) : null,
        payload_json: {
          source: "recordCompletedServiceLines",
          note: "position_aware_without_positions",
        },
      });
      if (!ledErr) ledgerInserted++;
      continue;
    }

    for (const pos of targets) {
      const { error: ledErr } = await sb.from("maintenance_service_ledger").insert({
        organization_id: args.organizationId,
        vehicle_id: args.vehicleId,
        performed_at_date: args.performedAtDate,
        performed_at_miles: args.performedAtMiles,
        category_id: categoryId,
        category_code: String(line.categoryCode ?? cat.code ?? ""),
        category_name: String(line.categoryName ?? cat.name ?? ""),
        position: pos,
        action: line.action != null ? String(line.action) : null,
        template_id: args.templateId || sourceTemplateId,
        maintenance_record_id: args.maintenanceRecordId || null,
        work_order_id: args.workOrderId || null,
        work_order_line_id: line.workOrderLineId || null,
        notes: line.notes != null ? String(line.notes) : null,
        payload_json: { source: "recordCompletedServiceLines" },
      });
      if (!ledErr) ledgerInserted++;

      await upsertComponentScheduleRow(sb, {
        organizationId: args.organizationId,
        vehicleId: args.vehicleId,
        categoryId,
        position: pos,
        performedMiles: args.performedAtMiles,
        performedDate: args.performedAtDate,
        template: effective,
        sourceTemplateId: args.templateId || sourceTemplateId,
      });
      categoriesAdvanced.add(categoryId);
    }
  }

  return { ledgerInserted, categoriesAdvanced: [...categoriesAdvanced] };
}

/** Bootstrap component schedule rows for all package-member categories on a vehicle. */
export async function bootstrapVehicleComponentSchedules(args: {
  sb: SupabaseClient;
  organizationId: string;
  vehicleId: string;
  currentOdo: number;
  baselineDate: string;
  templateIds: string[];
}): Promise<number> {
  const { sb } = args;
  if (!args.templateIds.length) return 0;

  const { data: memberships } = await sb
    .from("maintenance_package_categories")
    .select(
      "category_id, template_id, required, category:maintenance_service_categories(id, position_aware, default_interval_miles, default_interval_months), template:maintenance_task_templates(id, frequency_kind, interval_miles, interval_miles_max, interval_months)",
    )
    .in("template_id", args.templateIds);

  type Acc = {
    templates: TemplateLike[];
    sourceTemplateId: string | null;
    positionAware: boolean;
    defaults: TemplateLike;
  };
  const byCat = new Map<string, Acc>();

  for (const m of memberships || []) {
    const catId = String((m as { category_id: string }).category_id);
    const cat = (m as { category?: Record<string, unknown> }).category;
    const tpl = (m as { template?: TemplateLike & { id?: string } }).template;
    if (!catId || !cat) continue;
    let acc = byCat.get(catId);
    if (!acc) {
      acc = {
        templates: [],
        sourceTemplateId: null,
        positionAware: cat.position_aware === true,
        defaults: intervalFromCategoryDefaults(cat),
      };
      byCat.set(catId, acc);
    }
    if (tpl) {
      acc.templates.push(tpl);
      if (!acc.sourceTemplateId && tpl.id) acc.sourceTemplateId = String(tpl.id);
    }
  }

  let created = 0;
  for (const [categoryId, acc] of byCat) {
    const template = acc.templates.length
      ? pickTightestInterval(acc.templates)
      : acc.defaults;
    const hasInterval =
      (template.interval_miles != null && Number.isFinite(Number(template.interval_miles))) ||
      (template.interval_months != null && Number.isFinite(Number(template.interval_months)));
    const effective = hasInterval ? template : acc.defaults;
    const computed = computeInitialScheduleRow(effective, args.currentOdo, args.baselineDate);
    if (!computed.ok) continue;

    const positions: (string | null)[] = acc.positionAware ? [...MAINTENANCE_POSITIONS] : [null];
    for (const pos of positions) {
      let q = sb
        .from("vehicle_component_schedule")
        .select("id")
        .eq("organization_id", args.organizationId)
        .eq("vehicle_id", args.vehicleId)
        .eq("category_id", categoryId);
      q = pos == null ? q.is("position", null) : q.eq("position", pos);
      const { data: existing } = await q.maybeSingle();
      if (existing?.id) continue;

      const { error } = await sb.from("vehicle_component_schedule").insert({
        organization_id: args.organizationId,
        vehicle_id: args.vehicleId,
        category_id: categoryId,
        position: pos,
        last_performed_miles: args.currentOdo,
        last_performed_date: args.baselineDate,
        next_due_miles: computed.next_due_miles,
        next_due_miles_max: computed.next_due_miles_max,
        next_due_date: computed.next_due_date,
        schedule_status: computed.schedule_status,
        source_template_id: acc.sourceTemplateId,
        updated_at: new Date().toISOString(),
      });
      if (!error) created++;
    }
  }
  return created;
}

export function analyzeComponentRowStatus(
  currentOdo: number,
  today: string,
  row: {
    next_due_miles?: number | null;
    next_due_miles_max?: number | null;
    next_due_date?: string | null;
    schedule_status?: string | null;
  },
): "ok" | "pending" | "overdue" | "fulfilled" {
  if (String(row.schedule_status ?? "") === "fulfilled") return "fulfilled";
  const nextMiles = row.next_due_miles != null ? Number(row.next_due_miles) : null;
  const nextMax = row.next_due_miles_max != null ? Number(row.next_due_miles_max) : null;
  const nextDate = row.next_due_date != null ? String(row.next_due_date).slice(0, 10) : null;

  let overdueMiles = false;
  let milesDue = false;
  if (nextMiles != null && Number.isFinite(nextMiles)) {
    if (nextMax != null && Number.isFinite(nextMax) && nextMax > nextMiles) {
      overdueMiles = currentOdo > nextMax;
      milesDue = currentOdo >= nextMiles && currentOdo <= nextMax;
    } else {
      overdueMiles = currentOdo > nextMiles;
      milesDue = currentOdo >= nextMiles;
    }
  }
  const overdueDate = nextDate != null && today > nextDate;
  const dueDate = nextDate != null && today >= nextDate;
  if (overdueMiles || overdueDate) return "overdue";
  if (milesDue || dueDate) return "pending";
  return "ok";
}

export type PackageChecklistItem = {
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  required: boolean;
  positionAware: boolean;
  status: ComponentChecklistStatus;
  /** Positions still due when partial/outstanding */
  outstandingPositions: string[];
  satisfiedPositions: string[];
  lastPerformedDate: string | null;
  lastPerformedMiles: number | null;
};

export async function getPackageChecklist(args: {
  sb: SupabaseClient;
  organizationId: string;
  vehicleId: string;
  templateId: string;
  currentOdo: number;
  today: string;
}): Promise<PackageChecklistItem[]> {
  const { sb } = args;
  const { data: memberships } = await sb
    .from("maintenance_package_categories")
    .select(
      "category_id, required, sort_order, category:maintenance_service_categories(id, code, name, position_aware)",
    )
    .eq("template_id", args.templateId)
    .order("sort_order", { ascending: true });

  const { data: states } = await sb
    .from("vehicle_component_schedule")
    .select("*")
    .eq("organization_id", args.organizationId)
    .eq("vehicle_id", args.vehicleId);

  const stateByKey = new Map<string, Record<string, unknown>>();
  for (const s of states || []) {
    const catId = String(s.category_id);
    const pos = s.position != null ? String(s.position) : "";
    stateByKey.set(`${catId}|${pos}`, s as Record<string, unknown>);
  }

  const items: PackageChecklistItem[] = [];
  for (const m of memberships || []) {
    const cat = (m as { category?: Record<string, unknown> }).category;
    if (!cat?.id) continue;
    const categoryId = String(cat.id);
    const positionAware = cat.position_aware === true;
    const required = (m as { required?: boolean }).required === true;

    if (positionAware) {
      const outstandingPositions: string[] = [];
      const satisfiedPositions: string[] = [];
      let lastDate: string | null = null;
      let lastMiles: number | null = null;
      for (const pos of MAINTENANCE_POSITIONS) {
        const row = stateByKey.get(`${categoryId}|${pos}`);
        const st = row
          ? analyzeComponentRowStatus(args.currentOdo, args.today, {
              next_due_miles: row.next_due_miles as number | null,
              next_due_miles_max: row.next_due_miles_max as number | null,
              next_due_date: row.next_due_date as string | null,
              schedule_status: row.schedule_status as string | null,
            })
          : "pending";
        if (st === "ok" || st === "fulfilled") satisfiedPositions.push(pos);
        else outstandingPositions.push(pos);
        if (row?.last_performed_date) {
          const d = String(row.last_performed_date).slice(0, 10);
          if (!lastDate || d > lastDate) {
            lastDate = d;
            lastMiles = row.last_performed_miles != null ? Number(row.last_performed_miles) : null;
          }
        }
      }
      let status: ComponentChecklistStatus;
      if (outstandingPositions.length === 0) status = "satisfied";
      else if (satisfiedPositions.length === 0) status = "outstanding";
      else status = "partial";
      items.push({
        categoryId,
        categoryCode: String(cat.code ?? ""),
        categoryName: String(cat.name ?? ""),
        required,
        positionAware: true,
        status,
        outstandingPositions,
        satisfiedPositions,
        lastPerformedDate: lastDate,
        lastPerformedMiles: lastMiles,
      });
    } else {
      const row = stateByKey.get(`${categoryId}|`);
      const st = row
        ? analyzeComponentRowStatus(args.currentOdo, args.today, {
            next_due_miles: row.next_due_miles as number | null,
            next_due_miles_max: row.next_due_miles_max as number | null,
            next_due_date: row.next_due_date as string | null,
            schedule_status: row.schedule_status as string | null,
          })
        : "pending";
      const status: ComponentChecklistStatus =
        st === "ok" || st === "fulfilled" ? "satisfied" : "outstanding";
      items.push({
        categoryId,
        categoryCode: String(cat.code ?? ""),
        categoryName: String(cat.name ?? ""),
        required,
        positionAware: false,
        status,
        outstandingPositions: status === "outstanding" ? [] : [],
        satisfiedPositions: [],
        lastPerformedDate: row?.last_performed_date
          ? String(row.last_performed_date).slice(0, 10)
          : null,
        lastPerformedMiles: row?.last_performed_miles != null ? Number(row.last_performed_miles) : null,
      });
    }
  }
  return items;
}

/** True when every required package member is satisfied (partial counts as not satisfied). */
export function packageMembersAllSatisfied(items: PackageChecklistItem[]): boolean {
  const required = items.filter((i) => i.required);
  const check = required.length ? required : items;
  if (!check.length) return false;
  return check.every((i) => i.status === "satisfied");
}

/**
 * Advance package schedule only when all required members are satisfied for this cycle.
 */
export async function maybeAdvancePackageSchedule(args: {
  sb: SupabaseClient;
  organizationId: string;
  vehicleId: string;
  templateId: string;
  performedMiles: number;
  performedDate: string;
  currentOdo: number;
  force?: boolean;
}): Promise<{ advanced: boolean }> {
  const { sb } = args;
  const today = args.performedDate;
  const checklist = await getPackageChecklist({
    sb,
    organizationId: args.organizationId,
    vehicleId: args.vehicleId,
    templateId: args.templateId,
    currentOdo: args.currentOdo,
    today,
  });

  if (!args.force && !packageMembersAllSatisfied(checklist)) {
    return { advanced: false };
  }

  const { data: template } = await sb
    .from("maintenance_task_templates")
    .select("*")
    .eq("id", args.templateId)
    .maybeSingle();
  if (!template) return { advanced: false };

  const adv = advanceAfterService(template as TemplateLike, args.performedMiles, args.performedDate);
  await sb
    .from("vehicle_maintenance_schedule")
    .update({
      last_performed_miles: args.performedMiles,
      last_performed_date: args.performedDate,
      next_due_miles: adv.next_due_miles,
      next_due_miles_max: adv.next_due_miles_max,
      next_due_date: adv.next_due_date,
      schedule_status: adv.schedule_status,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", args.organizationId)
    .eq("vehicle_id", args.vehicleId)
    .eq("template_id", args.templateId);

  return { advanced: true };
}

/** Backfill ledger + component state from completed records / WO lines. */
export async function backfillServiceLedgerForOrg(args: {
  sb: SupabaseClient;
  organizationId: string;
}): Promise<{ records: number; ledgerRows: number }> {
  const { sb } = args;
  const { data: records } = await sb
    .from("maintenance_records")
    .select("id, vehicle_id, performed_at_date, performed_at_miles, template_id, status, payload_json")
    .eq("organization_id", args.organizationId)
    .ilike("status", "completed");

  let ledgerRows = 0;
  let processed = 0;

  for (const rec of records || []) {
    const vehicleId = String(rec.vehicle_id);
    const performedAtDate = String(rec.performed_at_date).slice(0, 10);
    const performedAtMiles = Number(rec.performed_at_miles ?? 0);
    const templateId = rec.template_id != null ? String(rec.template_id) : null;
    const recordId = String(rec.id);

    // Skip if already ledgered for this record
    const { count } = await sb
      .from("maintenance_service_ledger")
      .select("id", { count: "exact", head: true })
      .eq("maintenance_record_id", recordId)
      .is("voided_at", null);
    if ((count ?? 0) > 0) continue;

    let lines: LedgerLineInput[] = [];
    const payload = (rec.payload_json || {}) as Record<string, unknown>;
    if (Array.isArray(payload.lines)) {
      lines = (payload.lines as Record<string, unknown>[]).map((raw) => ({
        categoryId: raw.categoryId != null ? String(raw.categoryId) : null,
        categoryCode: raw.categoryCode != null ? String(raw.categoryCode) : null,
        categoryName: raw.categoryName != null ? String(raw.categoryName) : null,
        action: raw.action != null ? String(raw.action) : null,
        positions: raw.positions,
        notes: raw.notes != null ? String(raw.notes) : null,
        declined: raw.declined === true,
      }));
    }

    // Prefer WO lines linked to this record
    const { data: wos } = await sb
      .from("maintenance_work_orders")
      .select("id")
      .eq("maintenance_record_id", recordId)
      .limit(1);
    const woId = wos?.[0]?.id ? String(wos[0].id) : null;
    if (woId) {
      const { data: woLines } = await sb
        .from("maintenance_work_order_lines")
        .select("*")
        .eq("work_order_id", woId);
      if (woLines?.length) {
        lines = woLines.map((r) => ({
          categoryId: r.component_id != null ? String(r.component_id) : null,
          categoryCode: r.category_code != null ? String(r.category_code) : null,
          categoryName: r.category_name != null ? String(r.category_name) : null,
          action: r.action != null ? String(r.action) : null,
          positions: r.positions,
          notes: r.notes != null ? String(r.notes) : null,
          workOrderLineId: String(r.id),
          declined: r.declined === true,
        }));
      }
    }

    // Resolve category ids from codes when missing
    for (const line of lines) {
      if (!line.categoryId && line.categoryCode) {
        const { data: cat } = await sb
          .from("maintenance_service_categories")
          .select("id")
          .eq("code", String(line.categoryCode))
          .maybeSingle();
        if (cat?.id) line.categoryId = String(cat.id);
      }
    }

    if (!lines.length) continue;

    const result = await recordCompletedServiceLines({
      sb,
      organizationId: args.organizationId,
      vehicleId,
      performedAtDate,
      performedAtMiles,
      lines,
      templateId,
      maintenanceRecordId: recordId,
      workOrderId: woId,
    });
    ledgerRows += result.ledgerInserted;
    processed++;

    if (templateId) {
      await maybeAdvancePackageSchedule({
        sb,
        organizationId: args.organizationId,
        vehicleId,
        templateId,
        performedMiles: performedAtMiles,
        performedDate: performedAtDate,
        currentOdo: performedAtMiles,
      });
    }
  }

  return { records: processed, ledgerRows };
}
