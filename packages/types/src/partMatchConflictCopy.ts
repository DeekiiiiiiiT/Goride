/** Human copy for part_match_conflict rows (AM-S5 / AM-24). */

export type ConflictDetail = Record<string, unknown>;

export type ConflictRowLike = {
  id?: string | null;
  conflict_type?: string | null;
  status?: string | null;
  vehicle_label?: string | null;
  car_label?: string | null;
  part_name?: string | null;
  group_code?: string | null;
  matched_key?: string | null;
  code?: string | null;
  detail?: ConflictDetail | string | null;
  part_listing_id?: string | null;
  manual_listing_group_code?: string | null;
  interchange_group_id?: string | null;
};

export const CONFLICT_TYPE_LABEL: Record<string, string> = {
  oe_ambiguous: "Same number, two parts",
  part_type_mismatch: "Wrong part type",
  position_side_mismatch: "Position or side differs",
  index_wear_sensor: "Wear sensor differs",
  index_merge_proposed: "Group merge suggested",
  system_link: "Whole-system link",
};

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function detailObj(row: ConflictRowLike): ConflictDetail {
  const raw = row.detail;
  if (raw && typeof raw === "object") return raw as ConflictDetail;
  if (typeof raw === "string" && raw.trim()) return { summary: raw.trim() };
  return {};
}

function carLabel(row: ConflictRowLike): string {
  return str(row.vehicle_label || row.car_label) || "this car";
}

function groupCode(row: ConflictRowLike): string {
  return str(row.group_code) || "this group";
}

function posSideLabel(pos: unknown, side: unknown): string {
  const p = str(pos);
  const s = str(side);
  if (!p && !s) return "—";
  const sideText = s === "both" || !s ? "Both" : s.charAt(0).toUpperCase() + s.slice(1);
  return `${p ? p.charAt(0).toUpperCase() + p.slice(1) : "—"} · ${sideText}`;
}

export function conflictTypeLabel(type: string | null | undefined): string {
  const t = str(type);
  return CONFLICT_TYPE_LABEL[t] || t || "Conflict";
}

export function conflictDetailSummary(row: ConflictRowLike): string {
  const d = detailObj(row);
  if (typeof d.summary === "string" && d.summary.trim()) return d.summary.trim();
  const type = str(row.conflict_type);
  const car = carLabel(row);
  const key = str(row.matched_key);
  const gc = groupCode(row);

  if (type === "oe_ambiguous") {
    if (row.manual_listing_group_code) {
      return `Conflict with existing manual catalog entry ${row.manual_listing_group_code}.`;
    }
    return `This car's number matches two different part groups.`;
  }
  if (type === "position_side_mismatch") {
    const expected = d.expected as Record<string, unknown> | undefined;
    const actual = d.actual as Record<string, unknown> | undefined;
    if (expected && actual) {
      return `The number says ${posSideLabel(expected.position, expected.side)}, your listing says ${posSideLabel(actual.position, actual.side).replace(" · ", " ")}.`;
    }
    return `Position or side differs for ${str(row.part_name) || gc} on ${car}.`;
  }
  if (type === "index_wear_sensor") {
    const val = str(d.value || key.split(":")[1]);
    return `Same WVA as ${str(row.part_name) || "grouped part"} but one has an integrated sensor.`;
  }
  if (type === "index_merge_proposed") {
    return `Group merge suggested for ${str(row.part_name) || gc} (${key || gc}).`;
  }
  if (type === "system_link") {
    return `Whole-system link needs review (${key || "platform link"}).`;
  }
  if (type === "part_type_mismatch") {
    return `Part type mismatch for ${key || gc} on ${car}.`;
  }
  return str(d.message) || str(row.code) || key || type;
}

export function conflictKeepImpact(row: ConflictRowLike): string {
  const type = str(row.conflict_type);
  const kept = groupCode(row);
  const d = detailObj(row);
  if (type === "index_merge_proposed") {
    const target = str(d.target_group_id || d.to_group);
    return target
      ? `Accepts the proposed merge into ${target}.`
      : "Accepts the proposed group merge.";
  }
  if (type === "system_link") {
    return "Confirms the whole-system link for the platform.";
  }
  if (type === "oe_ambiguous") {
    const others = groupIdsFromDetail(d).filter((id) => id !== str(row.interchange_group_id));
    const otherLabel = others.length ? "the other proposed group" : "the other group";
    return `Keeps ${kept} for this car and removes ${otherLabel} from it.`;
  }
  if (type === "position_side_mismatch") {
    const expected = d.expected as Record<string, unknown> | undefined;
    if (expected) {
      return `Accepts ${posSideLabel(expected.position, expected.side)} from the factory OE record.`;
    }
    return "Accepts the normalized position from the factory OE record.";
  }
  return "Confirms the engine proposal for this car.";
}

export function conflictMergeSamePartImpact(row: ConflictRowLike): string {
  const type = str(row.conflict_type);
  if (type !== "oe_ambiguous") {
    return "Combines both brand groups into one interchange group.";
  }
  const kept = groupCode(row);
  return `Merges both brand groups into ${kept}. Both parts stay; neither group is removed from the catalog.`;
}

export function conflictRemoveImpact(row: ConflictRowLike): string {
  const type = str(row.conflict_type);
  const gc = groupCode(row);
  if (type === "index_merge_proposed") {
    return "Leaves both groups separate; no merge is applied.";
  }
  if (type === "system_link") {
    return "Closes the proposal without changing manual listings.";
  }
  if (type === "oe_ambiguous") {
    return `Removes ${gc} from this car. It won't be suggested again.`;
  }
  if (type === "position_side_mismatch") {
    return "Keeps your manual listing as entered; the engine fit stays suppressed.";
  }
  return "Closes the proposal without deleting manual listings.";
}

function groupIdsFromDetail(d: ConflictDetail): string[] {
  const raw = d.group_ids;
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => str(v)).filter(Boolean);
}

/** Manual listing on this row or on a sibling group (oe_ambiguous). */
export function conflictManualWinsBanner(row: ConflictRowLike): {
  title: string;
  referenceLine: string;
} | null {
  const type = str(row.conflict_type);
  const manualCode = str(row.manual_listing_group_code);
  if (type === "oe_ambiguous" && manualCode) {
    return {
      title: `Group ${manualCode} already has a listing you entered for this car, so it stays. Both parts will show.`,
      referenceLine: `Conflict reference: ${str(row.code) || "—"} on ${carLabel(row)}.`,
    };
  }
  if (row.part_listing_id && type === "position_side_mismatch") {
    return {
      title: `Your hand-entered listing on ${groupCode(row)} takes precedence over the engine position.`,
      referenceLine: `Conflict reference: ${str(row.code) || "—"} on ${carLabel(row)}.`,
    };
  }
  return null;
}

export function conflictDrawerSubtitle(row: ConflictRowLike): string {
  const type = str(row.conflict_type);
  if (type === "oe_ambiguous") return "Direct catalog conflict detected by the auto-matching engine.";
  if (type === "system_link") return "Whole-system platform link awaiting architect review.";
  if (type === "index_merge_proposed") return "Index rule proposes merging interchange groups.";
  return "Catalog conflict detected by the auto-matching engine.";
}
