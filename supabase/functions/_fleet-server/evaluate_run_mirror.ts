/**
 * Keep in sync with packages/finance-core/src/evaluateRun.ts
 * Deno edge cannot import @roam/finance-core — mirror gate engine only.
 */

import {
  RECON_SOURCES,
  type ReconSourceId,
  type RunStepId,
  type SourceAggregateStatus,
} from "./recon_sources_mirror.ts";

export type { RunStepId };

export type StepStatus = "locked" | "ready" | "in_progress" | "complete" | "stale";

export type ReconSourceSnapshot = {
  id: ReconSourceId;
  status: SourceAggregateStatus;
  inputHash?: string | null;
};

export type StepCounts = {
  actionable: number;
  informational: number;
};

export type CompletedStepSnapshot = {
  stepId: RunStepId;
  completedAt?: string | null;
  inputsHashAtComplete?: string | null;
};

export type EvaluateRunStage = "collect" | "attribute" | "reconcile" | "settle" | "close";

export type EvaluatedStep = {
  id: RunStepId;
  status: StepStatus;
  lockedBy?: { kind: "source" | "step"; id: string; label: string };
  actionable: number;
  informational: number;
};

export type NextAction = {
  kind: "source" | "step" | "close" | "none";
  targetId: string;
  label: string;
};

export type EvaluateRunResult = {
  stage: EvaluateRunStage;
  steps: EvaluatedStep[];
  nextAction: NextAction;
};

export const RECON_STEP_ORDER: readonly RunStepId[] = [
  "sources",
  "attribution",
  "trips_earnings",
  "tolls",
  "tag_account",
  "fuel",
  "settlement_preview",
  "close",
] as const;

export const RECON_STEP_LABELS: Record<RunStepId, string> = {
  sources: "Upload inputs",
  attribution: "Assign service lines",
  trips_earnings: "Trips & earnings",
  tolls: "Tolls",
  tag_account: "Tag account",
  fuel: "Fuel",
  settlement_preview: "Settlement preview",
  close: "Close week",
};

const STEP_ORDER: RunStepId[] = [...RECON_STEP_ORDER];
const STEP_LABELS = RECON_STEP_LABELS;

const STAGE_BY_STEP: Record<RunStepId, EvaluateRunStage> = {
  sources: "collect",
  attribution: "attribute",
  trips_earnings: "reconcile",
  tolls: "reconcile",
  tag_account: "reconcile",
  fuel: "reconcile",
  settlement_preview: "settle",
  close: "close",
};

const SOURCE_BLOCKS = new Set<SourceAggregateStatus>([
  "missing",
  "partial",
  "waiting_external",
]);

function feedsByStep(): Map<RunStepId, ReconSourceId[]> {
  const map = new Map<RunStepId, ReconSourceId[]>();
  for (const def of RECON_SOURCES) {
    for (const step of def.feeds) {
      const cur = map.get(step) ?? [];
      cur.push(def.id);
      map.set(step, cur);
    }
  }
  return map;
}

const FEEDS_BY_STEP = feedsByStep();

function sourceLabel(id: ReconSourceId): string {
  return RECON_SOURCES.find((s) => s.id === id)?.label ?? id;
}

export function compositeInputsHashForStep(
  stepId: RunStepId,
  sources: ReconSourceSnapshot[],
): string {
  const ids = FEEDS_BY_STEP.get(stepId) ?? [];
  const parts = ids
    .map((id) => {
      const snap = sources.find((s) => s.id === id);
      return `${id}:${snap?.inputHash ?? ""}:${snap?.status ?? ""}`;
    })
    .sort();
  return parts.join("|");
}

function compositeHashForStep(stepId: RunStepId, sources: ReconSourceSnapshot[]): string {
  return compositeInputsHashForStep(stepId, sources);
}

function stepComplete(counts: StepCounts): boolean {
  return (counts.actionable ?? 0) === 0;
}

function pickStage(steps: EvaluatedStep[]): EvaluateRunStage {
  const active = steps.find((s) => s.status !== "complete" && s.status !== "locked");
  if (active) return STAGE_BY_STEP[active.id];
  const last = steps[steps.length - 1];
  return last ? STAGE_BY_STEP[last.id] : "collect";
}

function pickNextAction(steps: EvaluatedStep[], sources: ReconSourceSnapshot[]): NextAction {
  const blockingSource = sources.find((s) => SOURCE_BLOCKS.has(s.status));
  if (blockingSource) {
    return {
      kind: "source",
      targetId: blockingSource.id,
      label: `Provide ${sourceLabel(blockingSource.id)}`,
    };
  }
  const stale = steps.find((s) => s.status === "stale");
  if (stale) {
    return {
      kind: "step",
      targetId: stale.id,
      label: `Re-review ${STEP_LABELS[stale.id]}`,
    };
  }
  const inProgress = steps.find((s) => s.status === "in_progress");
  if (inProgress) {
    return {
      kind: "step",
      targetId: inProgress.id,
      label: STEP_LABELS[inProgress.id],
    };
  }
  const ready = steps.find((s) => s.status === "ready");
  if (ready) {
    return {
      kind: "step",
      targetId: ready.id,
      label: STEP_LABELS[ready.id],
    };
  }
  const allComplete = steps.every((s) => s.status === "complete");
  if (allComplete) {
    return { kind: "close", targetId: "close", label: "Close week" };
  }
  return { kind: "none", targetId: "", label: "—" };
}

export function evaluateRun(input: {
  sources: ReconSourceSnapshot[];
  stepCounts: Partial<Record<RunStepId, StepCounts>>;
  completedSteps: CompletedStepSnapshot[];
}): EvaluateRunResult {
  const { sources, stepCounts, completedSteps } = input;
  const steps: EvaluatedStep[] = [];
  let priorIncomplete = false;

  for (const stepId of STEP_ORDER) {
    const counts = stepCounts[stepId] ?? { actionable: 0, informational: 0 };
    const feeding = FEEDS_BY_STEP.get(stepId) ?? [];
    const blockingSource = feeding
      .map((id) => sources.find((s) => s.id === id))
      .find((s) => s && SOURCE_BLOCKS.has(s.status));

    let status: StepStatus;
    let lockedBy: EvaluatedStep["lockedBy"];

    if (blockingSource) {
      status = "locked";
      lockedBy = {
        kind: "source",
        id: blockingSource.id,
        label: sourceLabel(blockingSource.id),
      };
    } else if (priorIncomplete) {
      status = "locked";
      const blocker = steps.find((s) => s.status !== "complete");
      if (blocker) {
        lockedBy = { kind: "step", id: blocker.id, label: STEP_LABELS[blocker.id] };
      }
    } else {
      const done = completedSteps.find((c) => c.stepId === stepId);
      const completeByCounts = stepComplete(counts);
      const currentHash = compositeHashForStep(stepId, sources);
      const feedCount = (FEEDS_BY_STEP.get(stepId) ?? []).length;
      const stale =
        feedCount > 0 &&
        !!done?.inputsHashAtComplete &&
        done.inputsHashAtComplete !== currentHash &&
        completeByCounts;

      if (stale) {
        status = "stale";
      } else if (done && completeByCounts) {
        status = "complete";
      } else if (!completeByCounts) {
        status = "in_progress";
      } else if (done) {
        status = "complete";
      } else {
        status = "ready";
      }
    }

    steps.push({
      id: stepId,
      status,
      lockedBy,
      actionable: counts.actionable ?? 0,
      informational: counts.informational ?? 0,
    });

    if (status !== "complete") priorIncomplete = true;
  }

  return {
    stage: pickStage(steps),
    steps,
    nextAction: pickNextAction(steps, sources),
  };
}
