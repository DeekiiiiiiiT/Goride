import type { PartsActivity } from "./PartsActivityPanel.types";

function str(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const t = String(row[key] ?? "").trim();
    if (t) return t;
  }
  return "";
}

function statusCategory(raw: string): "waiting" | "added" | "failed" {
  const s = raw.trim().toLowerCase();
  if (s === "resolved" || s === "found" || s === "added" || s === "closed") return "added";
  if (s === "rejected" || s === "cant_find" || s === "failed") return "failed";
  return "waiting";
}

function statusLabel(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (s === "resolved" || s === "added") return "Added";
  if (s === "in_progress" || s === "sourcing" || s === "looking") return "Roam researching";
  if (s === "open" || s === "pending") return "Sent";
  return raw.trim() || "Sent";
}

function formatShortDate(value: unknown): string {
  if (!value) return "";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function buildBrakesActivitySidebar(activity: PartsActivity | null) {
  const items = activity?.requests?.items ?? [];
  const pending = items
    .filter((row) => statusCategory(str(row, "status")) === "waiting")
    .slice(0, 3)
    .map((row, i) => {
      const plate = str(row, "plate", "license_plate");
      const vehicle = str(row, "vehicle_label", "car_label");
      const vehicleLine = [vehicle, plate].filter(Boolean).join(plate && vehicle ? " · " : "");
      return {
        id: String(row.id || `pending-${i}`),
        title: str(row, "need_text", "title") || "Part request",
        vehicleLine,
        statusLabel: statusLabel(str(row, "status")),
      };
    });

  const recentlyFound = items
    .filter((row) => statusCategory(str(row, "status")) === "added")
    .slice(0, 3)
    .map((row, i) => ({
      id: String(row.id || `found-${i}`),
      title: str(row, "need_text", "title") || "Part request",
      resultLine: str(row, "resolution_note", "resolved_part_label", "part_number") || "Added to your catalogue",
      dateLabel: formatShortDate(row.added_at || row.resolved_at || row.created_at),
    }));

  return { pending, recentlyFound };
}
