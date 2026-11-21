/**
 * Inspection findings — pure helpers for found-line status and jobs payload.
 */

export type FoundLineStatus = "waiting" | "done" | "not_needed" | "service_deleted";

export type DoneByFoundLine = {
  workOrderId: string;
  performedAtDate: string | null;
  sameWorkOrder: boolean;
};

/** IF-19: only a completed, non-void child service closes a found job. */
export function childWorkOrderClosesFoundLine(wo: Record<string, unknown>): boolean {
  if (wo.voided_at != null) return false;
  return String(wo.status ?? "") === "completed";
}

export type FoundBlock = {
  status: FoundLineStatus;
  doneWorkOrderId: string | null;
  doneDate: string | null;
  doneSameDay: boolean;
  closedAt: string | null;
  closedByName: string | null;
};

export function buildFoundStatusForLine(args: {
  lineId: string;
  currentWorkOrderId: string;
  closedReason: string | null;
  closedAt: string | null;
  closedBy: string | null;
  doneByFoundId: Map<string, DoneByFoundLine>;
  closedByNames: Map<string, string>;
}): FoundBlock {
  const done = args.doneByFoundId.get(args.lineId);
  if (done) {
    return {
      status: "done",
      doneWorkOrderId: done.workOrderId,
      doneDate: done.performedAtDate,
      doneSameDay: done.sameWorkOrder,
      closedAt: args.closedAt != null ? String(args.closedAt) : null,
      closedByName: args.closedBy ? (args.closedByNames.get(String(args.closedBy)) ?? null) : null,
    };
  }
  const reason = args.closedReason != null ? String(args.closedReason) : null;
  if (reason === "not_needed") {
    return {
      status: "not_needed",
      doneWorkOrderId: null,
      doneDate: null,
      doneSameDay: false,
      closedAt: args.closedAt != null ? String(args.closedAt) : null,
      closedByName: args.closedBy ? (args.closedByNames.get(String(args.closedBy)) ?? null) : null,
    };
  }
  if (reason === "service_deleted") {
    return {
      status: "service_deleted",
      doneWorkOrderId: null,
      doneDate: null,
      doneSameDay: false,
      closedAt: args.closedAt != null ? String(args.closedAt) : null,
      closedByName: args.closedBy ? (args.closedByNames.get(String(args.closedBy)) ?? null) : null,
    };
  }
  return {
    status: "waiting",
    doneWorkOrderId: null,
    doneDate: null,
    doneSameDay: false,
    closedAt: null,
    closedByName: null,
  };
}

export function mapJobRecordsFindings(
  job: Record<string, unknown>,
  inspectionFindingsEnabled: boolean,
): Record<string, unknown> {
  const recordsFindings = inspectionFindingsEnabled && job.records_findings === true;
  return { ...job, recordsFindings };
}

export function enrichSectionsRecordsFindings(
  payload: {
    groups: Array<{
      sections: Array<{ jobs: Record<string, unknown>[] }>;
    }>;
    otherJobs: Record<string, unknown>[];
  },
  inspectionFindingsEnabled: boolean,
): typeof payload {
  return {
    groups: payload.groups.map((g) => ({
      ...g,
      sections: g.sections.map((s) => ({
        ...s,
        jobs: s.jobs.map((j) => mapJobRecordsFindings(j, inspectionFindingsEnabled)),
      })),
    })),
    otherJobs: payload.otherJobs.map((j) => mapJobRecordsFindings(j, inspectionFindingsEnabled)),
  };
}

export function mapFoundWorkCloseError(msg: string): { status: number; code: string; error: string } | null {
  const trimmed = String(msg ?? "").trim();
  if (trimmed.includes("found_line_not_open")) {
    return {
      status: 409,
      code: "found_line_not_open",
      error: "This found job is already closed. The list has been refreshed.",
    };
  }
  if (trimmed.includes("found_line_not_found")) {
    return { status: 404, code: "found_line_not_found", error: "Not found" };
  }
  if (trimmed.includes("actor_required")) {
    return { status: 401, code: "actor_required", error: "Sign in again." };
  }
  return null;
}