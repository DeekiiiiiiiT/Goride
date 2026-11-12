import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getLocalSupabaseKeys, signInPlatformAal2 } from './mmP01Auth';
import { MD_DISC_OWNER_EMAIL } from './maintenanceDiscountDoneTestDb';

export const MD_DISC_PASSWORD = 'MdDiscDone2026!';

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

export function maintenanceDiscountE2eSupabaseProjectRef(): string {
  const fromEnv = process.env.MAINTENANCE_DISC_E2E_SUPABASE_PROJECT_REF?.trim();
  if (fromEnv) return fromEnv;
  return readConfigProjectRef();
}

async function buildStoredSession() {
  const { base, anonKey } = await getLocalSupabaseKeys();
  const signed = await signInPlatformAal2(base, anonKey, MD_DISC_OWNER_EMAIL, MD_DISC_PASSWORD);
  return {
    stored: {
      access_token: signed.access_token,
      refresh_token: signed.refresh_token,
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: signed.user,
    },
    projectRef: maintenanceDiscountE2eSupabaseProjectRef(),
  };
}

const liveSupabaseHits: string[] = [];

export function resetMaintenanceNoLiveGuard() {
  liveSupabaseHits.length = 0;
}

export function getMaintenanceNoLiveHits(): readonly string[] {
  return liveSupabaseHits;
}

export function attachMaintenanceNoLiveGuard(page: import('@playwright/test').Page) {
  resetMaintenanceNoLiveGuard();
  void page.route('**/*supabase.co/**', (route) => {
    liveSupabaseHits.push(`${route.request().method()} ${route.request().url()}`);
    void route.abort('blockedbyclient');
  });
}

export async function seedMaintenanceDiscountFleetSession(page: import('@playwright/test').Page) {
  const { stored, projectRef } = await buildStoredSession();

  await page.addInitScript(({ s, ref }) => {
    const json = JSON.stringify(s);
    localStorage.setItem(`sb-${ref}-auth-token`, json);
    localStorage.setItem('sb-127-auth-token', json);
    localStorage.setItem('sb-localhost-auth-token', json);
  }, { s: stored, ref: projectRef });
}
