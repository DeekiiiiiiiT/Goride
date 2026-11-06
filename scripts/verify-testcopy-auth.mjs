#!/usr/bin/env node
/**
 * Prove test-copy logins against local Supabase (password + TOTP for Dominion owner).
 * Usage: node scripts/verify-testcopy-auth.mjs
 */
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const TOTP_SECRET = 'JBSWY3DPEHPK3PXP';
const MFA_FACTOR_BY_EMAIL = {
  'mm-p01-owner@local.test': '101000f2-0000-4000-8000-000000000003',
  'mm-p01-analyst@local.test': '101000f2-0000-4000-8000-000000000002',
};

const ACCOUNTS = [
  { email: 'mm-p01-owner@local.test', password: 'MmP01Local2026!', role: 'platform_owner', mfa: true },
  { email: 'mm-p01-analyst@local.test', password: 'MmP01Local2026!', role: 'platform_analyst', mfa: true },
  { email: 'mm-f01-fleet@local.test', password: 'MmF01Local2026!', role: 'fleet_owner', mfa: false },
  { email: 'mm-f01-viewer@local.test', password: 'MmF01Local2026!', role: 'fleet_viewer', mfa: false },
  { email: 'testcopy-driver@local.test', password: 'TestCopyDriver2026!', role: 'driver', mfa: false },
  { email: 'testcopy-customer@local.test', password: 'TestCopyPlug2026!', role: 'explorer_user', mfa: false },
];

const APP_PORTS = [
  { name: 'dominion', url: 'http://127.0.0.1:5180' },
  { name: 'fleet', url: 'http://127.0.0.1:5181' },
  { name: 'driver', url: 'http://127.0.0.1:5182' },
  { name: 'plug', url: 'http://127.0.0.1:5183' },
];

function base32Decode(input) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleaned = input.replace(/=+$/g, '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const ch of cleaned) {
    const val = alphabet.indexOf(ch);
    if (val < 0) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function totpCode(secret, counter = Math.floor(Date.now() / 1000 / 30)) {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, '0');
}

function jwtPayload(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
}

function parseStatusJson(raw) {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Could not parse supabase status JSON');
  return JSON.parse(raw.slice(start, end + 1));
}

function localKeys() {
  const out = execSync('npx supabase status -o json', {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, CI: '1', NO_COLOR: '1' },
    shell: process.platform === 'win32',
  });
  const st = parseStatusJson(out);
  return { base: (st.API_URL || 'http://127.0.0.1:54321').replace(/\/$/, ''), anonKey: st.ANON_KEY };
}

async function signInPassword(base, anonKey, email, password) {
  const res = await fetch(`${base}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(body));
  return body;
}

async function signInWithMfa(base, anonKey, email, password) {
  const login = await signInPassword(base, anonKey, email, password);
  const factorId = MFA_FACTOR_BY_EMAIL[email];
  if (!factorId) return login.access_token;
  const payload = jwtPayload(login.access_token);
  if (payload.aal === 'aal2') return login.access_token;

  const chRes = await fetch(`${base}/auth/v1/factors/${factorId}/challenge`, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${login.access_token}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  const challenge = await chRes.json();
  if (!chRes.ok) throw new Error(JSON.stringify(challenge));

  const verifyRes = await fetch(`${base}/auth/v1/factors/${factorId}/verify`, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${login.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ challenge_id: challenge.id, code: totpCode(TOTP_SECRET) }),
  });
  const verified = await verifyRes.json();
  if (!verifyRes.ok) throw new Error(JSON.stringify(verified));
  return verified.access_token ?? login.access_token;
}

async function checkAppsPointLocal() {
  const { readFileSync, existsSync } = await import('node:fs');
  const loadEnv = (_mode, dir) => {
    const file = join(dir, '.env.testcopy');
    if (!existsSync(file)) return {};
    const out = {};
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*(VITE_[A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
    return out;
  };
  const results = [];
  const appDirs = {
    dominion: 'admin',
    fleet: 'fleet',
    driver: 'driver',
    plug: 'plug',
  };
  for (const app of APP_PORTS) {
    const dir = join(ROOT, 'apps', appDirs[app.name]);
    const fleetEnv = app.name === 'driver' || app.name === 'plug'
      ? loadEnv('testcopy', join(ROOT, 'apps', 'fleet'), 'VITE_')
      : {};
    const appEnv = loadEnv('testcopy', dir, 'VITE_');
    const url = (appEnv.VITE_SUPABASE_URL || fleetEnv.VITE_SUPABASE_URL || '').trim();
    const configOk = url === 'http://127.0.0.1:54321';
    let httpOk = false;
    try {
      const res = await fetch(app.url);
      httpOk = res.ok;
    } catch {
      httpOk = false;
    }
    results.push({
      app: app.name,
      ok: configOk && httpOk,
      detail: `env=${url || '(missing)'} http=${httpOk ? 'ok' : 'down'}`,
    });
  }
  return results;
}

async function main() {
  const { base, anonKey } = localKeys();
  const authResults = [];

  for (const acct of ACCOUNTS) {
    try {
      const token = acct.mfa
        ? await signInWithMfa(base, anonKey, acct.email, acct.password)
        : (await signInPassword(base, anonKey, acct.email, acct.password)).access_token;
      const meta = jwtPayload(token).app_metadata || {};
      const role = meta.role || meta.roles?.[0];
      const ok = role === acct.role;
      authResults.push({
        email: acct.email,
        ok,
        role: role || '(none)',
        expected: acct.role,
      });
    } catch (err) {
      authResults.push({ email: acct.email, ok: false, error: String(err) });
    }
  }

  const appResults = await checkAppsPointLocal();

  console.log(JSON.stringify({ authResults, appResults }, null, 2));

  const failed = authResults.some((r) => !r.ok) || appResults.some((r) => !r.ok);
  process.exit(failed ? 1 : 0);
}

main();
