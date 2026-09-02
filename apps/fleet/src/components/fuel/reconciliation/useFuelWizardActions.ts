/**
 * Leakage review, second approve, evidence pack — extracted from FuelPeriodWizard.
 */
import { toast } from 'sonner';
import { api } from '../../../services/api';
import {
  downloadFuelEvidencePack,
  downloadFuelEvidencePackFromServer,
} from '../../../utils/fuelEvidencePack';
import { saveFuelLeakageReview } from '../../../utils/fuelLeakageReviewStore';
import { FUEL_STEP_ORDER, type FuelStepId } from '../../../utils/fuelPeriodGating';
import type { MoneyStripTotals } from './buildFuelWizardRows';

export async function ensureWizardPeriodId(input: {
  serverPeriodId: string | null;
  weekStart: string;
  weekEnd: string;
  setServerPeriodId: (id: string) => void;
}): Promise<string | null> {
  if (input.serverPeriodId) return input.serverPeriodId;
  const ensured = await api.ensureFuelReconciliationPeriod({
    weekStart: input.weekStart,
    weekEnd: input.weekEnd,
  });
  const pid = ensured?.id || null;
  if (pid) input.setServerPeriodId(pid);
  return pid;
}

export async function persistWizardStep(input: {
  serverPeriodId: string | null;
  weekStart: string;
  weekEnd: string;
  setServerPeriodId: (id: string) => void;
  step: FuelStepId;
  note?: string;
}) {
  try {
    const pid = await ensureWizardPeriodId(input);
    if (!pid) return;
    await api.updateFuelPeriodStep({
      periodId: pid,
      step: input.step,
      note: input.note || undefined,
    });
  } catch {
    /* offline — step stays local until next sync */
  }
}

export async function refreshSecondApproveActors(periodId: string): Promise<string[]> {
  const pack = await api.getFuelPeriodEvidencePack(periodId);
  return ((pack?.audit || []) as Array<{ action?: string; actor_id?: string }>)
    .filter((a) => a.action === 'second_approve')
    .map((a) => String(a.actor_id || ''))
    .filter(Boolean);
}

export async function recordWizardSecondApproval(input: {
  serverPeriodId: string | null;
  weekStart: string;
  weekEnd: string;
  setServerPeriodId: (id: string) => void;
  note?: string;
  setActors: (actors: string[]) => void;
}) {
  const pid = await ensureWizardPeriodId(input);
  if (!pid) throw new Error('Period missing');
  await api.secondApproveFuelPeriod({
    periodId: pid,
    note: input.note || undefined,
  });
  input.setActors(await refreshSecondApproveActors(pid));
  toast.success('Second approval recorded for your identity.');
}

export async function downloadWizardEvidencePack(input: {
  serverPeriodId: string | null;
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
  setServerPeriodId: (id: string) => void;
  strip: MoneyStripTotals;
  settlementRows: Array<{
    plate: string;
    cashFromEarnings: number;
    driverShare: number;
    netPay: number;
    status?: string;
  }>;
  openDisputeCount: number;
  leakageReviewed: boolean;
  stepNotes: Array<{ step: string; note: string; at: string }>;
  secondApproverConfirmed: boolean;
}) {
  try {
    const pid = await ensureWizardPeriodId(input);
    if (pid) {
      const pack = await api.getFuelPeriodEvidencePack(pid);
      downloadFuelEvidencePackFromServer({
        weekLabel: input.weekLabel,
        weekStart: input.weekStart,
        weekEnd: input.weekEnd,
        pack,
        fallbackStrip: input.strip,
        secondApproverConfirmed: input.secondApproverConfirmed,
      });
      return;
    }
  } catch {
    /* fall through to client pack */
  }
  downloadFuelEvidencePack({
    weekLabel: input.weekLabel,
    weekStart: input.weekStart,
    weekEnd: input.weekEnd,
    strip: input.strip,
    settlementRows: input.settlementRows,
    openDisputeCount: input.openDisputeCount,
    leakageReviewed: input.leakageReviewed,
    stepNotes: input.stepNotes,
    secondApproverConfirmed: input.secondApproverConfirmed,
  });
}

export function applyLocalLeakageReview(input: {
  weekStart: string;
  note: string;
  actorLabel?: string;
  actorId?: string | null;
}) {
  saveFuelLeakageReview(input.weekStart, {
    note: input.note,
    actorLabel: input.actorLabel,
  });
  return {
    at: new Date().toISOString(),
    by: input.actorId || input.actorLabel || null,
    note: input.note,
  };
}

export async function persistLeakageReviewToServer(input: {
  serverPeriodId: string | null;
  weekStart: string;
  weekEnd: string;
  setServerPeriodId: (id: string) => void;
  note: string;
}) {
  try {
    const pid = await ensureWizardPeriodId(input);
    if (!pid) return;
    await api.reviewFuelPeriodLeakage({ periodId: pid, note: input.note });
    await api.updateFuelPeriodStep({
      periodId: pid,
      step: 'settlement-preview',
      note: input.note,
    });
    toast.success('Gap acceptance saved for the org.');
  } catch {
    toast.message('Saved on this device — server sync failed. Retry when online.');
  }
}

export function settlementPreviewStepIndex() {
  return FUEL_STEP_ORDER.indexOf('settlement-preview');
}
