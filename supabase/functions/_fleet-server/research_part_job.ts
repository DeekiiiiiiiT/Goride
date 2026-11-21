/**
 * Pure pieces of a part research job (docs/research-engine-audit.md RE-02 / RE-19 / RE-27 / RE-28).
 * The worker does the reads and writes; everything that decides lives here and is unit-tested.
 */
import type { RuleRouted } from "./catalog_research_route.ts";

export type CarIdentity = {
  make?: string | null;
  model?: string | null;
  chassis_code?: string | null;
  engine_code?: string | null;
  drivetrain?: string | null;
  production_start_year?: number | null;
  production_end_year?: number | null;
  chassis_serial_from?: string | null;
  chassis_serial_to?: string | null;
};

const PART_NUMBER_SHAPE = /^[A-Za-z0-9][A-Za-z0-9-]{1,29}$/;

/** A customer-typed number is passed on only when it looks like a part number (RE-27). */
export function safeCandidateNumber(raw: string | null | undefined): string | null {
  const v = String(raw ?? "").trim();
  return PART_NUMBER_SHAPE.test(v) ? v : null;
}

/**
 * What goes to Google: the car's identity, the part type and the fit — never request text, notes or anything a
 * customer typed except a part-number-shaped candidate (RE-27).
 */
export function buildPartPromptContext(input: {
  car: CarIdentity;
  partTypeName: string;
  fitDescriptor?: string | null;
  candidateNumber?: string | null;
}): string {
  const c = input.car;
  const years = [c.production_start_year, c.production_end_year].filter((y) => y != null).join("-");
  const frame = [c.chassis_serial_from, c.chassis_serial_to].filter(Boolean).join(" to ");
  const lines = [
    `Car: ${[c.make, c.model].filter(Boolean).join(" ")}${years ? ` years ${years}` : ""}`,
    `Chassis: ${c.chassis_code || ""} Engine: ${c.engine_code || ""} Drivetrain: ${c.drivetrain || ""}`,
    frame ? `Frame numbers: ${frame}` : "",
    `Part type: ${input.partTypeName}`,
    input.fitDescriptor ? `Position: ${input.fitDescriptor}` : "",
  ];
  const cand = safeCandidateNumber(input.candidateNumber);
  if (cand) lines.push(`Candidate number to check: ${cand}`);
  return lines.filter(Boolean).join("\n");
}

export function buildPartSearchQuery(car: CarIdentity, partTypeName: string): string {
  return [car.make, car.model, car.chassis_code, car.engine_code, partTypeName, "part number"].filter(Boolean).join(" ");
}

/** Words that must sit in the same block as the number: frame code first, then model, then engine. */
export function identityTokens(car: CarIdentity): string[] {
  return [car.chassis_code, car.model, car.engine_code].map((t) => String(t ?? "").trim()).filter((t) => t.length >= 2);
}

/** "front" / "rear" from the job's fit; null when the part has no position. */
export function positionTokens(fitDescriptor: string | null | undefined): string[] | undefined {
  const f = String(fitDescriptor ?? "").toLowerCase();
  if (f.includes("rear")) return ["rear", "rr"];
  if (f.includes("front")) return ["front", "fr"];
  return undefined;
}

export function slotKeyFor(job: { vehicle_catalog_id?: string | null; maintenance_component_id?: string | null; fit_descriptor?: string | null }): string {
  return [job.vehicle_catalog_id ?? "", job.maintenance_component_id ?? "", (job.fit_descriptor ?? "").toLowerCase()].join("|");
}

export function positionKeyFor(fitDescriptor: string | null | undefined): string {
  const f = String(fitDescriptor ?? "").toLowerCase();
  return f.includes("rear") ? "rear" : f.includes("front") ? "front" : "";
}

export type JobOutcome =
  | "auto_added"
  | "needs_review"
  | "browser_check"
  | "browser_check_queued"
  | "not_found";

/**
 * Where the job goes after routing:
 * - anything auto-added → auto_added
 * - anything Confirmed or Needs checking to look at → needs_review
 * - nothing proven but a catalogue page the owner can check → browser_check (or queued past the cap, RE-28)
 * - nothing at all → not_found
 */
export function decideJobOutcome(input: {
  routed: RuleRouted[];
  hasBrowserCheckLink: boolean;
  browserCheckAllowed: boolean;
  openBrowserChecks: number;
  maxOpenBrowserChecks: number;
}): JobOutcome {
  if (input.routed.some((r) => r.route === "auto")) return "auto_added";
  if (input.routed.some((r) => r.trust === "confirmed")) return "needs_review";
  if (input.hasBrowserCheckLink && input.browserCheckAllowed) {
    return input.openBrowserChecks < input.maxOpenBrowserChecks ? "browser_check" : "browser_check_queued";
  }
  if (input.routed.length > 0) return "needs_review";
  return "not_found";
}

/** Brand as the trusted list knows it: alias table first, else lower-case trimmed. */
export function brandNorm(brand: string, aliases: Map<string, string>): string {
  const key = String(brand ?? "").trim().toLowerCase();
  const canonical = aliases.get(key);
  return (canonical ?? brand ?? "").trim().toLowerCase();
}
