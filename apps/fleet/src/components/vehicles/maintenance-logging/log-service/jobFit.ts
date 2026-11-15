/**
 * Powertrain job fit in Log service (docs/powertrain-job-fit-audit.md PT-1, PT-7, section 4).
 * The server answers once per dialog open (GET /maintenance-categories?kind=component&vehicleId=…);
 * this file only reads that answer. The rule itself lives in the database (job_fits_car).
 */
import type { MaintenanceServiceCategory } from "../../../../types/maintenance";

export type FitAnswer = "yes" | "no" | "unknown";

export type JobFitState =
  /** Flag off (no jobFit in the answer): Log service is exactly today's. */
  | { status: "off" }
  | { status: "loading" }
  /** The check failed: show every job + "Couldn't check…" with Try again. */
  | { status: "error" }
  | { status: "known" | "unknown"; powertrain: string | null; fuel: string | null; fits: Map<string, FitAnswer> };

export function fitOf(state: JobFitState, jobId: string): FitAnswer {
  if (state.status !== "known" && state.status !== "unknown") return "unknown";
  return state.fits.get(jobId) ?? "unknown";
}

/** Hidden = the car's powertrain is known and the job doesn't fit. Unknown never hides anything. */
export function isNotUsual(state: JobFitState, jobId: string): boolean {
  return state.status === "known" && fitOf(state, jobId) === "no";
}

/** The car strip pill: "Petrol", "Hybrid", "Electric"… or "Engine type unknown". */
export function powertrainPill(state: JobFitState): string | null {
  if (state.status === "unknown") return "Engine type unknown";
  if (state.status !== "known") return null;
  const { powertrain: pt, fuel } = state;
  if (pt === "ice") return fuel === "diesel" ? "Diesel" : fuel === "cng" ? "CNG (gas)" : "Petrol";
  return (
    {
      mhev: "Mild hybrid",
      hev: "Hybrid",
      phev: "Plug-in hybrid",
      erev: "Range-extender",
      bev: "Electric",
      fcev: "Hydrogen fuel cell",
    } as Record<string, string>
  )[pt ?? ""] ?? "Engine type unknown";
}

/** Per group: how many of its active jobs fit (unknown counts as fitting) and how many are hidden. */
export function groupFitCounts(
  state: JobFitState,
  groupId: string,
  jobs: MaintenanceServiceCategory[],
): { fit: number; hidden: number } {
  let fit = 0;
  let hidden = 0;
  for (const j of jobs) {
    if (j.parent_id !== groupId) continue;
    if (isNotUsual(state, j.id)) hidden += 1;
    else fit += 1;
  }
  return { fit, hidden };
}

/** Split a list into the jobs shown normally and the "Not usual for this car" ones. */
export function splitByFit<T extends { id: string }>(state: JobFitState, list: T[]): { usual: T[]; notUsual: T[] } {
  const usual: T[] = [];
  const notUsual: T[] = [];
  for (const x of list) (isNotUsual(state, x.id) ? notUsual : usual).push(x);
  return { usual, notUsual };
}

/** Build the state from the server answer. No jobFit key = flag off. */
export function jobFitFromResponse(res: {
  items: Array<{ id: string; fits?: string }>;
  jobFit?: { status?: string; powertrain?: string | null; fuel?: string | null } | null;
}): JobFitState {
  const jf = res.jobFit;
  if (!jf) return { status: "off" };
  if (jf.status === "error") return { status: "error" };
  const fits = new Map<string, FitAnswer>();
  for (const it of res.items) {
    const f = it.fits;
    if (f === "yes" || f === "no" || f === "unknown") fits.set(it.id, f);
  }
  return {
    status: jf.status === "known" ? "known" : "unknown",
    powertrain: jf.powertrain ?? null,
    fuel: jf.fuel ?? null,
    fits,
  };
}
