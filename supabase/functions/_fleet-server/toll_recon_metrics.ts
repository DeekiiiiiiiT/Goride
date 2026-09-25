/**
 * Structured toll_recon.* metrics (audit §11 / docs/toll-recon-slos.md).
 * Grep: `"event":"toll_recon"`
 */

export type TollReconCommandOutcome =
  | "ok"
  | "PERIOD_SEALED"
  | "PERMISSION_DENIED"
  | "NOT_READY"
  | "version_conflict"
  | "error";

function emit(payload: Record<string, unknown>): void {
  console.log(
    JSON.stringify({
      event: "toll_recon",
      ts: new Date().toISOString(),
      ...payload,
    }),
  );
}

export function logTollReconCommand(payload: {
  name: string;
  outcome: TollReconCommandOutcome;
  weekKey?: string | null;
  durationMs?: number;
  detail?: string;
}): void {
  emit({
    metric: `toll_recon.command.${payload.name}.${payload.outcome}`,
    name: payload.name,
    outcome: payload.outcome,
    weekKey: payload.weekKey ?? null,
    duration_ms: payload.durationMs ?? null,
    detail: payload.detail ?? null,
  });
}

export function logTollReconEndpoint(payload: {
  route: string;
  durationMs: number;
  orgId?: string | null;
}): void {
  emit({
    metric: "toll_recon.endpoint.duration_ms",
    route: payload.route,
    duration_ms: payload.durationMs,
    orgId: payload.orgId ?? null,
  });
}

export function logTollReconLedgerLoads(payload: {
  pageOpenId: string;
  loads: number;
  from?: string | null;
  to?: string | null;
}): void {
  emit({
    metric: "toll_recon.ledger_loads_per_page_open",
    page_open_id: payload.pageOpenId,
    loads: payload.loads,
    from: payload.from ?? null,
    to: payload.to ?? null,
  });
}

export function logTollReconWeeksAwaitingTolls(payload: {
  orgId: string;
  count: number;
  weekKeys?: string[];
}): void {
  emit({
    metric: "toll_recon.weeks_awaiting_tolls",
    orgId: payload.orgId,
    count: payload.count,
    weekKeys: payload.weekKeys ?? [],
  });
}

export function logTollReconIdentityResidual(payload: {
  weekKey: string;
  absResidual: number;
}): void {
  emit({
    metric: "toll_recon.identity_residual_abs",
    weekKey: payload.weekKey,
    abs_residual: payload.absResidual,
  });
}

export function logTollReconWizardOpen(payload: {
  durationMs: number;
  weekKey?: string | null;
  driverId?: string | null;
}): void {
  emit({
    metric: "toll_recon.wizard_open.duration_ms",
    duration_ms: payload.durationMs,
    weekKey: payload.weekKey ?? null,
    driverId: payload.driverId ?? null,
  });
}
