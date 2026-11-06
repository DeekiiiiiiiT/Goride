#!/usr/bin/env node
/** Build Fleet + Driver preview bundles for inventory done-tests (local Supabase only). */
import { execSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function readLocalSupabaseStatus() {
  const out = execSync('npx supabase status -o json', {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, CI: '1', NO_COLOR: '1' },
  });
  const start = out.indexOf('{');
  const end = out.lastIndexOf('}');
  const st = JSON.parse(out.slice(start, end + 1));
  const apiUrl = (st.API_URL || 'http://127.0.0.1:54321').replace(/\/$/, '');
  const anonKey = st.ANON_KEY;
  if (!anonKey) {
    console.error('build-inventory-e2e-previews: missing ANON_KEY from supabase status');
    process.exit(1);
  }
  return { apiUrl, anonKey };
}

function readConfigProjectId() {
  const toml = readFileSync(join(root, 'supabase', 'config.toml'), 'utf8');
  const m = toml.match(/^project_id\s*=\s*"([^"]+)"/m);
  return m?.[1]?.trim() || 'Goride';
}

const { apiUrl, anonKey } = readLocalSupabaseStatus();
const projectRef = process.env.INVENTORY_E2E_SUPABASE_PROJECT_REF?.trim() || readConfigProjectId();

const sharedEnv = {
  ...process.env,
  VITE_SUPABASE_URL: apiUrl,
  VITE_SUPABASE_ANON_KEY: anonKey,
  VITE_SUPABASE_PROJECT_ID: projectRef,
};

const fleetEnv = {
  ...sharedEnv,
  VITE_FLEET_INVENTORY_PHASE2: '1',
  VITE_FLEET_INVENTORY_PHASE3_KITS: '1',
  VITE_FLEET_INVENTORY_PHASE4_ASSETS: '1',
  VITE_FLEET_INVENTORY_PHASE6_PURCHASING: '1',
  VITE_FLEET_INVENTORY_PHASE7_COUNTS: '1',
};

function runBuild(label, filter, env) {
  console.log(`build-inventory-e2e-previews: ${label}…`);
  const r = spawnSync('pnpm', ['--filter', filter, 'build'], {
    cwd: root,
    env,
    stdio: 'inherit',
    shell: true,
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

runBuild('fleet', '@roam/fleet', fleetEnv);
runBuild('driver', '@roam/driver', { ...sharedEnv, VITE_INVENTORY_E2E: '1' });
console.log('build-inventory-e2e-previews: ok');
