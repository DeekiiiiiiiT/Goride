/**
 * Pass 5 / H-7: compare a closed week_statement to a fresh engine recompute.
 * Statement↔projection is tautological after cutover; this is the check that
 * can still fail.
 */
import { round2 } from './money.ts';
import type { WeekStatement, WeekStatementKind } from './weekStatement.ts';

const ENGINE_EPS_MINOR = 1; // 1 cent

export type StatementEngineDrift = {
  kind: WeekStatementKind;
  field: string;
  statementMinor: number;
  engineMinor: number;
  deltaMinor: number;
};

/** Fuel snapshot / consumption engine amounts (major). */
export type FuelEngineAmounts = {
  driverShare: number;
  companyShare: number;
};

/** Toll netting engine amounts (major). */
export type TollEngineAmounts = {
  totalSpend: number;
  chargedToDriver: number;
  reimbursed: number;
};

/** Commission + cash engine amounts (major). */
export type EarningsEngineAmounts = {
  driverShare: number;
  companyShare: number;
  tipsPaidToDriver: number;
  passengerCash: number;
  gross: number;
};

function majorToMinor(n: number): number {
  return Math.round((Number(n) || 0) * 100);
}

function pushField(
  out: StatementEngineDrift[],
  kind: WeekStatementKind,
  field: string,
  statementMinor: number,
  engineMinor: number,
) {
  const delta = statementMinor - engineMinor;
  if (Math.abs(delta) > ENGINE_EPS_MINOR) {
    out.push({ kind, field, statementMinor, engineMinor, deltaMinor: delta });
  }
}

export function compareFuelStatementVsEngine(
  statement: Pick<WeekStatement, 'amountsMinor' | 'kind'>,
  engine: FuelEngineAmounts,
): StatementEngineDrift[] {
  const out: StatementEngineDrift[] = [];
  pushField(
    out,
    'fuel',
    'driverShare',
    Math.round(Number(statement.amountsMinor?.driverShare) || 0),
    majorToMinor(engine.driverShare),
  );
  pushField(
    out,
    'fuel',
    'companyShare',
    Math.round(Number(statement.amountsMinor?.companyShare) || 0),
    majorToMinor(engine.companyShare),
  );
  return out;
}

export function compareTollStatementVsEngine(
  statement: Pick<WeekStatement, 'amountsMinor' | 'kind'>,
  engine: TollEngineAmounts,
): StatementEngineDrift[] {
  const out: StatementEngineDrift[] = [];
  pushField(
    out,
    'toll',
    'totalSpend',
    Math.round(Number(statement.amountsMinor?.totalSpend) || 0),
    majorToMinor(engine.totalSpend),
  );
  pushField(
    out,
    'toll',
    'chargedToDriver',
    Math.round(Number(statement.amountsMinor?.chargedToDriver) || 0),
    majorToMinor(engine.chargedToDriver),
  );
  pushField(
    out,
    'toll',
    'reimbursed',
    Math.round(Number(statement.amountsMinor?.reimbursed) || 0),
    majorToMinor(engine.reimbursed),
  );
  return out;
}

export function compareEarningsStatementVsEngine(
  statement: Pick<WeekStatement, 'amountsMinor' | 'kind'>,
  engine: EarningsEngineAmounts,
): StatementEngineDrift[] {
  const out: StatementEngineDrift[] = [];
  pushField(
    out,
    'earnings',
    'driverShare',
    Math.round(Number(statement.amountsMinor?.driverShare) || 0),
    majorToMinor(engine.driverShare),
  );
  pushField(
    out,
    'earnings',
    'companyShare',
    Math.round(Number(statement.amountsMinor?.companyShare) || 0),
    majorToMinor(engine.companyShare),
  );
  pushField(
    out,
    'earnings',
    'tipsPaidToDriver',
    Math.round(Number(statement.amountsMinor?.tipsPaidToDriver) || 0),
    majorToMinor(engine.tipsPaidToDriver),
  );
  pushField(
    out,
    'earnings',
    'passengerCash',
    Math.round(Number(statement.amountsMinor?.passengerCash) || 0),
    majorToMinor(engine.passengerCash),
  );
  pushField(
    out,
    'earnings',
    'gross',
    Math.round(Number(statement.amountsMinor?.gross) || 0),
    majorToMinor(engine.gross),
  );
  return out;
}

/** Map engine drifts to close-invariant style blockers (one per field). */
export function engineDriftsToCloseBlockers(
  drifts: readonly StatementEngineDrift[],
  ctx: { driverId?: string; week?: string },
): Array<{
  code: string;
  severity: 'block';
  driverId?: string;
  week?: string;
  persisted: number;
  expected: number;
  delta: number;
  message: string;
}> {
  const codeFor = (kind: WeekStatementKind): string => {
    if (kind === 'fuel') return 'FUEL_ENGINE_DRIFT';
    if (kind === 'toll') return 'TOLL_ENGINE_DRIFT';
    return 'EARNINGS_ENGINE_DRIFT';
  };
  const msgFor = (kind: WeekStatementKind, field: string): string => {
    if (kind === 'fuel') {
      return `Fuel seal no longer matches Consumption engine (${field}) — reseal before close`;
    }
    if (kind === 'toll') {
      return `Toll seal no longer matches event netting (${field}) — reseal before close`;
    }
    return `Earnings seal no longer matches commission/cash engines (${field}) — reseal before close`;
  };
  return drifts.map((d) => {
    const persisted = round2(d.statementMinor / 100);
    const expected = round2(d.engineMinor / 100);
    return {
      code: codeFor(d.kind),
      severity: 'block' as const,
      driverId: ctx.driverId,
      week: ctx.week,
      persisted,
      expected,
      delta: round2(persisted - expected),
      message: msgFor(d.kind, d.field),
    };
  });
}
