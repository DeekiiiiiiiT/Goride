export function formatKm(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${Math.round(n).toLocaleString("en-US")} km`;
}

export function formatInterval(km: number | null | undefined, months: number | null | undefined): string {
  const parts: string[] = [];
  if (km != null) parts.push(formatKm(km));
  if (months != null) parts.push(`${months} months`);
  if (!parts.length) return "—";
  return `${parts.join(" or ")} · whichever first`;
}

export function sourceLabel(source?: string | null): string {
  switch (source) {
    case "maker_manual":
      return "Car maker";
    case "part_maker":
      return "Part maker";
    default:
      return "Roam policy";
  }
}

export function scopeLabel(rule: {
  template_scope?: string;
  vehicle_catalog_id?: string | null;
  platform_id?: string | null;
  engine_family_id?: string | null;
}): string {
  const scope = String(rule.template_scope ?? "global");
  if (scope === "variant" || rule.vehicle_catalog_id) return "One car version";
  if (scope === "platform" && rule.platform_id) return "Platform";
  if (scope === "engine_family" && rule.engine_family_id) return "Engine";
  if (scope === "global") return "Everyone";
  return scope;
}

export function statusLabel(status?: string): string {
  switch (status) {
    case "active":
      return "Active";
    case "needs_checking":
      return "Needs checking";
    case "draft":
      return "Draft";
    case "retired":
      return "Retired";
    default:
      return status || "—";
  }
}

export function confidenceLabel(confidence?: string | null): string {
  switch (confidence) {
    case "confirmed":
      return "Confirmed";
    case "likely":
      return "Likely";
    default:
      return "Uncertain";
  }
}

function historyActorLabel(row: Record<string, unknown>): string {
  const label = row.actor_label ?? row.actor_name;
  if (label != null && String(label).trim() && String(label) !== "Staff") return String(label).trim();
  const actorId = row.actor ?? row.created_by;
  if (actorId != null && String(actorId).trim()) {
    const fromLabel = row.actor_label != null ? String(row.actor_label).trim() : "";
    if (fromLabel && fromLabel !== "Staff") return fromLabel;
    return String(actorId);
  }
  return "Roam setup";
}

export function historyPlainSentence(row: Record<string, unknown>): string {
  const actor = historyActorLabel(row);
  const oldRow = (row.old_row ?? {}) as Record<string, unknown>;
  const newRow = (row.new_row ?? {}) as Record<string, unknown>;
  const name = String(newRow.task_name ?? oldRow.task_name ?? "Schedule");
  const num = (v: unknown) => (v == null || v === "" ? null : Number(v));
  const pickKm = (r: Record<string, unknown>) => num(r.interval_km);
  const parts: string[] = [];
  const oldStatus = oldRow.status != null ? String(oldRow.status) : "";
  const newStatus = newRow.status != null ? String(newRow.status) : "";
  if (newStatus === "retired" && Object.keys(oldRow).length > 0) {
    const oldKm = pickKm(oldRow);
    const oldMo = num(oldRow.interval_months);
    const retiredInterval = formatInterval(oldKm, oldMo);
    if (retiredInterval !== "—") {
      parts.push(`retired: ${retiredInterval.replace(" · whichever first", "")}`);
    } else if (oldStatus && oldStatus !== "retired") {
      parts.push(`status from ${oldStatus} to retired`);
    }
  } else if (oldStatus && newStatus && oldStatus !== newStatus) {
    parts.push(`status from ${oldStatus} to ${newStatus}`);
  }
  const oldKm = pickKm(oldRow);
  const newKm = pickKm(newRow);
  const oldMo = num(oldRow.interval_months);
  const newMo = num(newRow.interval_months);
  if (newStatus !== "retired" && (oldKm !== newKm || oldMo !== newMo)) {
    const from = formatInterval(oldKm, oldMo);
    const to = formatInterval(newKm, newMo);
    if (Object.keys(oldRow).length === 0 && to !== "—") {
      parts.push(`added: ${to}`);
    } else if (from !== to) {
      parts.push(`interval from ${from} to ${to}`);
    }
  }
  const cars = row.cars_updated != null ? Number(row.cars_updated) : null;
  const carsBit =
    cars != null && Number.isFinite(cars) && cars > 0
      ? ` · ${cars} car${cars === 1 ? "" : "s"} updated`
      : "";
  if (parts.length) return `${actor} changed ${name}: ${parts.join("; ")}${carsBit}`;
  if (Object.keys(oldRow).length === 0 && Object.keys(newRow).length > 0) {
    return `${actor} created ${name}${carsBit}`;
  }
  return `${actor} updated ${name}${carsBit}`;
}

export function formatHistoryTimestamp(iso: unknown): string {
  if (!iso) return "—";
  const d = new Date(String(iso));
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function isCheckOnly(
  partKm: number | null | undefined,
  partMo: number | null | undefined,
  pkgKm: number | null | undefined,
  pkgMo: number | null | undefined,
): boolean {
  const kmLonger = partKm != null && pkgKm != null && partKm > pkgKm;
  const moLonger = partMo != null && pkgMo != null && partMo > pkgMo;
  return kmLonger || moLonger;
}

export const NIGHTLY_COPY = "tonight (2:00 AM Jamaica time)";
