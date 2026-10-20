/**
 * Week Reconciliation → Close Week source / step / attribution blockers (P4).
 * Default severity is warn until SOURCE_ENFORCE flip (docs/recon-source-enforce-flip.md).
 */
import type { CloseBlocker, CloseInvariantSeverity } from './closeInvariants.ts';
import { round2 } from './money.ts';
import { RECON_STEP_LABELS, type RunStepId } from './evaluateRun.ts';
import type { SourceAggregateStatus, SourceRequirement } from './reconSources.ts';
import { RECON_SOURCES } from './reconSources.ts';

export const RECON_SOURCE_BLOCKER_CODES = [
  'SOURCE_MISSING',
  'SOURCE_PARTIAL',
  'SOURCE_WAITING_EXTERNAL',
  'SOURCE_WAIVED',
  'SOURCE_ATTESTED_NONE',
  'STEP_STALE',
  'LINE_UNATTRIBUTED',
] as const;

export type ReconSourceBlockerCode = (typeof RECON_SOURCE_BLOCKER_CODES)[number];

export type ReconSourceCloseBlockerInput = {
  sourceId: string;
  label: string;
  status: SourceAggregateStatus;
  requirement: SourceRequirement;
  missingDays?: string[];
  attestedBy?: string | null;
  attestReason?: string | null;
};

export type ReconStepStaleInput = {
  stepId: RunStepId;
};

export type LineUnattributedInput = {
  rowCount: number;
  amountMajor: number;
};

function sourceLabel(id: string): string {
  return RECON_SOURCES.find((s) => s.id === id)?.label ?? id;
}

/** Warn-only codes stay warn even after enforce flip. */
export function reconSourceBlockerSeverity(
  code: string,
  opts?: { enforce?: boolean },
): CloseInvariantSeverity {
  const c = String(code || '').toUpperCase();
  if (c === 'SOURCE_WAIVED' || c === 'SOURCE_ATTESTED_NONE') return 'warn';
  if (
    c.startsWith('SOURCE_') ||
    c === 'STEP_STALE' ||
    c === 'LINE_UNATTRIBUTED'
  ) {
    return opts?.enforce ? 'block' : 'warn';
  }
  return 'block';
}

function statusToCode(status: SourceAggregateStatus): ReconSourceBlockerCode | null {
  switch (status) {
    case 'missing':
      return 'SOURCE_MISSING';
    case 'partial':
      return 'SOURCE_PARTIAL';
    case 'waiting_external':
      return 'SOURCE_WAITING_EXTERNAL';
    case 'waived':
      return 'SOURCE_WAIVED';
    case 'attested_none':
      return 'SOURCE_ATTESTED_NONE';
    default:
      return null;
  }
}

function formatMissingDays(days: string[]): string {
  if (days.length === 0) return '';
  if (days.length <= 3) return days.join(', ');
  return `${days.slice(0, 3).join(', ')} +${days.length - 3} more`;
}

/**
 * Build week-level close blockers from recon source snapshots, stale steps, and attribution.
 */
export function buildReconSourceCloseBlockers(input: {
  week?: string;
  sources: ReconSourceCloseBlockerInput[];
  staleSteps?: ReconStepStaleInput[];
  unattributed?: LineUnattributedInput | null;
  enforce?: boolean;
}): CloseBlocker[] {
  const out: CloseBlocker[] = [];
  const week = input.week;
  const enforce = Boolean(input.enforce);

  for (const src of input.sources) {
    if (src.requirement === 'not_applicable') continue;
    if (src.status === 'received' || src.status === 'not_applicable') continue;

    const code = statusToCode(src.status);
    if (!code) continue;

    // Optional sources only warn when partially/missing — never hard-block until enforce.
    if (src.requirement === 'optional' && code !== 'SOURCE_WAIVED' && code !== 'SOURCE_ATTESTED_NONE') {
      if (!enforce && (code === 'SOURCE_MISSING' || code === 'SOURCE_PARTIAL')) continue;
    }

    const label = src.label || sourceLabel(src.sourceId);
    let message = `${label} not ready for this week`;
    if (code === 'SOURCE_MISSING') {
      message = `${label} not uploaded for this week`;
    } else if (code === 'SOURCE_PARTIAL') {
      const n = src.missingDays?.length ?? 0;
      const days = formatMissingDays(src.missingDays ?? []);
      message =
        n > 0
          ? `${label} missing ${n} day(s): ${days}`
          : `${label} is only partially covered for this week`;
    } else if (code === 'SOURCE_WAITING_EXTERNAL') {
      message = `Waiting on Roam for ${label.toLowerCase()}`;
    } else if (code === 'SOURCE_WAIVED') {
      const who = src.attestedBy ? String(src.attestedBy) : 'ops';
      const reason = src.attestReason ? `: ${String(src.attestReason)}` : '';
      message = `${label} waived by ${who}${reason}`;
    } else if (code === 'SOURCE_ATTESTED_NONE') {
      const days = formatMissingDays(src.missingDays ?? []);
      message = days
        ? `No activity attested for ${days}`
        : `No activity attested for ${label.toLowerCase()}`;
    }

    out.push({
      code,
      severity: reconSourceBlockerSeverity(code, { enforce }),
      week,
      persisted: src.missingDays?.length ?? (code === 'SOURCE_PARTIAL' ? 1 : 0),
      expected: 0,
      delta: round2(src.missingDays?.length ?? 0),
      message,
    });
  }

  for (const stale of input.staleSteps ?? []) {
    const stepLabel = RECON_STEP_LABELS[stale.stepId] ?? stale.stepId;
    out.push({
      code: 'STEP_STALE',
      severity: reconSourceBlockerSeverity('STEP_STALE', { enforce }),
      week,
      persisted: 1,
      expected: 0,
      delta: 1,
      message: `${stepLabel} reviewed before new data arrived — re-review`,
    });
  }

  const un = input.unattributed;
  if (un && un.rowCount > 0) {
    out.push({
      code: 'LINE_UNATTRIBUTED',
      severity: reconSourceBlockerSeverity('LINE_UNATTRIBUTED', { enforce }),
      week,
      persisted: un.rowCount,
      expected: 0,
      delta: round2(un.amountMajor),
      message: `${un.rowCount} row(s) ($${Math.abs(un.amountMajor).toFixed(2)}) not assigned to Rideshare or Delivery`,
    });
  }

  return out;
}
