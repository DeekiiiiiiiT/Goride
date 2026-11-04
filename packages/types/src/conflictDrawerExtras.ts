import type { ConflictRowLike } from "./partMatchConflictCopy";

export type ConflictInvolvedGroup = {
  group_id?: string;
  group_code: string;
  subtitle: string;
};

export type ConflictGeometryVerification = {
  title: string;
  image_url?: string | null;
  spec_line: string;
};

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

export function conflictVehicleSpecLine(row: ConflictRowLike & { vehicle_spec_line?: string | null }): string {
  const preset = str(row.vehicle_spec_line);
  if (preset) return preset;
  return "";
}

export function conflictInvolvedGroups(
  row: ConflictRowLike & { involved_groups?: ConflictInvolvedGroup[] | null },
): ConflictInvolvedGroup[] {
  const preset = row.involved_groups;
  if (Array.isArray(preset) && preset.length) {
    return preset.map((g) => ({
      group_id: g.group_id,
      group_code: str(g.group_code) || "Group",
      subtitle: str(g.subtitle) || "—",
    }));
  }
  const gc = str(row.group_code);
  const pn = str(row.part_name);
  if (!gc && !pn) return [];
  return [{ group_code: gc || "Group", subtitle: pn || "—" }];
}

export function conflictNumbersInvolved(
  row: ConflictRowLike & {
    number_label?: string | null;
    number_source_url?: string | null;
    number_source_host?: string | null;
  },
): { label: string; source_url: string | null; source_host: string | null } {
  const key = str(row.matched_key);
  const label = str(row.number_label) || (key ? `Factory OE: ${key}` : "—");
  const source_url = str(row.number_source_url) || null;
  const source_host = str(row.number_source_host) || (source_url ? hostFromUrl(source_url) : null);
  return { label, source_url, source_host };
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function conflictResolvedFooter(
  row: ConflictRowLike & {
    resolved_by_display?: string | null;
    resolved_at?: string | null;
    resolution_note?: string | null;
  },
): string | null {
  const note = str(row.resolution_note);
  const who = str(row.resolved_by_display);
  const at = str(row.resolved_at);
  if (!who && !note) return null;
  const datePart = at
    ? new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "";
  const whoPart = who ? `Resolved by ${who}${datePart ? ` on ${datePart}` : ""}` : datePart ? `Resolved on ${datePart}` : "Resolved";
  return note ? `${whoPart} · "${note}"` : whoPart;
}

export function conflictGeometryVerification(
  row: ConflictRowLike & { geometry_verification?: ConflictGeometryVerification | null },
): ConflictGeometryVerification | null {
  const g = row.geometry_verification;
  if (g && str(g.title)) {
    return {
      title: str(g.title),
      image_url: g.image_url ?? null,
      spec_line: str(g.spec_line) || "Confirm thickness tolerance before Keep commit.",
    };
  }
  return null;
}

export function formatGeometrySpecLine(parts: {
  width_mm?: number | string | null;
  height_mm?: number | string | null;
  thickness_mm?: number | string | null;
}): string {
  const w = parts.width_mm;
  const h = parts.height_mm;
  const t = parts.thickness_mm;
  const segs: string[] = [];
  if (w != null && w !== "") segs.push(`Width: ${w}mm`);
  if (h != null && h !== "") segs.push(`Height: ${h}mm`);
  if (t != null && t !== "") segs.push(`Thickness: ${t}mm`);
  const base = segs.length ? `${segs.join(" · ")}.` : "";
  return base
    ? `${base} Confirm thickness tolerance before Keep commit.`
    : "Confirm thickness tolerance before Keep commit.";
}
