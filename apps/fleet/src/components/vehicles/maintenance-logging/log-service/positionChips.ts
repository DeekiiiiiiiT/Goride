/**
 * "Where on the car" in Log service (docs/log-service-parts-gaps-audit.md, LS-01, LS-03, LS-04, LS-06, LS-07).
 * Pure rules only; the shared list of positions and labels lives in @roam/types/partPositions.
 */
import {
  fleetPositionOptions,
  isWheelScheme,
  NOT_SURE,
  positionsLabel,
  type PositionJobInput,
} from "@roam/types/partPositions";
import type { MaintenanceLogLine, MaintenanceServiceCategory } from "../../../../types/maintenance";
import { sidePositionsFor } from "./logServiceJobCost";

type JobLike = Pick<MaintenanceServiceCategory, "code" | "position_aware" | "position_scheme">;

export type PositionUi =
  /** No position on this job. */
  | { kind: "none" }
  /** Today's wheel buttons (LF/RF/LR/RR, or Left/Right on stabiliser links). Optional, no "Not sure". */
  | { kind: "wheels" }
  /** "Where on the car" chips. One must be picked before Save line ("Not sure" counts). */
  | { kind: "chips"; options: { code: string; label: string }[] };

/**
 * Which position control a job shows.
 * - Wheel jobs keep today's wheel buttons, optional, no "Not sure" (gate 4): position-aware jobs,
 *   stabiliser links, and every job on a wheel scheme (Shock absorber, Wheel Balancing, Tire Valve Stem).
 *   Wheel Balancing is priced per wheel, and its per-wheel cost needs the wheel buttons (audit Rev 3.1).
 * - Switch off: every other job is as today (no position).
 * - Switch on: any other job with a scheme shows the chips, "Not sure" included.
 */
export function positionUiFor(job: JobLike | null | undefined, gapsOn: boolean): PositionUi {
  if (!job) return { kind: "none" };
  if (sidePositionsFor(job) || job.position_aware === true || isWheelScheme(job.position_scheme)) {
    return { kind: "wheels" };
  }
  if (!gapsOn) return { kind: "none" };
  const options = fleetPositionOptions(job);
  return options.length ? { kind: "chips", options } : { kind: "none" };
}

/** Tap a chip: several can be picked; "Not sure" is picked on its own. */
export function togglePositionCode(current: string[], code: string): string[] {
  if (current.includes(code)) return current.filter((c) => c !== code);
  if (code === NOT_SURE) return [NOT_SURE];
  return [...current.filter((c) => c !== NOT_SURE), code];
}

/** Save line waits until a chip is picked (chips jobs only; wheel jobs never wait). */
export function positionMissing(ui: PositionUi, positions: string[]): boolean {
  return ui.kind === "chips" && positions.length === 0;
}

/**
 * "Log it now" (LS-06): keep the found job's positions that the job still allows. If its scheme changed
 * since, the codes it no longer has are dropped, and the chips ask again (no 400).
 */
export function keepAllowedPositions(ui: PositionUi, positions: string[] | null | undefined): string[] {
  const list = (positions ?? []).filter(Boolean);
  if (ui.kind === "wheels") return list;
  if (ui.kind === "none") return [];
  const allowed = new Set(ui.options.map((o) => o.code));
  const kept = list.filter((c) => allowed.has(c));
  return kept.includes(NOT_SURE) && kept.length > 1 ? kept.filter((c) => c !== NOT_SURE) : kept;
}

/**
 * A line as it is sent (LS-05, golden rule 10). The screen-only fields never go out.
 * - A saved line (has an id) sends `positions` only when a chip was tapped; otherwise the key is left
 *   out and the server keeps what it has. Tapped to nothing sends [] (cleared).
 * - A new line sends its positions when it has any; none picked sends no key (stored empty either way).
 */
export function positionsForWire(line: MaintenanceLogLine): MaintenanceLogLine {
  const { positionsTouched, positionScheme: _ps, positionAware: _pa, positions, ...rest } = line;
  if (line.id) return positionsTouched ? { ...rest, positions: [...(positions ?? [])] } : rest;
  return positions?.length ? { ...rest, positions: [...positions] } : rest;
}

/** The job a saved line was logged for, as far as positions go. */
export function positionJobFromLine(
  line: Pick<MaintenanceLogLine, "categoryCode" | "positionScheme" | "positionAware">,
): PositionJobInput {
  return {
    code: line.categoryCode ?? null,
    position_scheme: line.positionScheme ?? null,
    position_aware: line.positionAware ?? null,
  };
}

/** "Front (before converter)", "Driver, Passenger", "LF, RF" — or null when the line has no position. */
export function linePositionsText(
  line: Pick<MaintenanceLogLine, "categoryCode" | "positionScheme" | "positionAware" | "positions">,
): string | null {
  const codes = (line.positions ?? []).filter(Boolean);
  if (!codes.length) return null;
  return positionsLabel(positionJobFromLine(line), codes);
}
