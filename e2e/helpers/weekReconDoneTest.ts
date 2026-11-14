/**
 * Week Reconciliation done-tests (audit §8): shared helpers. LOCAL database only.
 * Started by `pnpm test:week-recon`, which seeds the companies and writes
 * node_modules/.cache/week-recon-seed.json (the week keys each done-test uses).
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';
import { getLocalSupabaseKeys, signInPlatformAal2 } from './mmP01Auth';
import { execInventoryDb, queryInventoryDb } from './inventoryDoneTestDb';

export const WR_PASSWORD = 'WrDoneLocal2026!';
export const WR_USERS = {
  owner: 'wr-done-owner@local.test',
  manager: 'wr-done-manager@local.test',
  accountant: 'wr-done-accountant@local.test',
  viewer: 'wr-done-viewer@local.test',
  switchOff: 'wr-done-switchoff@local.test',
  uploader: 'wr-done-uploader@local.test',
  tagco: 'wr-done-tagco@local.test',
} as const;
export type WrUser = keyof typeof WR_USERS;

export type WrSeedPlan = {
  org: string;
  allWeeks: string[];
  doubleClick: string;
  twoTabs: string;
  oneTruth: string;
  locked: string;
  sharedLink: string;
  paused: string;
  viewerClose: string;
  legacy: string;
  uploadOrg: string;
  uploadWeek: string;
  tagOrg: string;
  tagWeek: string;
};

export function seedPlan(): WrSeedPlan {
  return JSON.parse(readFileSync(join(process.cwd(), 'node_modules', '.cache', 'week-recon-seed.json'), 'utf8')) as WrSeedPlan;
}

/** Refuses to run unless started by the local runner. */
export function requireLocalRun() {
  const url = process.env.WEEK_RECON_SUPABASE_URL || '';
  if (process.env.WEEK_RECON_E2E !== '1' || !/^http:\/\/(127\.0\.0\.1|localhost)/.test(url)) {
    throw new Error('Week Reconciliation done-tests run only through `pnpm test:week-recon` (local database).');
  }
}

/** Block every hosted Supabase call; the test fails if one is attempted. */
export function blockLiveSupabase(page: Page, hits: string[]) {
  void page.route('**/*supabase.co/**', (route) => {
    hits.push(`${route.request().method()} ${route.request().url()}`);
    void route.abort('blockedbyclient');
  });
}

export async function signInAs(page: Page, who: WrUser) {
  const { base, anonKey } = await getLocalSupabaseKeys();
  const signed = await signInPlatformAal2(base, anonKey, WR_USERS[who], WR_PASSWORD);
  const stored = {
    access_token: signed.access_token,
    refresh_token: signed.refresh_token,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: signed.user,
  };
  await page.addInitScript((s) => {
    const json = JSON.stringify(s);
    localStorage.setItem('sb-Goride-auth-token', json);
    localStorage.setItem('sb-127-auth-token', json);
    localStorage.setItem('sb-localhost-auth-token', json);
  }, stored);
}

async function waitForAppShell(page: Page) {
  await page.getByText('Loading application…').waitFor({ state: 'hidden', timeout: 120_000 }).catch(() => {});
  await page.getByText('Loading application...').waitFor({ state: 'hidden', timeout: 120_000 }).catch(() => {});
}

export async function openWeekList(page: Page) {
  await page.goto('/');
  await waitForAppShell(page);
  await page.goto('/week-reconciliation');
  await waitForAppShell(page);
  await expect(page.getByTestId('recon-week-list')).toBeVisible({ timeout: 120_000 });
}

export async function openWeekStep(page: Page, week: string, step: string) {
  await page.goto('/');
  await waitForAppShell(page);
  await page.goto(`/week-reconciliation?line=rideshare&week=${week}&step=${step}`);
  await waitForAppShell(page);
  await expect(page.getByTestId('recon-week-desk')).toBeVisible({ timeout: 120_000 });
}

const q = (s: string) => s.replace(/'/g, "''");

export function runIdFor(org: string, week: string): string {
  return queryInventoryDb(
    `SELECT id::text FROM recon.week_runs WHERE organization_id = '${q(org)}' AND service_line = 'rideshare' AND week_key = '${q(week)}'`,
  );
}

export function historyCount(runId: string, kind: string): number {
  return Number(queryInventoryDb(`SELECT count(*)::text FROM recon.run_events WHERE run_id = '${q(runId)}' AND kind = '${q(kind)}'`)) || 0;
}

export function setCalculatorPaused(paused: boolean) {
  execInventoryDb(`UPDATE recon.worker_control SET emergency_off = ${paused ? 'true' : 'false'} WHERE id = 1;`);
}

export { queryInventoryDb as queryDb, execInventoryDb as execDb };

/** A fresh browser page signed in as `who` (each person in their own context). */
export async function pageAs(browser: import('@playwright/test').Browser, who: WrUser, live: string[]) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  blockLiveSupabase(page, live);
  await signInAs(page, who);
  return { ctx, page };
}

/** Call the local server as `who` (used for "a third person changes the week"). */
export async function apiAs(who: WrUser, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const { base, anonKey } = await getLocalSupabaseKeys();
  const signed = await signInPlatformAal2(base, anonKey, WR_USERS[who], WR_PASSWORD);
  // The local edge runtime sometimes answers 502/503 while a worker restarts: retry with the
  // same headers (same Idempotency-Key), so a change that did land is not applied twice.
  for (let attempt = 1; ; attempt++) {
    const r = await fetch(`${base}/functions/v1${path}`, {
      method,
      headers: { Authorization: `Bearer ${signed.access_token}`, apikey: anonKey, 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    if ((r.status === 502 || r.status === 503) && attempt < 4) {
      await new Promise((res) => setTimeout(res, 2000 * attempt));
      continue;
    }
    return { status: r.status, body: text ? JSON.parse(text) : null };
  }
}

/**
 * Seal the week's tolls in the new toll system (Week Reconciliation step 3), the way the Seal button does:
 * read the toll desk for its week version, then send seal_week. Already sealed → nothing to do. The old
 * toll period "finish" route is gone (docs/toll-old-system-removal-audit.md).
 */
export async function tollDeskAs(who: WrUser, week: string): Promise<{ sealed: boolean; weekVersion: number }> {
  const { base, anonKey } = await getLocalSupabaseKeys();
  const signed = await signInPlatformAal2(base, anonKey, WR_USERS[who], WR_PASSWORD);
  const res = await fetch(`${base}/rest/v1/rpc/toll_v2_week_desk`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${signed.access_token}`, apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_week: week }),
  });
  const desk = (await res.json()) as { sealed?: boolean; weekVersion?: number };
  if (!res.ok) throw new Error(`toll desk ${week}: ${res.status} ${JSON.stringify(desk)}`);
  return { sealed: Boolean(desk.sealed), weekVersion: Number(desk.weekVersion ?? 0) };
}

/** Send a new-toll-system week command (seal_week / reopen_week) at the desk's current week version. */
export async function tollWeekCommandAs(
  who: WrUser,
  week: string,
  intent: 'seal_week' | 'reopen_week',
  extra: Record<string, unknown> = {},
  headers: Record<string, string> = {},
) {
  const desk = await tollDeskAs(who, week);
  return apiAs(who, 'POST', `/fleet-toll/toll/v2/commands/${intent}`, {
    week_key: week,
    expected_week_version: desk.weekVersion,
    command_id: crypto.randomUUID(),
    ...extra,
  }, { 'Idempotency-Key': crypto.randomUUID(), ...headers });
}

export async function sealTollsWeek(who: WrUser, week: string) {
  if ((await tollDeskAs(who, week)).sealed) return;
  const r = await tollWeekCommandAs(who, week, 'seal_week');
  if (r.status >= 300) throw new Error(`seal tolls ${week}: ${r.status} ${JSON.stringify(r.body)}`);
}

export function weekState(org: string, week: string): string {
  return queryInventoryDb(
    `SELECT state FROM recon.week_runs WHERE organization_id = '${q(org)}' AND service_line = 'rideshare' AND week_key = '${q(week)}'`,
  );
}

/** Open the week's Close step and start Close (the approval dialog opens). */
export async function startClose(page: Page, week: string) {
  await openWeekStep(page, week, 'close');
  const btn = page.getByTestId('recon-close-week');
  await expect(btn).toBeEnabled({ timeout: 60_000 });
  await btn.click();
  await expect(page.getByTestId('recon-approval-dialog')).toBeVisible();
}

/**
 * Import toll usage rows through the app's staged import (create → parse → commit), as the
 * toll upload does. Each toll: date + wall-clock time in Jamaica, a unique reference.
 */
export async function importTolls(
  who: WrUser,
  week: string,
  tolls: Array<{ date: string; time: string; ref: string; vehicleId: string; driverId: string; driverName: string }>,
) {
  const rows = tolls.map((t) => ({
    date: t.date, time: t.time, amount: -250, type: 'Usage', category: 'Toll Usage',
    description: 'Portmore Toll Plaza', vendor: 'Portmore Toll Plaza',
    vehicleId: t.vehicleId, vehiclePlate: t.vehicleId, driverId: t.driverId, driverName: t.driverName,
    paymentMethod: 'Tag Balance', status: 'Completed', isReconciled: false, referenceNumber: t.ref,
    metadata: { tollPlaza: 'Portmore Toll Plaza', imported: true, originalType: 'Usage', referenceNumber: t.ref, importMode: 'usage' },
  }));
  const csvText = `date,time,ref\n${tolls.map((t) => `${t.date},${t.time},${t.ref}`).join('\n')}\n`;
  const created = await apiAs(who, 'POST', '/fleet-core/recon/imports', { sourceId: 'toll_usage', fileName: `tolls-${week}.csv`, weekKey: week });
  if (created.status >= 300) throw new Error(`toll import create: ${created.status} ${JSON.stringify(created.body)}`);
  const id = created.body.importId;
  const parsed = await apiAs(who, 'POST', `/fleet-core/recon/imports/${id}/parse`, { mode: 'usage', weekKey: week, csvText, rows });
  if (parsed.status >= 300) throw new Error(`toll import parse: ${parsed.status} ${JSON.stringify(parsed.body)}`);
  const committed = await apiAs(who, 'POST', `/fleet-core/recon/imports/${id}/commit`, { idempotencyKey: crypto.randomUUID() });
  if (committed.status >= 300 || committed.body?.committed !== tolls.length) {
    throw new Error(`toll import commit: ${committed.status} ${JSON.stringify(committed.body)}`);
  }
}

/** Mark every missing file "no activity" and complete Upload inputs + Assign lines (the Tolls step opens). */
export async function walkWeekToTolls(who: WrUser, week: string) {
  const path = `/fleet-core/recon/runs/rideshare/${week}`;
  const days = Array.from({ length: 7 }, (_, i) => new Date(Date.parse(`${week}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10));
  const desk = await apiAs(who, 'GET', path);
  for (const s of desk.body.sources.filter((x: { requirement: string; status: string }) => x.requirement !== 'not_applicable' && x.status === 'missing')) {
    const v = (await apiAs(who, 'GET', path)).body.run.version;
    const r = await apiAs(who, 'POST', `${path}/sources/${s.id}/attest-none`, { days, reason: 'No activity this week', expectedVersion: v }, { 'Idempotency-Key': crypto.randomUUID() });
    if (r.status >= 300) throw new Error(`attest ${s.id}: ${r.status} ${JSON.stringify(r.body)}`);
  }
  for (const step of ['sources', 'attribution']) {
    const d = (await apiAs(who, 'GET', path)).body;
    const st = d.evaluation.steps.find((x: { id: string }) => x.id === step);
    if (!st || st.hidden || st.status === 'complete') continue;
    const r = await apiAs(who, 'POST', `${path}/steps/${step}/complete`, { expectedVersion: Number(d.run.version) }, { 'Idempotency-Key': crypto.randomUUID() });
    if (r.status >= 300) throw new Error(`complete ${step}: ${r.status} ${JSON.stringify(r.body)}`);
  }
}

/** One alert pass, the way live runs it every 10 minutes while the calculator is paused. */
export function runAlertPassLocal() {
  const url = process.env.WEEK_RECON_SUPABASE_URL || '';
  const key = process.env.WEEK_RECON_SERVICE_KEY || '';
  if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(url) || !key) throw new Error('local Supabase URL / service key not set');
  execSync('deno run --allow-env --allow-net --allow-read --no-check scripts/recon-worker-local.ts --alerts-only', {
    cwd: process.cwd(),
    env: { ...process.env, SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key },
    stdio: 'pipe',
    timeout: 120_000,
  });
}

/** Pause (or resume) the calculator as if it was switched at `since`. */
export function setCalculatorPausedSince(paused: boolean, since: string) {
  execInventoryDb(`UPDATE recon.worker_control SET emergency_off = ${paused ? 'true' : 'false'}, updated_at = '${q(since)}'::timestamptz WHERE id = 1;`);
}

/** The weeks seed-week-recon-closable.mjs brought to "ready to close", oldest first. */
export function closablePlan(): string[] {
  const plan = seedPlan() as WrSeedPlan & { closable?: string[] };
  if (!plan.closable || plan.closable.length < 3) throw new Error('seed has no closable weeks (seed-week-recon-closable.mjs)');
  return plan.closable;
}
