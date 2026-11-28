/**
 * Step 7 (MER-11, MER-12): the rules behind the "Fill in service history" dialog, kept apart from the screen so
 * they are tested on their own.
 */

export type HistoryPartRow = {
  schedule_id: string;
  category_name: string;
  position: string | null;
  last_km: number | null;
  last_date: string | null;
  last_source: "work_order" | "service_log" | "manual" | null;
  from_service_vendor: string | null;
  check_next_service: boolean;
  history_unknown: boolean;
};

/** What the person has typed or ticked on one row. */
export type HistoryEdit = { km: string; date: string; check: boolean };

/**
 * A part dated by a logged service is shown, never edited here: the service is the record. Older rows carry the
 * service's date with no source written, so any date not filled in by a person ("manual") counts as a service.
 */
export function isLoggedService(p: HistoryPartRow): boolean {
  if (p.last_source === "work_order" || p.last_source === "service_log") return true;
  return p.last_source == null && (p.last_km != null || p.last_date != null);
}

export function initialEdit(p: HistoryPartRow): HistoryEdit {
  return {
    km: p.last_km != null ? Number(p.last_km).toLocaleString("en-US") : "",
    date: p.last_date ?? "",
    check: p.check_next_service,
  };
}

/** "196,800" or "196 800" → 196800; empty → null; anything else → NaN. */
export function parseKm(text: string): number | null {
  const t = text.replace(/[,\s]/g, "").trim();
  if (!t) return null;
  if (!/^\d+(\.\d+)?$/.test(t)) return Number.NaN;
  return Number(t);
}

/** The problem with one row, in plain words, or null when it can be saved. */
export function rowProblem(edit: HistoryEdit, odometer: number | null, today: string): string | null {
  const km = parseKm(edit.km);
  if (km != null && Number.isNaN(km)) return "Type the km as a number.";
  if (km != null && odometer != null && km > odometer) {
    return `That is more than the car's ${odometer.toLocaleString("en-US")} km.`;
  }
  if (edit.date && edit.date > today) return "The date can't be in the future.";
  return null;
}

/** The row's state for the icon on the right: dated, ticked, or still unknown. */
export function rowState(p: HistoryPartRow, edit: HistoryEdit): "dated" | "check" | "unknown" {
  if (isLoggedService(p)) return "dated";
  if (parseKm(edit.km) != null || edit.date) return "dated";
  return edit.check ? "check" : "unknown";
}

/**
 * The rows to send: only the ones the person changed, and never a logged service. A row with a km or a date is
 * sent with them (the tick is dropped); a row with neither sends the tick.
 */
export function rowsToSave(
  parts: HistoryPartRow[],
  edits: Record<string, HistoryEdit>,
): Array<{ schedule_id: string; last_km: number | null; last_date: string | null; check_next_service: boolean }> {
  const out: Array<{ schedule_id: string; last_km: number | null; last_date: string | null; check_next_service: boolean }> = [];
  for (const p of parts) {
    if (isLoggedService(p)) continue;
    const e = edits[p.schedule_id];
    if (!e) continue;
    const before = initialEdit(p);
    const km = parseKm(e.km);
    const kmBefore = parseKm(before.km);
    const dated = km != null || !!e.date;
    const changed = km !== kmBefore || e.date !== before.date || (!dated && e.check !== before.check);
    if (!changed) continue;
    if (!dated && before.km === "" && before.date === "" && e.check === before.check) continue;
    out.push({
      schedule_id: p.schedule_id,
      last_km: km != null && !Number.isNaN(km) ? km : null,
      last_date: e.date || null,
      check_next_service: dated ? false : e.check,
    });
  }
  return out;
}

/** "Brake fluid · LF" */
export function partLabel(p: Pick<HistoryPartRow, "category_name" | "position">): string {
  return p.position ? `${p.category_name} · ${p.position}` : p.category_name;
}
