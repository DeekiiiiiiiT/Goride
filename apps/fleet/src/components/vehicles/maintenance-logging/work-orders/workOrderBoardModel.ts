/**
 * Maintenance step 11 (MER-15): the rules behind the Work orders tab, apart from the screen so they are tested.
 */
import type { WorkOrderBoardCard } from "../../../../types/maintenance";

export type BoardFilter = "open" | "done" | "cancelled" | "all";

export type Board = { open: WorkOrderBoardCard[]; done: WorkOrderBoardCard[]; cancelled: WorkOrderBoardCard[] };

/** Plate, car, garage, jobs or the driver's words — any of them finds the work order. */
export function matchesSearch(w: WorkOrderBoardCard, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const hay = [w.plate, w.make, w.model, w.year, w.garage, w.request?.text, ...w.jobs]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(needle);
}

/** The sections the chosen chip shows, searched. */
export function boardSections(board: Board, filter: BoardFilter, q: string) {
  const f = (list: WorkOrderBoardCard[]) => list.filter((w) => matchesSearch(w, q));
  // Newest work first: a service is dated by the day it was done, not the day its record was made.
  const byDate = (key: (w: WorkOrderBoardCard) => string | null) => (a: WorkOrderBoardCard, b: WorkOrderBoardCard) =>
    String(key(b) ?? "").localeCompare(String(key(a) ?? ""));
  return {
    open: filter === "open" || filter === "all" ? f(board.open) : [],
    done: filter === "done" || filter === "all" ? f(board.done).sort(byDate((w) => w.performedAtDate ?? w.closedAt)) : [],
    cancelled: filter === "cancelled" || filter === "all" ? f(board.cancelled).sort(byDate((w) => w.closedAt ?? w.openedAt)) : [],
  };
}

export function carName(w: Pick<WorkOrderBoardCard, "make" | "model" | "year">): string {
  return [w.make, w.model, w.year].filter(Boolean).join(" ") || "Car";
}

function dateText(iso: string, withTime = false): string {
  const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso);
  const day = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  if (!withTime) return day;
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${day}, ${time}`;
}

/** "At the garage since 26 Nov 2026, 9:30 AM · 1 day off the road" / "Approved, waiting to go in" / … */
export function whenLine(w: WorkOrderBoardCard): string {
  if (w.stage === "garage") {
    const since = w.offRoadAt ? `At the garage since ${dateText(w.offRoadAt, true)}` : "At the garage";
    if (w.daysOffRoad == null) return since;
    return `${since} · ${w.daysOffRoad === 0 ? "went in today" : `${w.daysOffRoad} day${w.daysOffRoad === 1 ? "" : "s"} off the road`}`;
  }
  if (w.stage === "waiting") return w.openedAt ? `Approved, waiting to go in · since ${dateText(w.openedAt)}` : "Approved, waiting to go in";
  if (w.stage === "decision") return w.request?.date ? `Driver asked on ${dateText(w.request.date, true)}` : "A driver asked for this";
  if (w.stage === "saving") return "A Log service save didn't finish. Open Log service to finish it.";
  if (w.stage === "done") {
    const bits = [w.performedAtDate ? dateText(w.performedAtDate) : null, w.odometer != null ? `${w.odometer.toLocaleString("en-US")} km` : null];
    return bits.filter(Boolean).join(" · ");
  }
  return w.cancelReason ? `Cancelled: ${w.cancelReason}` : "Cancelled";
}

export function money(n: number | null): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  return `J$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** What can be done to a work order from the tab, per stage. Mark done needs the request (it logs the service). */
export function boardActions(w: WorkOrderBoardCard) {
  return {
    approve: w.stage === "decision",
    decline: w.stage === "decision",
    takeIn: w.stage === "waiting",
    markDone: (w.stage === "waiting" || w.stage === "garage") && !!w.request,
    cancel: w.stage === "waiting" || w.stage === "garage",
    viewService: w.stage === "done",
  };
}

/** A cancel or decline reason must say something (the server refuses an empty one). */
export function reasonProblem(reason: string): string | null {
  return reason.trim().length >= 5 ? null : "Say why in a few words.";
}
