/**
 * Work-order save via fleet_save_work_order + service line items validation.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  parseLineItems,
  type ParsedLineItem,
} from "../../../packages/types/src/serviceItems.ts";
import { getCatalogParts } from "./catalog_api.ts";
import { computeWoLineTotal, loadFleetVehicleForOrg } from "./maintenance_logging_helpers.ts";
import { resolveCatalogIdForKvVehicle } from "./vehicle_catalog_resolve.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WO_LINE_ACTIONS = new Set([
  "inspect", "clean", "adjust", "replace", "rotate", "balance", "flush", "top_up", "repair",
  "machine", "rebuild", "other",
]);
const PIECE_ONE = "piece";
const PIECE_MANY = "pieces";

const CONTENT_EDIT_KEYS = new Set([
  "lines",
  "performedAtDate",
  "performed_at_date",
  "odometer",
  "provider",
  "currency",
  "templateId",
  "template_id",
  "packageComplete",
  "package_complete",
  "logMode",
  "log_mode",
  "notes",
  "invoiceUrl",
  "invoice_url",
  "discount",
  "discount_amount",
]);

const BOARD_ONLY_KEYS = new Set([
  "status",
  "priority",
  "vendorId",
  "vendor_id",
  "source",
  "cancelReason",
  "cancel_reason",
]);

const MIXED_WITH_CONTENT_KEYS = new Set([
  "priority",
  "vendorId",
  "vendor_id",
  "source",
  "cancelReason",
  "cancel_reason",
]);

const PATCH_META_KEYS = new Set([
  ...CONTENT_EDIT_KEYS,
  ...BOARD_ONLY_KEYS,
  "expectedVersion",
  "expected_version",
]);

export function isUuid(s: string): boolean {
  return UUID_RE.test(s.trim());
}

function parseOptionalNumberField(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseOptionalUuidField(v: unknown): { ok: true; value: string | null } | { ok: false } {
  if (v === undefined || v === null || v === "") return { ok: true, value: null };
  const s = String(v).trim();
  if (!isUuid(s)) return { ok: false };
  return { ok: true, value: s };
}

/** camelCase API line → snake_case DB row for maintenance_work_order_lines. */
export function mapApiLineToDb(
  raw: Record<string, unknown>,
  sortOrder: number,
  workOrderId?: string,
  itemsAmount?: number | string,
): Record<string, unknown> {
  const valuesRaw = raw.values ?? raw.values_json;
  const values = (valuesRaw && typeof valuesRaw === "object" && !Array.isArray(valuesRaw))
    ? valuesRaw
    : null;
  const componentParsed = parseOptionalUuidField(
    raw.componentId ?? raw.component_id ?? raw.categoryId ?? raw.category_id,
  );
  const systemParsed = parseOptionalUuidField(raw.systemId ?? raw.system_id);
  const partParsed = parseOptionalUuidField(raw.partId ?? raw.part_id);
  const fromFoundParsed = parseOptionalUuidField(raw.fromFoundLineId ?? raw.from_found_line_id);
  let action = String(raw.action ?? "replace").trim();
  if (!WO_LINE_ACTIONS.has(action)) action = "other";
  const recommended = raw.recommended === true;

  const row: Record<string, unknown> = {
    sort_order: raw.sortOrder != null ? Number(raw.sortOrder) : (raw.sort_order != null ? Number(raw.sort_order) : sortOrder),
    system_id: systemParsed.ok ? systemParsed.value : null,
    component_id: componentParsed.ok ? componentParsed.value : null,
    system_code: raw.systemCode != null
      ? String(raw.systemCode)
      : (raw.system_code != null ? String(raw.system_code) : null),
    system_name: raw.systemName != null
      ? String(raw.systemName)
      : (raw.system_name != null ? String(raw.system_name) : null),
    component_code: raw.componentCode != null
      ? String(raw.componentCode)
      : (raw.categoryCode != null
        ? String(raw.categoryCode)
        : (raw.component_code != null ? String(raw.component_code) : null)),
    component_name: raw.componentName != null
      ? String(raw.componentName)
      : (raw.categoryName != null
        ? String(raw.categoryName)
        : (raw.component_name != null ? String(raw.component_name) : null)),
    action,
    qty: parseOptionalNumberField(raw.qty),
    unit_price: parseOptionalNumberField(raw.unitPrice ?? raw.unit_price),
    material: parseOptionalNumberField(raw.material),
    labor_amount: parseOptionalNumberField(raw.laborAmount ?? raw.labor_amount ?? raw.labor),
    labor_hours: parseOptionalNumberField(raw.laborHours ?? raw.labor_hours),
    labor_rate: parseOptionalNumberField(raw.laborRate ?? raw.labor_rate),
    condition: raw.condition != null ? String(raw.condition) : null,
    positions: Array.isArray(raw.positions) ? raw.positions.map(String) : null,
    brand: raw.brand != null ? String(raw.brand) : null,
    part_number: raw.partNumber != null
      ? String(raw.partNumber)
      : (raw.part_number != null ? String(raw.part_number) : null),
    warranty: raw.warranty === true,
    complimentary: raw.complimentary === true,
    part_id: partParsed.ok ? partParsed.value : null,
    supplier_part_offer_id: (() => {
      const offerParsed = parseOptionalUuidField(raw.supplierPartOfferId ?? raw.supplier_part_offer_id);
      return offerParsed.ok ? offerParsed.value : null;
    })(),
    notes: raw.notes != null ? String(raw.notes) : null,
    recommended,
    declined: raw.declined === true,
    from_found_line_id: fromFoundParsed.ok ? fromFoundParsed.value : null,
    values_json: values,
  };
  const itemsAmt = itemsAmount ?? raw.itemsAmount ?? raw.items_amount ?? 0;
  row.items_amount = Number(itemsAmt) || 0;
  row.line_total = computeWoLineTotal(row);
  if (recommended) {
    row.part_number = null;
    row.part_id = null;
    row.brand = null;
    row.supplier_part_offer_id = null;
    row.unit_price = null;
    row.material = null;
    row.labor_amount = null;
    row.labor_rate = null;
    row.items_amount = 0;
    row.line_total = 0;
  }
  if (workOrderId) row.work_order_id = workOrderId;
  if (raw.id != null && isUuid(String(raw.id))) row.id = String(raw.id);
  return row;
}

export function inspectInspectionFindingsOffPayload(rawLines: unknown[]): boolean {
  for (const raw of rawLines) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const fromRaw = r.fromFoundLineId ?? r.from_found_line_id;
    if (fromRaw !== undefined && fromRaw !== null && String(fromRaw).trim() !== "") return true;
    const valuesRaw = r.values ?? r.values_json;
    if (valuesRaw && typeof valuesRaw === "object" && !Array.isArray(valuesRaw)) {
      const v = valuesRaw as Record<string, unknown>;
      const foundByJob = v.found_by_job;
      if (foundByJob !== undefined && foundByJob !== null && String(foundByJob).trim() !== "") {
        return true;
      }
      if (v.found_today === true) return true;
    }
  }
  return false;
}

export function mapDbLineItemToApi(row: Record<string, unknown>): Record<string, unknown> {
  const unitCostRaw = row.unit_cost;
  const unitCost = unitCostRaw == null || unitCostRaw === ""
    ? null
    : Number(unitCostRaw);
  return {
    id: row.id,
    source: row.source,
    jobItemId: row.job_item_id ?? null,
    itemKind: row.item_kind,
    partTypeId: row.part_type_id ?? null,
    supplyId: row.supply_id ?? null,
    partId: row.part_id ?? null,
    partSource: row.part_source ?? null,
    itemName: row.item_name ?? "",
    unitLabel: row.unit_label ?? "",
    brand: row.brand ?? null,
    partNumber: row.part_number ?? null,
    qty: row.qty != null ? Number(row.qty) : 0,
    unitCost: unitCost != null && Number.isFinite(unitCost) ? unitCost : null,
    amount: row.amount != null ? Number(row.amount) : 0,
  };
}

export function isContentEditBody(body: Record<string, unknown>): boolean {
  return Object.keys(body).some((k) => CONTENT_EDIT_KEYS.has(k));
}

export function isBoardOnlyBody(body: Record<string, unknown>): boolean {
  const keys = Object.keys(body).filter((k) => k !== "expectedVersion" && k !== "expected_version");
  if (keys.length === 0) return false;
  return keys.every((k) => BOARD_ONLY_KEYS.has(k));
}

export function isMixedPatchBody(body: Record<string, unknown>): boolean {
  if (!isContentEditBody(body)) return false;
  return Object.keys(body).some((k) => MIXED_WITH_CONTENT_KEYS.has(k));
}

type PrepareArgs = {
  orgId: string;
  vehicleId: string;
  workOrderId: string | null;
  rawLines: unknown[];
  itemsEnabled: boolean;
};

type PrepareOk = { ok: true; lines: Record<string, unknown>[] };
type PrepareErr = { ok: false; status: number; code: string; error: string };

const SAVE_ERROR_MESSAGES: Record<string, { status: number; error: string }> = {
  version_required: { status: 428, error: "Reload this service and try again." },
  stale_edit: { status: 409, error: "Someone else saved this service first. Reload to see their changes." },
  completion_in_progress: { status: 409, error: "This service is still finishing saving. Try again in a moment." },
  work_order_not_found: { status: 404, error: "Not found" },
  work_order_org_mismatch: { status: 404, error: "Not found" },
  immutable: { status: 409, error: "Completed services can't be changed — void it and log again." },
  line_work_order_mismatch: { status: 400, error: "That line belongs to another service." },
  line_items_on_declined: { status: 400, error: "Declined jobs cannot include items." },
  line_items_on_found_job: { status: 400, error: "Jobs not done yet cannot include items." },
  found_line_not_open: {
    status: 409,
    error: "This found job is already closed. The list has been refreshed.",
  },
  found_line_wrong_car: { status: 400, error: "That found job belongs to a different car." },
  invalid_found_line_id: { status: 400, error: "Invalid found line id." },
  status_invalid: { status: 400, error: "Invalid service status." },
  work_order_id_taken: { status: 409, error: "That service id is already in use." },
  actor_required: { status: 401, error: "Sign in again." },
  line_items_amount_mismatch: { status: 500, error: "Couldn't save the items. Try again." },
};

export function mapSaveWorkOrderError(rawMessage: string): { status: number; code: string; error: string } {
  const msg = String(rawMessage ?? "").trim();
  const code = Object.keys(SAVE_ERROR_MESSAGES).find((c) => msg.includes(c)) ?? "save_failed";
  if (SAVE_ERROR_MESSAGES[code]) {
    return { status: SAVE_ERROR_MESSAGES[code].status, code, error: SAVE_ERROR_MESSAGES[code].error };
  }
  return { status: 500, code, error: msg || "Could not save this service." };
}

function qtyIsExactlyOne(qtyStr: string): boolean {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(qtyStr.trim());
  if (!m) return false;
  const frac = m[2] ?? "";
  if (frac.replace(/0+$/, "") === "") {
    return BigInt(m[1]) === 1n;
  }
  return false;
}

async function loadLineIdsForWorkOrder(
  supabase: SupabaseClient,
  workOrderId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("maintenance_work_order_lines")
    .select("id")
    .eq("work_order_id", workOrderId);
  if (error) throw error;
  return new Set((data || []).map((r) => String((r as { id: string }).id)));
}

async function loadClientLineWorkOrders(
  supabase: SupabaseClient,
  clientLineIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (clientLineIds.length === 0) return map;
  const { data, error } = await supabase
    .from("maintenance_work_order_lines")
    .select("id, work_order_id")
    .in("id", clientLineIds);
  if (error) throw error;
  for (const row of data || []) {
    const r = row as { id: string; work_order_id: string };
    map.set(String(r.id), String(r.work_order_id));
  }
  return map;
}

function checkClientLineId(
  workOrderId: string | null,
  clientId: unknown,
  knownIds: Set<string>,
  lineWoById: Map<string, string>,
): PrepareErr | null {
  if (clientId == null || String(clientId).trim() === "") return null;
  const s = String(clientId).trim();
  if (!isUuid(s)) return null;
  if (!workOrderId) return null;
  if (knownIds.has(s)) return null;
  const ownerWo = lineWoById.get(s);
  if (ownerWo && ownerWo !== workOrderId) {
    return {
      ok: false,
      status: 400,
      code: "line_work_order_mismatch",
      error: "That line belongs to another service.",
    };
  }
  return null;
}

/** Merge client-shaped lines with ids from fleet_save_work_order response, keyed by sort_order. */
export function buildClientPayloadLines(
  rawClientLines: unknown[],
  savedRpcLines: unknown[],
): Record<string, unknown>[] {
  const savedBySort = new Map<number, Record<string, unknown>>();
  for (const row of savedRpcLines) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const so = Number(r.sort_order);
    if (Number.isFinite(so)) savedBySort.set(so, r);
  }
  const out: Record<string, unknown>[] = [];
  let sortOrder = 0;
  for (const raw of rawClientLines) {
    if (!raw || typeof raw !== "object") continue;
    const client = { ...(raw as Record<string, unknown>) };
    const saved = savedBySort.get(sortOrder);
    if (saved?.id != null) client.id = saved.id;
    out.push(client);
    sortOrder += 1;
  }
  return out;
}

export async function prepareWorkOrderLines(
  supabase: SupabaseClient,
  args: PrepareArgs,
): Promise<PrepareOk | PrepareErr> {
  const knownIds = args.workOrderId
    ? await loadLineIdsForWorkOrder(supabase, args.workOrderId)
    : new Set<string>();

  for (const raw of args.rawLines) {
    if (!raw || typeof raw !== "object") {
      return {
        ok: false,
        status: 400,
        code: "line_invalid",
        error: "Each job line must be an object.",
      };
    }
    const r = raw as Record<string, unknown>;
    const items = r.items;
    if (!args.itemsEnabled && Array.isArray(items) && items.length > 0) {
      return {
        ok: false,
        status: 400,
        code: "service_items_off",
        error: "Service items are not enabled for this fleet.",
      };
    }
  }

  const jobItemIds = new Set<string>();
  const partTypeIds = new Set<string>();
  const supplyIds = new Set<string>();
  const componentIds = new Set<string>();

  const clientLineIds: string[] = [];
  for (const raw of args.rawLines) {
    if (!raw || typeof raw !== "object") continue;
    const id = (raw as Record<string, unknown>).id;
    if (id != null && isUuid(String(id)) && !knownIds.has(String(id))) {
      clientLineIds.push(String(id));
    }
  }
  const lineWoById = args.workOrderId
    ? await loadClientLineWorkOrders(supabase, clientLineIds)
    : new Map<string, string>();

  const parsedPerLine: Array<{
    raw: Record<string, unknown>;
    parsed: ParsedLineItem[];
    itemsAmount: string;
  }> = [];

  for (let i = 0; i < args.rawLines.length; i++) {
    const raw = args.rawLines[i];
    if (!raw || typeof raw !== "object") {
      return {
        ok: false,
        status: 400,
        code: "line_invalid",
        error: "Each job line must be an object.",
      };
    }
    const r = raw as Record<string, unknown>;
    const declined = r.declined === true;
    const recommended = r.recommended === true;
    const itemsRaw = Array.isArray(r.items) ? r.items : [];

    const fromFoundRaw = r.fromFoundLineId ?? r.from_found_line_id;
    const hasFromFound = fromFoundRaw !== undefined && fromFoundRaw !== null && String(fromFoundRaw).trim() !== "";
    if (hasFromFound) {
      const fp = parseOptionalUuidField(fromFoundRaw);
      if (!fp.ok) {
        return {
          ok: false,
          status: 400,
          code: "invalid_found_line_id",
          error: "Invalid found line id.",
        };
      }
    }
    if (recommended && hasFromFound) {
      return {
        ok: false,
        status: 400,
        code: "found_line_invalid",
        error: "A job not done yet can't also close a found job.",
      };
    }

    const lineIdErr = checkClientLineId(args.workOrderId, r.id, knownIds, lineWoById);
    if (lineIdErr) return lineIdErr;

    if (recommended && itemsRaw.length > 0) {
      return {
        ok: false,
        status: 400,
        code: "line_items_on_found_job",
        error: "Jobs not done yet cannot include items.",
      };
    }

    const parsed = parseLineItems(itemsRaw, { declined });
    if (!parsed.ok) {
      return {
        ok: false,
        status: 400,
        code: parsed.code,
        error: `Line item ${parsed.index != null ? parsed.index + 1 : ""}: ${parsed.code}`.trim(),
      };
    }

    const comp = r.componentId ?? r.component_id ?? r.categoryId ?? r.category_id;
    const jobIdForLine = comp != null && isUuid(String(comp)) ? String(comp) : null;
    if (!jobIdForLine) {
      for (const it of parsed.items) {
        if (it.source === "suggested" || it.job_item_id) {
          return {
            ok: false,
            status: 400,
            code: "line_item_link_wrong_job",
            error: "That item does not belong to this job.",
          };
        }
      }
    }

    for (const it of parsed.items) {
      if (it.job_item_id) jobItemIds.add(it.job_item_id);
      if (it.part_type_id) partTypeIds.add(it.part_type_id);
      if (it.supply_id) supplyIds.add(it.supply_id);
    }
    if (comp != null && isUuid(String(comp))) componentIds.add(String(comp));

    parsedPerLine.push({ raw: r, parsed: parsed.items, itemsAmount: parsed.itemsAmount });
  }

  const jobItemsById = new Map<string, { job_id: string; part_type_id: string | null; supply_id: string | null }>();
  if (jobItemIds.size > 0) {
    const { data, error } = await supabase
      .from("maintenance_job_item")
      .select("id, job_id, part_type_id, supply_id")
      .in("id", [...jobItemIds]);
    if (error) throw error;
    for (const row of data || []) {
      const jr = row as { id: string; job_id: string; part_type_id: string | null; supply_id: string | null };
      jobItemsById.set(String(jr.id), jr);
    }
  }

  const partTypesById = new Map<string, { name: string }>();
  if (partTypeIds.size > 0) {
    const { data, error } = await supabase
      .from("maintenance_service_categories")
      .select("id, name, kind, is_part, status")
      .in("id", [...partTypeIds]);
    if (error) throw error;
    for (const row of data || []) {
      const pr = row as { id: string; name: string; kind: string; is_part: boolean; status: string };
      if (pr.kind !== "component" || pr.is_part !== true) {
        return { ok: false, status: 400, code: "line_item_part_type_invalid", error: "Invalid part type." };
      }
      partTypesById.set(String(pr.id), { name: String(pr.name) });
    }
    for (const id of partTypeIds) {
      if (!partTypesById.has(id)) {
        return { ok: false, status: 400, code: "line_item_part_type_invalid", error: "Invalid part type." };
      }
    }
  }

  const suppliesById = new Map<string, { name: string; unit_id: string }>();
  const unitIds = new Set<string>();
  if (supplyIds.size > 0) {
    const { data, error } = await supabase
      .from("maintenance_supply")
      .select("id, name, unit_id")
      .in("id", [...supplyIds]);
    if (error) throw error;
    for (const row of data || []) {
      const sr = row as { id: string; name: string; unit_id: string };
      suppliesById.set(String(sr.id), { name: String(sr.name), unit_id: String(sr.unit_id) });
      unitIds.add(String(sr.unit_id));
    }
    for (const id of supplyIds) {
      if (!suppliesById.has(id)) {
        return { ok: false, status: 400, code: "line_item_supply_invalid", error: "Invalid supply." };
      }
    }
  }

  const unitsById = new Map<string, { label_one: string; label_many: string }>();
  if (unitIds.size > 0) {
    const { data, error } = await supabase
      .from("maintenance_unit")
      .select("id, label_one, label_many")
      .in("id", [...unitIds]);
    if (error) throw error;
    for (const row of data || []) {
      const ur = row as { id: string; label_one: string; label_many: string };
      unitsById.set(String(ur.id), { label_one: String(ur.label_one), label_many: String(ur.label_many) });
    }
  }

  const needsCatalog = parsedPerLine.some(({ parsed }) =>
    parsed.some((it) => it.item_kind === "part_type" && it.part_id != null)
  );
  let catalogId: string | null = null;
  const catalogPartsByKey = new Map<string, { brand: string | null; partNumber: string | null }>();
  if (needsCatalog) {
    const vehicleRow = await loadFleetVehicleForOrg(supabase, args.orgId, args.vehicleId);
    catalogId = vehicleRow
      ? await resolveCatalogIdForKvVehicle(supabase, vehicleRow as Record<string, unknown>)
      : null;
  }
  const partTypesNeedingCatalog = new Set<string>();
  for (const { parsed } of parsedPerLine) {
    for (const it of parsed) {
      if (it.item_kind === "part_type" && it.part_type_id && it.part_id != null) {
        partTypesNeedingCatalog.add(it.part_type_id);
      }
    }
  }
  if (catalogId && partTypesNeedingCatalog.size > 0) {
    await Promise.all([...partTypesNeedingCatalog].map(async (ptId) => {
      const catalog = await getCatalogParts(supabase, catalogId!, { componentId: ptId });
      for (const item of catalog.items || []) {
        const part = item.part as Record<string, unknown> | undefined;
        const partId = part?.id != null ? String(part.id) : "";
        if (!partId) continue;
        catalogPartsByKey.set(`${ptId}:${partId}`, {
          brand: part.manufacturer != null ? String(part.manufacturer) : null,
          partNumber: part.oem_part_number != null ? String(part.oem_part_number) : null,
        });
      }
    }));
  }

  const outLines: Record<string, unknown>[] = [];

  for (let i = 0; i < parsedPerLine.length; i++) {
    const { raw, parsed, itemsAmount } = parsedPerLine[i];
    const componentId = raw.componentId ?? raw.component_id ?? raw.categoryId ?? raw.category_id;
    const jobId = componentId != null && isUuid(String(componentId)) ? String(componentId) : null;

    const dbItems: Record<string, unknown>[] = [];
    for (const it of parsed) {
      if (it.job_item_id) {
        const link = jobItemsById.get(it.job_item_id);
        if (!link) {
          return { ok: false, status: 400, code: "line_item_link_invalid", error: "Invalid May-need link." };
        }
        if (!jobId) {
          return {
            ok: false,
            status: 400,
            code: "line_item_link_wrong_job",
            error: "That item does not belong to this job.",
          };
        }
        if (String(link.job_id) !== jobId) {
          return {
            ok: false,
            status: 400,
            code: "line_item_link_wrong_job",
            error: "That item does not belong to this job.",
          };
        }
        if (
          link.part_type_id != null
          && it.part_type_id != null
          && String(link.part_type_id) !== String(it.part_type_id)
        ) {
          return {
            ok: false,
            status: 400,
            code: "line_item_link_mismatch",
            error: "That item does not match the May-need link.",
          };
        }
        if (
          link.supply_id != null
          && it.supply_id != null
          && String(link.supply_id) !== String(it.supply_id)
        ) {
          return {
            ok: false,
            status: 400,
            code: "line_item_link_mismatch",
            error: "That item does not match the May-need link.",
          };
        }
      }

      let itemName = it.item_name;
      let unitOne = PIECE_ONE;
      let unitMany = PIECE_MANY;

      if (it.item_kind === "part_type" && it.part_type_id) {
        itemName = partTypesById.get(it.part_type_id)?.name ?? itemName;
      } else if (it.item_kind === "supply" && it.supply_id) {
        const sup = suppliesById.get(it.supply_id);
        if (sup) {
          itemName = sup.name;
          const unit = unitsById.get(sup.unit_id);
          if (unit) {
            unitOne = unit.label_one;
            unitMany = unit.label_many;
          }
        }
      }

      let brand = it.brand;
      let partNumber = it.part_number;
      if (it.item_kind === "part_type" && it.part_id && it.part_type_id && catalogId) {
        const key = `${it.part_type_id}:${it.part_id}`;
        const catPart = catalogPartsByKey.get(key);
        if (!catPart) {
          return {
            ok: false,
            status: 400,
            code: "line_item_part_not_for_car",
            error: "That part does not fit this car.",
          };
        }
        if (!brand && catPart.brand) brand = catPart.brand;
        if (!partNumber && catPart.partNumber) partNumber = catPart.partNumber;
      } else if (it.item_kind === "part_type" && it.part_id && it.part_type_id && !catalogId) {
        return {
          ok: false,
          status: 400,
          code: "line_item_part_not_for_car",
          error: "That part does not fit this car.",
        };
      }

      const unitLabel = qtyIsExactlyOne(it.qty) ? unitOne : unitMany;

      dbItems.push({
        source: it.source,
        job_item_id: it.job_item_id,
        item_kind: it.item_kind,
        part_type_id: it.part_type_id,
        supply_id: it.supply_id,
        part_id: it.part_id,
        part_source: it.part_source,
        item_name: itemName,
        unit_label: unitLabel,
        brand,
        part_number: partNumber,
        qty: it.qty,
        unit_cost: it.unit_cost,
      });
    }

    const row = mapApiLineToDb(
      raw,
      i,
      args.workOrderId ?? undefined,
      itemsAmount,
    );

    if (args.workOrderId) {
      const clientId = raw.id;
      if (clientId != null && isUuid(String(clientId)) && knownIds.has(String(clientId))) {
        row.id = String(clientId);
      } else {
        delete row.id;
      }
    } else {
      delete row.id;
    }

    if (row.recommended === true) {
      row.items = [];
      row.items_amount = 0;
      row.line_total = 0;
    } else {
      row.items = dbItems;
      row.items_amount = Number(itemsAmount) || 0;
      row.line_total = computeWoLineTotal(row);
    }
    outLines.push(row);
  }

  return { ok: true, lines: outLines };
}

export type SaveWorkOrderArgs = {
  orgId: string;
  actorId: string | null;
  status: string;
  workOrderId: string | null;
  expectedVersion: number | null;
  workOrder: Record<string, unknown>;
  lines: Record<string, unknown>[];
};

export async function callSaveWorkOrder(
  supabase: SupabaseClient,
  args: SaveWorkOrderArgs,
): Promise<
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; status: number; code: string; error: string }
> {
  if (!args.actorId) {
    return { ok: false, status: 401, code: "actor_required", error: "Sign in again." };
  }
  const { data, error } = await supabase.rpc("fleet_save_work_order", {
    p_organization_id: args.orgId,
    p_actor_id: args.actorId,
    p_status: args.status,
    p_work_order: args.workOrder,
    p_work_order_id: args.workOrderId,
    p_expected_version: args.expectedVersion,
    p_lines: args.lines,
  });
  if (error) {
    const mapped = mapSaveWorkOrderError(error.message ?? String(error));
    if (mapped.code === "line_items_amount_mismatch") {
      console.error("[fleet_save_work_order] line_items_amount_mismatch", error);
    }
    return { ok: false, ...mapped };
  }
  return { ok: true, data: (data || {}) as Record<string, unknown> };
}

export async function loadWorkOrderLinesForRpc(
  supabase: SupabaseClient,
  workOrderId: string,
): Promise<Record<string, unknown>[]> {
  const { data: lines, error: lineErr } = await supabase
    .from("maintenance_work_order_lines")
    .select("*")
    .eq("work_order_id", workOrderId)
    .is("voided_at", null)
    .order("sort_order", { ascending: true });
  if (lineErr) throw lineErr;
  const lineRows = (lines || []) as Record<string, unknown>[];
  if (!lineRows.length) return [];

  const { data: items, error: itemErr } = await supabase
    .from("maintenance_work_order_line_item")
    .select("*")
    .eq("work_order_id", workOrderId)
    .order("created_at");
  if (itemErr) throw itemErr;

  const itemsByLine = new Map<string, Record<string, unknown>[]>();
  for (const row of items || []) {
    const r = row as Record<string, unknown>;
    const lineId = String(r.work_order_line_id);
    const list = itemsByLine.get(lineId) || [];
    list.push({
      source: r.source,
      job_item_id: r.job_item_id,
      item_kind: r.item_kind,
      part_type_id: r.part_type_id,
      supply_id: r.supply_id,
      part_id: r.part_id,
      part_source: r.part_source,
      item_name: r.item_name,
      unit_label: r.unit_label,
      brand: r.brand,
      part_number: r.part_number,
      qty: r.qty != null ? String(r.qty) : "0",
      unit_cost: r.unit_cost != null ? String(r.unit_cost) : null,
    });
    itemsByLine.set(lineId, list);
  }

  return lineRows.map((line) => {
    const id = String(line.id);
    return {
      ...line,
      items: itemsByLine.get(id) ?? [],
      items_amount: line.items_amount ?? 0,
    };
  });
}

export async function loadLineItemsForWorkOrders(
  supabase: SupabaseClient,
  workOrderIds: string[],
): Promise<Map<string, Record<string, unknown>[]>> {
  const byLineId = new Map<string, Record<string, unknown>[]>();
  if (!workOrderIds.length) return byLineId;
  const { data, error } = await supabase
    .from("maintenance_work_order_line_item")
    .select("*")
    .in("work_order_id", workOrderIds)
    .order("created_at");
  if (error) throw error;
  const byLine = new Map<string, Record<string, unknown>[]>();
  for (const row of data || []) {
    const r = row as Record<string, unknown>;
    const lineId = String(r.work_order_line_id);
    const list = byLine.get(lineId) || [];
    list.push(mapDbLineItemToApi(r));
    byLine.set(lineId, list);
  }
  return byLine;
}

export function attachItemsToLines(
  lines: Record<string, unknown>[],
  itemsByLineId: Map<string, Record<string, unknown>[]>,
): Record<string, unknown>[] {
  return lines.map((line) => {
    const id = line.id != null ? String(line.id) : "";
    const items = id ? (itemsByLineId.get(id) ?? []) : [];
    return { ...mapDbLineToApiShim(line), items };
  });
}

function mapDbLineToApiShim(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    sortOrder: row.sort_order,
    systemId: row.system_id,
    componentId: row.component_id,
    systemCode: row.system_code,
    systemName: row.system_name,
    categoryId: row.component_id,
    categoryCode: row.component_code,
    categoryName: row.component_name,
    componentCode: row.component_code,
    componentName: row.component_name,
    action: row.action,
    qty: row.qty != null ? Number(row.qty) : undefined,
    unitPrice: row.unit_price != null ? Number(row.unit_price) : undefined,
    material: row.material != null ? Number(row.material) : undefined,
    labor: row.labor_amount != null ? Number(row.labor_amount) : undefined,
    laborAmount: row.labor_amount != null ? Number(row.labor_amount) : undefined,
    laborHours: row.labor_hours != null ? Number(row.labor_hours) : undefined,
    laborRate: row.labor_rate != null ? Number(row.labor_rate) : undefined,
    condition: row.condition,
    positions: row.positions,
    brand: row.brand,
    partNumber: row.part_number,
    warranty: row.warranty === true,
    complimentary: row.complimentary === true,
    partId: row.part_id,
    notes: row.notes,
    recommended: row.recommended === true,
    declined: row.declined === true,
    fromFoundLineId: row.from_found_line_id ?? null,
    closedAt: row.closed_at ?? null,
    closedReason: row.closed_reason ?? null,
    closedBy: row.closed_by ?? null,
    values: row.values_json,
    lineTotal: row.line_total != null ? Number(row.line_total) : undefined,
    itemsAmount: row.items_amount != null ? Number(row.items_amount) : 0,
    voidedAt: row.voided_at ?? null,
  };
}
