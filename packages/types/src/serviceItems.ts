/** Service line items — shared by Fleet edge and UI. No imports. */

export type ItemNeed = "usually" | "sometimes";

export type JobItem = {
  linkId: string;
  kind: "part_type" | "supply";
  itemId: string;
  name: string;
  need: ItemNeed;
  qtyHint: number | null;
  note: string | null;
  sortOrder: number;
  unitLabelOne: string;
  unitLabelMany: string;
  defaultFitMode: string | null;
};

export type PartSource = "car" | "size" | "typed";

export type LineItemInput = {
  source: "suggested" | "other";
  jobItemId?: string | null;
  itemKind: "part_type" | "supply" | "other";
  partTypeId?: string | null;
  supplyId?: string | null;
  partId?: string | null;
  partSource?: PartSource | null;
  itemName?: string | null;
  brand?: string | null;
  partNumber?: string | null;
  qty: unknown;
  unitCost?: unknown;
};

export type LineItem = {
  id: string;
  source: "suggested" | "other";
  jobItemId: string | null;
  itemKind: "part_type" | "supply" | "other";
  partTypeId: string | null;
  supplyId: string | null;
  partId: string | null;
  partSource: PartSource | null;
  itemName: string;
  unitLabel: string;
  brand: string | null;
  partNumber: string | null;
  qty: number;
  unitCost: number | null;
  amount: number;
};

export type ParsedLineItem = {
  source: "suggested" | "other";
  job_item_id: string | null;
  item_kind: "part_type" | "supply" | "other";
  part_type_id: string | null;
  supply_id: string | null;
  part_id: string | null;
  part_source: PartSource | null;
  item_name: string;
  unit_label: string;
  brand: string | null;
  part_number: string | null;
  qty: string;
  unit_cost: string | null;
  amount_centi: bigint;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

function parseQtyToMilli(text: string): { ok: true; milli: bigint; qtyStr: string } | { ok: false; code: string } {
  const s = String(text).trim();
  if (!s) return { ok: false, code: "qty_invalid" };
  const m = /^(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) return { ok: false, code: "qty_invalid" };
  const frac = m[2] ?? "";
  if (frac.length > 3) return { ok: false, code: "qty_precision" };
  const intPart = BigInt(m[1]);
  const fracPadded = frac.padEnd(3, "0");
  const milli = intPart * 1000n + BigInt(fracPadded || "0");
  if (milli <= 0n) return { ok: false, code: "qty_invalid" };
  const qtyStr = frac.length > 0 ? `${m[1]}.${frac}` : m[1];
  return { ok: true, milli, qtyStr };
}

function parseCostToCenti(
  raw: unknown,
): { ok: true; centi: bigint | null; costStr: string | null } | { ok: false; code: string } {
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return { ok: true, centi: null, costStr: null };
  }
  const s = String(raw).trim();
  if (s.startsWith("-")) return { ok: false, code: "cost_invalid" };
  const m = /^(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) return { ok: false, code: "cost_invalid" };
  const frac = m[2] ?? "";
  if (frac.length > 2) return { ok: false, code: "cost_precision" };
  const intPart = BigInt(m[1]);
  const fracPadded = frac.padEnd(2, "0");
  const centi = intPart * 100n + BigInt(fracPadded || "0");
  const costStr = frac.length > 0 ? `${m[1]}.${frac}` : m[1];
  return { ok: true, centi, costStr };
}

function centiSumToAmountString(totalCenti: bigint): string {
  const neg = totalCenti < 0n;
  const abs = neg ? -totalCenti : totalCenti;
  const whole = abs / 100n;
  const frac = abs % 100n;
  const fracStr = frac.toString().padStart(2, "0");
  const body = `${whole}.${fracStr}`;
  return neg ? `-${body}` : body;
}

function optionalUuid(raw: unknown): string | null {
  if (raw == null || String(raw).trim() === "") return null;
  const s = String(raw).trim();
  return isUuid(s) ? s : "";
}

export type ParseLineItemsResult =
  | { ok: true; items: ParsedLineItem[]; itemsAmountCenti: bigint; itemsAmount: string }
  | { ok: false; code: string; index?: number };

export function parseLineItems(
  raw: unknown,
  ctx: { declined: boolean },
): ParseLineItemsResult {
  if (!Array.isArray(raw)) {
    if (raw === undefined || raw === null) {
      return { ok: true, items: [], itemsAmountCenti: 0n, itemsAmount: "0.00" };
    }
    return { ok: false, code: "items_invalid" };
  }
  if (raw.length > 30) return { ok: false, code: "too_many_items" };
  if (ctx.declined && raw.length > 0) return { ok: false, code: "line_items_on_declined" };

  const items: ParsedLineItem[] = [];
  let sumCenti = 0n;

  for (let index = 0; index < raw.length; index++) {
    const row = raw[index];
    if (!row || typeof row !== "object") return { ok: false, code: "item_invalid", index };

    const r = row as Record<string, unknown>;
    const source = String(r.source ?? "").trim();
    const itemKind = String(r.itemKind ?? r.item_kind ?? "").trim();

    if (source !== "suggested" && source !== "other") {
      return { ok: false, code: "source_invalid", index };
    }
    if (itemKind !== "part_type" && itemKind !== "supply" && itemKind !== "other") {
      return { ok: false, code: "item_kind_invalid", index };
    }
    if ((source === "other") !== (itemKind === "other")) {
      return { ok: false, code: "source_kind_mismatch", index };
    }

    const jobItemRaw = r.jobItemId ?? r.job_item_id;
    const jobItemId = optionalUuid(jobItemRaw);
    if (jobItemId === "") return { ok: false, code: "job_item_id_invalid", index };
    if (source === "suggested" && !jobItemId) return { ok: false, code: "job_item_id_required", index };
    if (source === "other" && jobItemId) return { ok: false, code: "job_item_id_not_allowed", index };

    const partTypeId = optionalUuid(r.partTypeId ?? r.part_type_id);
    const supplyId = optionalUuid(r.supplyId ?? r.supply_id);
    const partId = optionalUuid(r.partId ?? r.part_id);
    if (partTypeId === "" || supplyId === "" || partId === "") {
      return { ok: false, code: "item_id_invalid", index };
    }

    if (itemKind === "part_type") {
      if (!partTypeId || supplyId) return { ok: false, code: "item_identity_invalid", index };
    } else if (itemKind === "supply") {
      if (!supplyId || partTypeId) return { ok: false, code: "item_identity_invalid", index };
      if (partId) return { ok: false, code: "part_id_not_allowed", index };
      if (r.partNumber != null && String(r.partNumber).trim() !== ""
        || r.part_number != null && String(r.part_number).trim() !== "") {
        return { ok: false, code: "part_number_not_allowed", index };
      }
    } else {
      if (partTypeId || supplyId || partId) return { ok: false, code: "item_identity_invalid", index };
    }

    if (itemKind !== "part_type") {
      if (partId) return { ok: false, code: "part_id_not_allowed", index };
    }
    if (itemKind === "supply") {
      const pn = r.partNumber ?? r.part_number;
      if (pn != null && String(pn).trim() !== "") {
        return { ok: false, code: "part_number_not_allowed", index };
      }
    }

    const partSourceRaw = r.partSource ?? r.part_source;
    const partSourceProvided = partSourceRaw !== undefined && partSourceRaw !== null;
    let partSource: PartSource | null = null;
    if (partSourceProvided) {
      const s = String(partSourceRaw).trim();
      if (s === "") return { ok: false, code: "part_source_invalid", index };
      if (s !== "car" && s !== "size" && s !== "typed") {
        return { ok: false, code: "part_source_invalid", index };
      }
      partSource = s;
    } else if (itemKind === "part_type" && partId) {
      partSource = "car";
    }

    if (itemKind !== "part_type") {
      if (partSource != null) return { ok: false, code: "part_source_not_allowed", index };
    } else if (partSource != null) {
      if (partSource === "car" && !partId) {
        return { ok: false, code: "part_source_part_mismatch", index };
      }
      if ((partSource === "size" || partSource === "typed") && partId) {
        return { ok: false, code: "part_source_part_mismatch", index };
      }
    }

    let itemName = "";
    if (itemKind === "other") {
      const nameRaw = r.itemName ?? r.item_name;
      itemName = nameRaw != null ? String(nameRaw).trim() : "";
      if (itemName.length < 1 || itemName.length > 120) {
        return { ok: false, code: "item_name_required", index };
      }
    }

    let brand: string | null = null;
    const brandRaw = r.brand;
    if (brandRaw != null && String(brandRaw).trim() !== "") {
      brand = String(brandRaw).trim();
      if (brand.length > 80) return { ok: false, code: "brand_too_long", index };
    }

    let partNumber: string | null = null;
    if (itemKind === "part_type") {
      const pnRaw = r.partNumber ?? r.part_number;
      if (pnRaw != null && String(pnRaw).trim() !== "") {
        partNumber = String(pnRaw).trim();
        if (partNumber.length > 60) return { ok: false, code: "part_number_too_long", index };
      }
    } else if (itemKind === "other") {
      const pnRaw = r.partNumber ?? r.part_number;
      if (pnRaw != null && String(pnRaw).trim() !== "") {
        const cleaned = String(pnRaw).replace(/[^A-Za-z0-9-]/g, "").slice(0, 80);
        partNumber = cleaned.length > 0 ? cleaned : null;
      }
    }

    // Only a typed-in part must name something. A "fits by size" pick can come from a catalogue part with no
    // maker or part number (the picker allows it), so it isn't refused here.
    if (itemKind === "part_type" && partSource === "typed") {
      const hasBrand = brand != null;
      const hasPartNumber = partNumber != null;
      if (!hasBrand && !hasPartNumber) {
        return { ok: false, code: "part_source_needs_part", index };
      }
    }

    const qtyParsed = parseQtyToMilli(String(r.qty ?? ""));
    if (!qtyParsed.ok) return { ok: false, code: qtyParsed.code, index };

    const costParsed = parseCostToCenti(r.unitCost ?? r.unit_cost);
    if (!costParsed.ok) return { ok: false, code: costParsed.code, index };

    const costCenti = costParsed.centi ?? 0n;
    const amountCenti = (qtyParsed.milli * costCenti + 500n) / 1000n;
    sumCenti += amountCenti;

    items.push({
      source,
      job_item_id: jobItemId,
      item_kind: itemKind,
      part_type_id: partTypeId,
      supply_id: supplyId,
      part_id: partId,
      part_source: partSource,
      item_name: itemName,
      unit_label: "",
      brand,
      part_number: partNumber,
      qty: qtyParsed.qtyStr,
      unit_cost: costParsed.costStr,
      amount_centi: amountCenti,
    });
  }

  return {
    ok: true,
    items,
    itemsAmountCenti: sumCenti,
    itemsAmount: centiSumToAmountString(sumCenti),
  };
}
