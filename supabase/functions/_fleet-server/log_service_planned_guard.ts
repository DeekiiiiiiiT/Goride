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