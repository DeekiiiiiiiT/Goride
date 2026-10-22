/**
 * Pure rules for background week calculation.
 * Screens never call this to run an engine. They only read the saved status.
 */

export type ProjectionUnitKind = "driver_week" | "vehicle_week" | "courier_week";

export type CloseWorkflowStep = "waiting" | "checking" | "blocked" | "freezing" | "done";

const MAX_ATTEMPTS = 5;

export function shouldEnqueueUnit(status: string | null | undefined): boolean {
  return status !== "pending";
}

export function nextAttemptStatus(attempts: number): "pending" | "failed" {
  if (attempts >= MAX_ATTEMPTS) return "failed";
  return "pending";
}

export function driftKindToBlockerCode(kind: string): string {
  if (kind === "fuel") return "FUEL_ENGINE_DRIFT";
  if (kind === "toll") return "TOLL_ENGINE_DRIFT";
  return "EARNINGS_ENGINE_DRIFT";
}

export function canonicalFactLines(
  rows: Array<{ id: string; updatedAt: string; amount: number }>,
  policyVersion: string,
): string {
  const lines = rows
    .map((row) => `${row.id}|${row.updatedAt}|${Number(row.amount) || 0}`)
    .sort();
  lines.push(`policy|${policyVersion}`);
  return lines.join("\n");
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function projectionStatusLine(
  pendingDrivers: number,
  failedDrivers: number,
  totalDrivers: number,
): string | null {
  if (failedDrivers > 0) {
    return failedDrivers === 1
      ? "Could not update 1 driver"
      : `Could not update ${failedDrivers} drivers`;
  }
  if (pendingDrivers > 0) {
    const total = Math.max(totalDrivers, pendingDrivers);
    return `Updating ${pendingDrivers} of ${total} drivers`;
  }
  return null;
}

/**
 * One step of Close. Safe to call again: a second click stays on the same step
 * until the facts are quiet, the fingerprints match, and nothing is blocking.
 */
export function advanceCloseWorkflow(input: {
  step: CloseWorkflowStep;
  pending: number;
  hashMismatches: number;
  blockers: number;
}): { step: CloseWorkflowStep; state: "running" | "blocked" | "succeeded" } {
  if (input.pending > 0 || input.hashMismatches > 0) {
    return { step: "waiting", state: "running" };
  }
  if (input.blockers > 0) {
    return { step: "blocked", state: "blocked" };
  }
  if (input.step === "waiting" || input.step === "checking") {
    return { step: "freezing", state: "running" };
  }
  return { step: "done", state: "succeeded" };
}

export function plainComputeFailure(message: string): string {
  if (/not having enough compute resources/i.test(message)) {
    return "This week is still updating. Wait a minute and try again.";
  }
  return message || "Could not update this week.";
}
