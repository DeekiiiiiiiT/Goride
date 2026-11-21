/**
 * Slice C — planned work orders are not services (LC-05).
 */

export const PLANNED_JOB_CONFLICT = {
  status: 409 as const,
  body: {
    code: "planned_job",
    error: "This job is on the Not done yet list. Use Log it now or Not needed.",
  },
};

export function isPlannedWorkOrder(wo: { status?: unknown } | null | undefined): boolean {
  return String(wo?.status ?? "").trim() === "planned";
}

export function plannedJobConflictResponse(): { status: 409; body: typeof PLANNED_JOB_CONFLICT.body } {
  return { status: PLANNED_JOB_CONFLICT.status, body: { ...PLANNED_JOB_CONFLICT.body } };
}

export function mapFleetPlanJobError(message: string): { status: number; code: string; error: string } | null {
  const msg = String(message ?? "").trim();
  const code = msg.split(/\s/)[0] ?? msg;
  if (code === "position_invalid") {
    return { status: 400, code: "position_invalid", error: "That position doesn't fit this job. Pick again." };
  }
  if (code === "vehicle_not_found" || code === "job_not_found" || code === "part_not_found") {
    return { status: 404, code, error: msg };
  }
  if (code === "actor_required") {
    return { status: 401, code: "actor_required", error: "Sign in again." };
  }
  return null;
}
/** LC-14 fleet_add_found_job errors → HTTP answers in plain words (plan-job ones first). */
export function mapFleetAddFoundJobError(message: string): { status: number; code: string; error: string } | null {
  const shared = mapFleetPlanJobError(message);
  if (shared) return shared;
  const msg = String(message ?? "").trim();
  const code = msg.split(/\s/)[0] ?? msg;
  if (code === "service_not_found") return { status: 404, code, error: "That inspection was not found." };
  if (code === "service_not_open_for_finds") {
    return { status: 409, code, error: "This service was deleted or isn't saved yet, so jobs can't be added to it." };
  }
  if (code === "not_an_inspection") {
    return { status: 409, code, error: "This service has no inspection, so it can't hold jobs it found." };
  }
  if (code === "quote_invalid") return { status: 400, code, error: "The quote must be a price from 0 up." };
  if (code === "found_line_not_found") return { status: 404, code, error: "That job was not found." };
  if (code === "found_line_not_open") return { status: 409, code, error: "This job is already done or closed, so its quote can't change." };
  if (code === "job_is_inspection") {
    return { status: 400, code, error: "Pick the job the inspection found, not an inspection." };
  }
  return null;
}
