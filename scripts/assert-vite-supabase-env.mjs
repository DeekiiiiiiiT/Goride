/**
 * Fail mobile/store Vite builds if Supabase public env is missing.
 * Blank Play WebViews happen when VITE_SUPABASE_* never got baked into the bundle
 * (Vercel has them; local `vite build` often does not).
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const cwd = process.cwd();

function parseEnvFile(fileName) {
  const path = resolve(cwd, fileName);
  if (!existsSync(path)) return {};
  const out = {};
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

// Vite order; process.env wins (same as Vite).
const fileEnv = {
  ...parseEnvFile('.env'),
  ...parseEnvFile('.env.local'),
  ...parseEnvFile('.env.production'),
  ...parseEnvFile('.env.production.local'),
};

function get(key) {
  return (process.env[key] ?? fileEnv[key] ?? '').trim();
}

const url = get('VITE_SUPABASE_URL');
const projectId = get('VITE_SUPABASE_PROJECT_ID');
const anonKey = get('VITE_SUPABASE_ANON_KEY');

if ((!url && !projectId) || !anonKey) {
  console.error('');
  console.error('Mobile build blocked: missing Supabase env for Vite.');
  console.error('Add to .env.production (gitignored) in this app folder:');
  console.error('  VITE_SUPABASE_URL=https://YOUR_REF.supabase.co');
  console.error('  VITE_SUPABASE_ANON_KEY=your-anon-key');
  console.error(`App directory: ${cwd}`);
  console.error('');
  process.exit(1);
}

console.log('Supabase Vite env OK for mobile build.');
