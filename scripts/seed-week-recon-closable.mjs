#!/usr/bin/env node
/**
 * Week Reconciliation done-tests (LOCAL only): bring the oldest open weeks to
 * "ready to close" through the app's own server calls, the way a person would:
 *   every file "no activity" → toll week sealed in the new toll system → each step completed.
 * Runs after the edge functions are up. Needs SUPABASE_URL + SUPABASE_ANON_KEY.
 * Adds `closable` (oldest first) to node_modules/.cache/week-recon-seed.json.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const api = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(api)) {
  console.error(`seed-week-recon-closable: refuse non-local SUPABASE_URL: ${api}`);
  process.exit(1);
}
const anon = process.env.SUPABASE_ANON_KEY;
const planPath = join(process.cwd(), 'node_modules', '.cache', 'week-recon-seed.json');
const plan = JSON.parse(readFileSync(planPath, 'utf8'));

const login = await (await fetch(`${api}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: anon, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'wr-done-owner@local.test', password: 'WrDoneLocal2026!' }),
})).json();
if (!login.access_token) throw new Error(`owner sign-in failed: ${JSON.stringify(login)}`);
const H = { Authorization: `Bearer ${login.access_token}`, apikey: anon, 'Content-Type': 'application/json' };
const fn = `${api}/functions/v1`;

async function call(method, path, body) {
  // The local edge runtime sometimes answers 502/503 while a worker restarts; retry with the
  // same Idempotency-Key, so a change that did land is not applied twice.
  const key = crypto.randomUUID();
  for (let attempt = 1; ; attempt++) {
    const r = await fetch(`${fn}${path}`, {
      method,
      headers: { ...H, 'Idempotency-Key': key },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    if ((r.status === 502 || r.status === 503) && attempt < 4) {
      await new Promise((res) => setTimeout(res, 2000 * attempt));
      continue;
    }
    if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : {};
  }
}
const runPath = (w) => `/fleet-core/recon/runs/rideshare/${w}`;
const version = async (w) => Number((await call('GET', runPath(w))).run.version);

// The three oldest weeks that are still open (weeks close in order).
const closable = [];
for (const w of plan.allWeeks) {
  if (closable.length === 3) break;
  if ((await call('GET', runPath(w))).run.state !== 'closed') closable.push(w);
}

for (const week of closable) {
  const days = Array.from({ length: 7 }, (_, i) => new Date(Date.parse(`${week}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10));
  const desk = await call('GET', runPath(week));
  for (const s of desk.sources.filter((x) => x.requirement !== 'not_applicable' && x.status === 'missing')) {
    await call('POST', `${runPath(week)}/sources/${s.id}/attest-none`, { days, reason: 'No activity this week', expectedVersion: await version(week) });
  }
  // Tolls: seal the week in the new toll system, as step 3's Seal button does (the old period "finish" is gone).
  const tollDeskRes = await fetch(`${api}/rest/v1/rpc/toll_v2_week_desk`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ p_week: week }),
  });
  const tollDesk = await tollDeskRes.json();
  if (!tollDeskRes.ok) throw new Error(`toll desk ${week} → ${tollDeskRes.status} ${JSON.stringify(tollDesk).slice(0, 300)}`);
  if (!tollDesk.sealed) {
    await call('POST', '/fleet-toll/toll/v2/commands/seal_week', {
      week_key: week,
      expected_week_version: Number(tollDesk.weekVersion ?? 0),
      command_id: crypto.randomUUID(),
    });
  }
  for (const step of ['sources', 'attribution', 'tolls', 'fuel', 'trips_earnings', 'settlement_preview']) {
    const d = await call('GET', runPath(week));
    const s = d.evaluation.steps.find((x) => x.id === step);
    if (!s || s.hidden || s.status === 'complete') continue;
    await call('POST', `${runPath(week)}/steps/${step}/complete`, { expectedVersion: Number(d.run.version) });
  }
  const done = await call('GET', runPath(week));
  const close = done.evaluation.steps.find((x) => x.id === 'close');
  const open = done.evaluation.steps.filter((x) => !x.hidden && x.id !== 'close' && x.status !== 'complete').map((x) => `${x.id}:${x.status}`);
  if (open.length) throw new Error(`${week} not ready to close: ${open.join(', ')}`);
  console.log(`closable week ${week}: close step ${close?.status}`);
}

writeFileSync(planPath, JSON.stringify({ ...plan, closable }, null, 2));
console.log(`week recon closable weeks: ok (${closable.join(', ')})`);
