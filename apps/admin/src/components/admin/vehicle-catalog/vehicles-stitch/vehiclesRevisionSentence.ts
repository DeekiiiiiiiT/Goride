import type { CatalogRevisionRow } from "../vehiclesCatalogApi";

function formatVal(v: unknown): string {
  if (v == null || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function revisionPlainSentence(rev: CatalogRevisionRow): string {
  const actor = rev.actor?.trim() || "Someone";
  const oldR = rev.oldRow ?? {};
  const newR = rev.newRow ?? {};
  const keys = new Set([...Object.keys(oldR), ...Object.keys(newR)]);
  const changed = [...keys].filter((k) => JSON.stringify(oldR[k]) !== JSON.stringify(newR[k]));
  if (changed.length === 0) return `${actor} recorded a change`;
  const label = changed[0]!.replace(/_/g, " ");
  if (changed.length === 1) {
    return `${actor} changed ${label}: ${formatVal(oldR[changed[0]!])} → ${formatVal(newR[changed[0]!])}`;
  }
  return `${actor} updated ${changed.length} fields on this car`;
}

export function revisionCanUndo(_rev: CatalogRevisionRow): boolean {
  return false;
}
