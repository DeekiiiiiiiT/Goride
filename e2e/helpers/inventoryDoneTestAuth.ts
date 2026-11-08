import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getLocalSupabaseKeys, signInPlatformAal2 } from './mmP01Auth';

export const INV_DONE_ORG = 'f6010000-0000-4000-8000-000000000099';
export const INV_DONE_PASSWORD = 'InvDoneLocal2026!';
export const INV_DONE_OWNER_EMAIL = 'inv-done-owner@local.test';
export const INV_DONE_APPROVER_EMAIL = 'inv-done-approver@local.test';
export const INV_DONE_VIEWER_EMAIL = 'inv-done-viewer@local.test';
export const INV_DONE_DRIVER_EMAIL = 'inv-done-driver@local.test';
export const INV_DONE_VEHICLE_1 = 'test-org-inv-veh-001';
export const INV_DONE_VEHICLE_2 = 'test-org-inv-veh-002';

function readConfigProjectRef(): string {
  try {
    const toml = readFileSync(join(process.cwd(), 'supabase', 'config.toml'), 'utf8');
    const m = toml.match(/^project_id\s*=\s*"([^"]+)"/m);
    if (m?.[1]) return m[1].trim();
  } catch {
    /* ignore */
  }
  return 'Goride';
}

export function inventoryE2eSupabaseProjectRef(): string {
  const fromEnv = process.env.INVENTORY_E2E_SUPABASE_PROJECT_REF?.trim();
  if (fromEnv) return fromEnv;
  return readConfigProjectRef();
}

export function applyInventoryDoneSeed(scenario?: string) {
  const args = scenario ? `seed --scenario=${scenario}` : 'seed';
  execSync(`node scripts/seed-inventory-done-tests.mjs ${args}`, {
    cwd: process.cwd(),
    stdio: 'inherit',
  });
}

export function teardownInventoryDone() {
  execSync('node scripts/seed-inventory-done-tests.mjs teardown', {
    cwd: process.cwd(),
    stdio: 'inherit',
  });
}

async function buildStoredSession(email: string) {
  const { base, anonKey } = await getLocalSupabaseKeys();
  const signed = await signInPlatformAal2(base, anonKey, email, INV_DONE_PASSWORD);
  return {
    stored: {
      access_token: signed.access_token,
      refresh_token: signed.refresh_token,
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: signed.user,
    },
    base,
    anonKey,
    projectRef: inventoryE2eSupabaseProjectRef(),
  };
}

const liveSupabaseHits: string[] = [];

export function resetInventoryNoLiveGuard() {
  liveSupabaseHits.length = 0;
}

export function getInventoryNoLiveHits(): readonly string[] {
  return liveSupabaseHits;
}

/** Block hosted Supabase; fail in afterEach if anything was recorded. */
export function attachInventoryNoLiveGuard(page: import('@playwright/test').Page) {
  resetInventoryNoLiveGuard();
  void page.route('**/*supabase.co/**', (route) => {
    liveSupabaseHits.push(`${route.request().method()} ${route.request().url()}`);
    void route.abort('blockedbyclient');
  });
}

export async function seedInventoryFleetSession(
  page: import('@playwright/test').Page,
  email = INV_DONE_OWNER_EMAIL,
) {
  const { stored, projectRef } = await buildStoredSession(email);

  await page.addInitScript(({ s, ref }) => {
    const json = JSON.stringify(s);
    localStorage.setItem(`sb-${ref}-auth-token`, json);
    // Fleet uses supabase-js's default key: first part of the API host (127.0.0.1 -> "127").
    localStorage.setItem('sb-127-auth-token', json);
    localStorage.setItem('sb-localhost-auth-token', json);
  }, { s: stored, ref: projectRef });
}

export async function seedInventoryDriverSession(page: import('@playwright/test').Page) {
  const { stored, projectRef } = await buildStoredSession(INV_DONE_DRIVER_EMAIL);
  await page.addInitScript(({ s, ref }) => {
    const json = JSON.stringify(s);
    localStorage.setItem(`sb-${ref}-auth-driver`, json);
    // Driver uses sb-<projectId>-auth-driver; projectId is "local" on a local Supabase host.
    localStorage.setItem('sb-local-auth-driver', json);
  }, { s: stored, ref: projectRef });
}

export async function gotoFleetInventory(page: import('@playwright/test').Page, tab = 'overview') {
  await page.goto('/');
  await page.getByText('Loading application…').waitFor({ state: 'hidden', timeout: 120_000 }).catch(() => {});
  await page.getByText('Loading application...').waitFor({ state: 'hidden', timeout: 120_000 }).catch(() => {});
  await page.goto(`/vehicle-operations/inventory?tab=${tab}`);
  await page.getByText('Loading application…').waitFor({ state: 'hidden', timeout: 120_000 }).catch(() => {});
  await page.getByText('Loading application...').waitFor({ state: 'hidden', timeout: 120_000 }).catch(() => {});
  await page.getByRole('heading', { name: /Inventory & Asset Management/i }).waitFor({ state: 'visible', timeout: 120_000 });
}

export async function gotoDriverCarKit(page: import('@playwright/test').Page) {
  const base = (process.env.DRIVER_BASE_URL || 'http://127.0.0.1:5174').replace(/\/$/, '');
  await page.goto(`${base}/car-kit`);
  await page.locator('.driver-car-kit-stitch').first().waitFor({ state: 'visible', timeout: 120_000 });
}
