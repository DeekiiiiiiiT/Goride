/**
 * Server-authoritative toll period readiness (TR-C1 / Phase 4b).
 * Pure: counts + identity in → blockers + residual out.
 */
import type { StepCounts, StepId } from './tollPeriodStepTypes.ts';
import { TOLL_CARD_IDENTITY_EPS } from './tollCardIdentity.ts';

export type TollReadinessBlocker = {
  code: string;
  stepId?: StepId;
  count: number;
  amountMajor: number | null;
  drillPath: string;
};

export type TollPeriodIdentitySlice = {
  cardsNetLoss: number;
  eventsNetLoss: number;
  residual: number;
  withinTolerance: boolean;
};

export type TollPeriodSealSlice = {
  state: 'unknown' | 'open' | 'sealed' | 'partial';
  publishedDrivers: number;
  missingDrivers: string[];
};

export type TollPeriodReadiness = {
  weekKey: string;
  computedAt: string;
  readinessHash: string;
  steps: Record<StepId, StepCounts>;
  blockers: TollReadinessBlocker[];
  identity: TollPeriodIdentitySlice;
  seal: TollPeriodSealSlice;
  /** Sum of actionable across all steps — Finish / close gate. */
  actionableTotal: number;
};

const STEP_IDS: StepId[] = [
  'needs-review',
  'personal-use',
  'deadhead',
  'underpaid-claims',
  'dispute-refunds',
  'unlinked-refunds',
];

function emptySteps(): Record<StepId, StepCounts> {
  return {
    'needs-review': { actionable: 0, informational: 0 },
    'personal-use': { actionable: 0, informational: 0 },
    deadhead: { actionable: 0, informational: 0 },
    'underpaid-claims': { actionable: 0, informational: 0 },
    'dispute-refunds': { actionable: 0, informational: 0 },
    'unlinked-refunds': { actionable: 0, informational: 0 },
  };
}

/** Stable fingerprint of readiness inputs (not cryptographic). */
export function hashTollPeriodReadinessInputs(parts: {
  weekKey: string;
  steps: Record<StepId, StepCounts>;
  cardsNetLoss: number;
  eventsNetLoss: number;
  missingDrivers: string[];
}): string {
  const payload = JSON.stringify({
    w: parts.weekKey,
    s: parts.steps,
    c: parts.cardsNetLoss,
    e: parts.eventsNetLoss,
    m: [...parts.missingDrivers].sort(),
  });
  let h = 2166136261;
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `r${(h >>> 0).toString(16)}`;
}

export function computeIdentityResidualHelpers(input: {
  cardsNetLoss: number;
  eventsNetLoss: number;
  eps?: number;
}): TollPeriodIdentitySlice {
  const residual = Math.round((input.cardsNetLoss - input.eventsNetLoss) * 100) / 100;
  const eps = input.eps ?? TOLL_CARD_IDENTITY_EPS;
  return {
    cardsNetLoss: input.cardsNetLoss,
    eventsNetLoss: input.eventsNetLoss,
    residual,
    withinTolerance: Math.abs(residual) <= eps,
  };
}

/**
 * Build blockers from step actionable counts + optional identity / seal gaps.
 */
export function buildTollPeriodBlockers(input: {
  weekKey: string;
  steps: Record<StepId, StepCounts>;
  identity?: TollPeriodIdentitySlice;
  missingDrivers?: string[];
}): TollReadinessBlocker[] {
  const blockers: TollReadinessBlocker[] = [];
  for (const stepId of STEP_IDS) {
    const counts = input.steps[stepId] ?? { actionable: 0, informational: 0 };
    if (counts.actionable > 0) {
      blockers.push({
        code: `STEP_${stepId.replace(/-/g, '_').toUpperCase()}`,
        stepId,
        count: counts.actionable,
        amountMajor: null,
        drillPath: `toll-recon?week=${input.weekKey}&step=${stepId}`,
      });
    }
  }
  if (input.identity && !input.identity.withinTolerance) {
    blockers.push({
      code: 'IDENTITY_RESIDUAL',
      count: 1,
      amountMajor: input.identity.residual,
      drillPath: `toll-recon?week=${input.weekKey}&panel=identity`,
    });
  }
  const missing = input.missingDrivers ?? [];
  if (missing.length > 0) {
    blockers.push({
      code: 'TOLL_SEAL_DRIVER_MISSING',
      count: missing.length,
      amountMajor: null,
      drillPath: `toll-recon?week=${input.weekKey}&panel=seal`,
    });
  }
  return blockers;
}

/** Compare client step counts to server — returns mismatched step ids. */
export function diffClientServerStepCounts(
  client: Partial<Record<StepId, StepCounts>> | null | undefined,
  server: Record<StepId, StepCounts>,
): StepId[] {
  if (!client) return [];
  const mismatched: StepId[] = [];
  for (const stepId of STEP_IDS) {
    const c = client[stepId];
    if (!c) continue;
    const s = server[stepId];
    if (c.actionable !== s.actionable || c.informational !== s.informational) {
      mismatched.push(stepId);
    }
  }
  return mismatched;
}

export function computeTollPeriodReadiness(input: {
  weekKey: string;
  steps?: Record<StepId, StepCounts>;
  cardsNetLoss?: number;
  eventsNetLoss?: number;
  seal?: Partial<TollPeriodSealSlice>;
  computedAt?: string;
}): TollPeriodReadiness {
  const weekKey = String(input.weekKey || '').slice(0, 10);
  const steps = input.steps ?? emptySteps();
  const cardsNetLoss = Number(input.cardsNetLoss) || 0;
  const eventsNetLoss = Number(input.eventsNetLoss) || 0;
  const identity = computeIdentityResidualHelpers({ cardsNetLoss, eventsNetLoss });
  const missingDrivers = input.seal?.missingDrivers ?? [];
  const seal: TollPeriodSealSlice = {
    state: input.seal?.state ?? (missingDrivers.length > 0 ? 'partial' : 'unknown'),
    publishedDrivers: input.seal?.publishedDrivers ?? 0,
    missingDrivers,
  };
  const blockers = buildTollPeriodBlockers({
    weekKey,
    steps,
    identity,
    missingDrivers,
  });
  const actionableTotal = STEP_IDS.reduce((sum, id) => sum + (steps[id]?.actionable ?? 0), 0);
  const computedAt = input.computedAt ?? new Date().toISOString();
  return {
    weekKey,
    computedAt,
    readinessHash: hashTollPeriodReadinessInputs({
      weekKey,
      steps,
      cardsNetLoss,
      eventsNetLoss,
      missingDrivers,
    }),
    steps,
    blockers,
    identity,
    seal,
    actionableTotal,
  };
}

/**
 * Finish Reviewed gate (POST …/finish) — pure so orchestration tests can
 * cover Finish → readiness without HTTP. Seal remains a separate Close Week step.
 */
export function decideTollFinishAllowed(
  readiness: Pick<TollPeriodReadiness, 'blockers' | 'identity'>,
): { allowed: true } | { allowed: false; error: 'NOT_READY' } {
  const identityOk = readiness.identity.withinTolerance;
  const blockersEmpty = readiness.blockers.length === 0;
  if (!blockersEmpty || !identityOk) {
    return { allowed: false, error: 'NOT_READY' };
  }
  return { allowed: true };
}
