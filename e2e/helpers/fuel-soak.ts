/**
 * Fuel recon shadow-soak helpers — checklist from docs/fuel-recon/server-engine-rollout.md
 * Keep free of @playwright/test runtime imports (avoids dual-instance describe errors).
 */
import fs from 'node:fs';
import path from 'node:path';

export const FUEL_WEEK_A = process.env.E2E_FUEL_WEEK?.trim() || '';
export const FUEL_WEEK_B = process.env.E2E_FUEL_WEEK_2?.trim() || '';
/** audit = verify closed weeks; close = attempt finalize (needs E2E_FUEL_ALLOW_FINALIZE=1). */
export const FUEL_SOAK_MODE = (process.env.E2E_FUEL_SOAK_MODE || 'audit').toLowerCase();
export const FUEL_ALLOW_FINALIZE = process.env.E2E_FUEL_ALLOW_FINALIZE === '1';
/** Never flips prod secrets unless explicitly set — still only records gate JSON when green. */
export const FUEL_FLIP_ENFORCE = process.env.E2E_FUEL_FLIP_ENFORCE === '1';

export type Stage0Gate = {
  playbookStatus: Record<string, unknown>;
  fuelServerEngineRollout: {
    currentProd: string;
    next: string | null;
    shadowMinWeeks: number;
    shadowStartedAt?: string;
    enforcedAt?: string | null;
    waitConditions: string[];
    doNotFlipProdEnforceUntil?: string;
  };
  soakChecklist?: string[];
  enforceFlipPlaybook?: { when?: string; rollback?: string };
};

export type SoakWeekReport = {
  weekStart: string;
  closedOrVerified: boolean;
  finalizeStatus?: number;
  finalizeError?: string | null;
  engineDiffs: Array<{
    mode?: string;
    mismatches: unknown[];
    authoritySourceByDriver?: Record<string, string>;
  }>;
  authorityOk: boolean;
  unexpectedShareDeltas: number;
  notes: string[];
};

export type SoakRunReport = {
  mode: string;
  weeks: SoakWeekReport[];
  checklistGreen: boolean;
  hardStopEnforce: boolean;
  reasons: string[];
  generatedAt: string;
};

export function loadStage0Gate(): Stage0Gate {
  const p = path.resolve(process.cwd(), 'docs/fuel-recon/stage0-gate.json');
  return JSON.parse(fs.readFileSync(p, 'utf8')) as Stage0Gate;
}

export function soakWeeksFromEnv(): string[] {
  return [FUEL_WEEK_A, FUEL_WEEK_B].filter((w) => /^\d{4}-\d{2}-\d{2}$/.test(w));
}

/** Gate: enforce flip only when shadow soak exit is satisfied in gate JSON + this run. */
export function evaluateEnforceHardStop(
  gate: Stage0Gate,
  run: Pick<SoakRunReport, 'checklistGreen' | 'weeks'>,
): { allowFlip: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const rollout = gate.fuelServerEngineRollout;
  if (rollout.currentProd !== 'shadow') {
    reasons.push(`currentProd is ${rollout.currentProd}, expected shadow before flip`);
  }
  if (gate.playbookStatus.soakExit !== 'done' && !run.checklistGreen) {
    reasons.push(`soakExit=${String(gate.playbookStatus.soakExit)} and this run is not green`);
  }
  if (gate.playbookStatus.n19AuthoritySource !== 'live') {
    reasons.push('n19AuthoritySource is not live');
  }
  if (gate.playbookStatus.breakGlassFinalizeUi !== 'done') {
    reasons.push('breakGlassFinalizeUi is not done');
  }
  if ((run.weeks || []).length < (rollout.shadowMinWeeks || 2)) {
    reasons.push(
      `need ≥${rollout.shadowMinWeeks || 2} soak weeks in this run (have ${run.weeks.length})`,
    );
  }
  if (!run.checklistGreen) {
    reasons.push('soak checklist not green for this run');
  }
  for (const w of run.weeks) {
    if (!w.authorityOk) reasons.push(`${w.weekStart}: authoritySourceByDriver missing/invalid`);
    if (w.unexpectedShareDeltas > 0) {
      reasons.push(`${w.weekStart}: ${w.unexpectedShareDeltas} unexpected share/category deltas`);
    }
  }
  return { allowFlip: reasons.length === 0, reasons };
}

export function assertEngineDiffN19(payload: Record<string, unknown>): {
  authorityOk: boolean;
  unexpectedShareDeltas: number;
} {
  const byDriver = (payload.authoritySourceByDriver || {}) as Record<string, string>;
  const mismatches = Array.isArray(payload.mismatches) ? payload.mismatches : [];
  const allowed = new Set([
    'server_entries',
    'trip_agg',
    'tagged_snap_entries',
    'snap_category_costs',
  ]);
  let authorityOk = Object.keys(byDriver).length > 0;
  for (const v of Object.values(byDriver)) {
    if (!allowed.has(String(v))) authorityOk = false;
  }
  for (const row of mismatches) {
    const r = row as { authoritySource?: string };
    if (r.authoritySource && !allowed.has(String(r.authoritySource))) authorityOk = false;
  }
  const unexpectedShareDeltas = mismatches.filter((row) => {
    const deltas = (row as { deltas?: Array<{ field?: string }> }).deltas || [];
    return deltas.some((d) =>
      [
        'driverShare',
        'companyShare',
        'rideShareCost',
        'companyUsageCost',
        'deadheadCost',
        'personalUsageCost',
      ].includes(String(d.field || '')),
    );
  }).length;
  return { authorityOk, unexpectedShareDeltas };
}

export async function extractSupabaseAccessToken(page: {
  evaluate: (fn: () => string | null) => Promise<string | null>;
}): Promise<string | null> {
  return page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (!key.includes('supabase') && !key.includes('auth')) continue;
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (typeof parsed.access_token === 'string' && parsed.access_token.length > 20) {
          return parsed.access_token;
        }
        const session = parsed.currentSession as { access_token?: string } | undefined;
        if (session?.access_token) return session.access_token;
      } catch {
        /* try next */
      }
    }
    return null;
  });
}

export async function collectEngineDiffsFromEvidencePack(
  pack: Record<string, unknown>,
): Promise<SoakWeekReport['engineDiffs']> {
  const audit = Array.isArray(pack.audit) ? pack.audit : [];
  const out: SoakWeekReport['engineDiffs'] = [];
  for (const row of audit) {
    const a = row as { action?: string; payload?: Record<string, unknown> };
    if (a.action !== 'fuel_engine_diff') continue;
    const payload = (a.payload && typeof a.payload === 'object' ? a.payload : {}) as Record<
      string,
      unknown
    >;
    out.push({
      mode: String(payload.mode || ''),
      mismatches: Array.isArray(payload.mismatches) ? payload.mismatches : [],
      authoritySourceByDriver: (payload.authoritySourceByDriver || undefined) as
        | Record<string, string>
        | undefined,
    });
  }
  return out;
}

export function writeSoakReport(report: SoakRunReport) {
  const dir = path.resolve(process.cwd(), 'docs/fuel-recon');
  const out = path.join(dir, 'soak-smoke-last-run.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  return out;
}

/** Continue through wizard steps until Finalize or a hard stop message. */
export async function walkWizardTowardFinalize(page: any, maxSteps = 8) {
  for (let i = 0; i < maxSteps; i++) {
    const finalize = page.getByRole('button', { name: /Finalize week/i });
    if (await finalize.isVisible().catch(() => false)) return 'finalize';
    const blocked = page.getByText(/Can’t finalize|Can't finalize|not fit to finalize|hard-block/i);
    if (await blocked.first().isVisible().catch(() => false)) return 'blocked';
    const cont = page.getByRole('button', { name: /^Continue$/i });
    if (!(await cont.isVisible().catch(() => false))) return 'stuck';
    if (await cont.isDisabled().catch(() => false)) return 'gated';
    await cont.click();
    await page.waitForTimeout(800);
  }
  return 'max_steps';
}
