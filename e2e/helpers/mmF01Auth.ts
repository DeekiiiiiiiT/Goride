/**
 * F01 fleet maintenance master e2e — local sign-in + proxy fleet-ops to local stack.
 */
import {
  getLocalSupabaseKeys,
  signInPlatformAal2,
} from "./mmP01Auth";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const MM_F01_EMAIL = process.env.E2E_FLEET_EMAIL?.trim() || "mm-f01-fleet@local.test";
export const MM_F01_VIEWER_EMAIL = "mm-f01-viewer@local.test";
export const MM_F01_PASSWORD = process.env.E2E_FLEET_PASSWORD?.trim() || "MmF01Local2026!";
export const MM_F01_ORG = "cccccccc-cccc-4ccc-8ccc-0000000000f1";
export const MM_F01_VEHICLE_5179 = "mm_f01_5179kz";
export const MM_F01_VEHICLE_1505 = "mm_f01_1505lm";
export const MM_F01_PLATE_5179 = "5179KZ";
export const MM_F01_PLATE_1505 = "1505LM";
const PROJECT_REF = "csfllzzastacofsvcdsc";

async function unrouteMmF01PlaywrightProxies(page: import("@playwright/test").Page) {
  const patterns = [
    "**/auth/v1/**",
    "**/__sb/functions/v1/**",
    "**/127.0.0.1:3000/functions/v1/**",
    "**/127.0.0.1:5173/functions/v1/**",
    `**/${PROJECT_REF}.supabase.co/functions/v1/**`,
  ];
  for (const pattern of patterns) {
    await page.unroute(pattern).catch(() => {});
  }
}

export async function buildMmF01StoredSession() {
  const { base, anonKey } = await getLocalSupabaseKeys();
  const signed = await signInPlatformAal2(base, anonKey, MM_F01_EMAIL, MM_F01_PASSWORD);
  const stored = {
    access_token: signed.access_token,
    refresh_token: signed.refresh_token,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: signed.user,
  };
  return { stored, base, anonKey };
}

export function applyMmF01HttpSeed() {
  const sql = readFileSync(join(process.cwd(), "e2e", "fixtures", "mm_f01_http_seed.sql"), "utf8");
  execSync(`docker exec -i supabase_db_Goride psql -U postgres -d postgres -v ON_ERROR_STOP=1`, {
    input: sql,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

export function applyVehicleDocumentsOverlaySeed() {
  const sql = readFileSync(join(process.cwd(), "e2e", "fixtures", "vehicle_documents_overlay_seed.sql"), "utf8");
  execSync(`docker exec -i supabase_db_Goride psql -U postgres -d postgres -v ON_ERROR_STOP=1`, {
    input: sql,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

/** Restore mm-f01 vehicles after document overlay e2e. */
export function resetVehicleDocumentsOverlaySeed() {
  applyMmF01HttpSeed();
}

export function resetMmF01Vehicle1505OdometerFixture() {
  const sql = [
    `DELETE FROM fleet.odometer_readings WHERE organization_id = '${MM_F01_ORG}' AND vehicle_id = '${MM_F01_VEHICLE_1505}';`,
    `DELETE FROM public.kv_store_37f42386 WHERE key LIKE 'odometer_reading:${MM_F01_VEHICLE_1505}%';`,
    `SELECT public.recompute_component_schedules_for_car('${MM_F01_ORG}', '${MM_F01_VEHICLE_1505}');`,
    `UPDATE public.vehicle_component_schedule vcs SET schedule_status = 'odometer_needed', next_due_km = NULL, next_due_date = current_date + 365 WHERE vcs.organization_id = '${MM_F01_ORG}' AND vcs.vehicle_id = '${MM_F01_VEHICLE_1505}' AND vcs.next_due_km IS NOT NULL;`,
  ].join(" ");
  execSync(
    `docker exec supabase_db_Goride psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "${sql}"`,
    { stdio: "pipe" },
  );
}

/** Restore 5179KZ severe duty before F7 (repeatable hard-use toggle). */
export function resetMmF01Vehicle5179SevereDutyFixture() {
  const sql = `UPDATE fleet.vehicles SET severe_duty = true WHERE organization_id = '${MM_F01_ORG}' AND id = '${MM_F01_VEHICLE_5179}';`;
  execSync(
    `docker exec supabase_db_Goride psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "${sql}"`,
    { stdio: "pipe" },
  );
}

/** F7: brake fluid rule with distinct severe interval + recomputed dues at severe on. */
export function resetMmF01Vehicle5179F7Fixture() {
  const sql = `
UPDATE public.maintenance_task_templates mtt
SET interval_km = 15000, interval_months = 12,
    severe_interval_km = 7500, severe_interval_months = 6
FROM public.vehicle_component_schedule vcs
JOIN public.maintenance_service_categories c ON c.id = vcs.category_id
WHERE mtt.id = vcs.rule_id
  AND vcs.organization_id = '${MM_F01_ORG}'
  AND vcs.vehicle_id = '${MM_F01_VEHICLE_5179}'
  AND c.code = 'brake_fluid';

UPDATE fleet.vehicles SET severe_duty = true
WHERE organization_id = '${MM_F01_ORG}' AND id = '${MM_F01_VEHICLE_5179}';

UPDATE public.vehicle_component_schedule vcs
SET baseline_odometer = 121952, baseline_date = date '2026-11-02',
    baseline_source = 'bootstrap', schedule_status = 'active',
    custom_interval_km = NULL, custom_interval_months = NULL, custom_reason = NULL
FROM public.maintenance_service_categories c
WHERE c.id = vcs.category_id AND c.code = 'brake_fluid'
  AND vcs.organization_id = '${MM_F01_ORG}'
  AND vcs.vehicle_id = '${MM_F01_VEHICLE_5179}'
  AND vcs.position IS NULL;

SELECT public.recompute_component_schedules_for_car('${MM_F01_ORG}', '${MM_F01_VEHICLE_5179}');
`;
  execSync(`docker exec -i supabase_db_Goride psql -U postgres -d postgres -v ON_ERROR_STOP=1`, {
    input: sql,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

export function resetMmF01Vehicle5179BrakeBaselineFixture() {
  const sql = [
    `UPDATE fleet.vehicles SET severe_duty = false WHERE organization_id = '${MM_F01_ORG}' AND id = '${MM_F01_VEHICLE_5179}';`,
    `UPDATE public.maintenance_task_templates mtt SET interval_km = 40000, interval_months = 24 FROM public.vehicle_component_schedule vcs JOIN public.maintenance_service_categories c ON c.id = vcs.category_id WHERE mtt.id = vcs.rule_id AND upper(coalesce(c.op_code, '')) = 'BRK-FLUID' AND vcs.organization_id = '${MM_F01_ORG}' AND vcs.vehicle_id = '${MM_F01_VEHICLE_5179}' AND vcs.position IS NULL;`,
    `UPDATE public.vehicle_component_schedule vcs SET baseline_odometer = 121952, baseline_date = date '2026-11-02', next_due_km = 161952, custom_interval_km = NULL, custom_interval_months = NULL, custom_reason = NULL, schedule_status = 'active' FROM public.maintenance_service_categories c WHERE upper(coalesce(c.op_code, '')) = 'BRK-FLUID' AND vcs.category_id = c.id AND vcs.organization_id = '${MM_F01_ORG}' AND vcs.vehicle_id = '${MM_F01_VEHICLE_5179}' AND vcs.position IS NULL;`,
  ].join(" ");
  execSync(
    `docker exec supabase_db_Goride psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "${sql}"`,
    { stdio: "pipe" },
  );
}

/** Restore F8 needs-checking + retired coolant lines on 5179KZ. */
export function resetMmF01Vehicle5179F8Fixture() {
  const sql = [
    `UPDATE public.vehicle_component_schedule vcs SET schedule_status = 'retired' FROM public.maintenance_service_categories c WHERE c.id = vcs.category_id AND upper(coalesce(c.op_code, '')) = 'FLD-COOL' AND vcs.organization_id = '${MM_F01_ORG}' AND vcs.vehicle_id = '${MM_F01_VEHICLE_5179}';`,
    `UPDATE public.maintenance_task_templates mtt SET status = 'needs_checking' FROM public.vehicle_component_schedule vcs WHERE vcs.rule_id = mtt.id AND vcs.organization_id = '${MM_F01_ORG}' AND vcs.vehicle_id = '${MM_F01_VEHICLE_5179}' AND upper((SELECT op_code FROM public.maintenance_service_categories WHERE id = vcs.category_id)) IN ('ENG-OIL', 'OIL');`,
  ].join(" ");
  execSync(
    `docker exec supabase_db_Goride psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "${sql}"`,
    { stdio: "pipe" },
  );
}

export async function seedMmF01Session(page: import("@playwright/test").Page) {
  await unrouteMmF01PlaywrightProxies(page);
  const { stored, base, anonKey } = await buildMmF01StoredSession();

  await page.route("**/auth/v1/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/user")) {
      await route.fulfill({ json: stored.user });
      return;
    }
    await route.fulfill({ json: stored });
  });

  const proxyLocalFunctions = async (route: import("@playwright/test").Route) => {
    const req = route.request();
    const reqUrl = new URL(req.url());
    const path = reqUrl.pathname.replace(/^\/__sb\/functions\/v1/, "/functions/v1");
    const localUrl = `${base.replace(/\/$/, "")}${path}${reqUrl.search}`;
    const authHeader = req.headers().authorization ?? `Bearer ${stored.access_token as string}`;
    const headers: Record<string, string> = {
      apikey: anonKey,
      Authorization: authHeader,
    };
    const ct = req.headers()["content-type"];
    if (ct) headers["Content-Type"] = ct;
    const init: RequestInit = { method: req.method(), headers };
    const body = req.postData();
    if (body && req.method() !== "GET" && req.method() !== "HEAD") init.body = body;
    const res = await fetch(localUrl, init);
    const resHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      if (k.toLowerCase() === "content-encoding") return;
      resHeaders[k] = v;
    });
    await route.fulfill({
      status: res.status,
      headers: resHeaders,
      body: Buffer.from(await res.arrayBuffer()),
    });
  };

  await page.route("**/__sb/functions/v1/**", proxyLocalFunctions);
  await page.route("**/127.0.0.1:3000/functions/v1/**", proxyLocalFunctions);
  await page.route("**/127.0.0.1:5173/functions/v1/**", proxyLocalFunctions);
  await page.route(`**/${PROJECT_REF}.supabase.co/functions/v1/**`, proxyLocalFunctions);

  await page.addInitScript(({ s, ref }) => {
    const json = JSON.stringify(s);
    localStorage.setItem(`sb-${ref}-auth-token`, json);
    localStorage.setItem("sb-example-auth-token", json);
    /** Test copy (VITE_SUPABASE_URL=http://127.0.0.1:54321) stores the session as sb-127-auth-token. */
    localStorage.setItem("sb-127-auth-token", json);
  }, { s: stored, ref: PROJECT_REF });

  return { stored, base, anonKey };
}

export async function seedMmF01ViewerSession(page: import("@playwright/test").Page) {
  await unrouteMmF01PlaywrightProxies(page);
  const { base, anonKey } = await getLocalSupabaseKeys();
  const signed = await signInPlatformAal2(base, anonKey, MM_F01_VIEWER_EMAIL, MM_F01_PASSWORD);
  const signedUser = (signed.user as Record<string, unknown>) || {};
  const appMeta = (signedUser.app_metadata as Record<string, unknown>) || {};
  const user = {
    ...signedUser,
    user_metadata: {
      ...((signedUser.user_metadata as Record<string, unknown>) || {}),
      productLine: "fleet",
    },
    app_metadata: {
      ...appMeta,
      provider: "email",
      providers: ["email"],
      role: "fleet_viewer",
      roles: ["fleet_viewer"],
      organizationId: MM_F01_ORG,
      productLine: "fleet",
    },
  };
  const stored = {
    access_token: signed.access_token,
    refresh_token: signed.refresh_token,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user,
  };

  await page.route("**/auth/v1/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/user")) {
      await route.fulfill({ json: stored.user });
      return;
    }
    await route.fulfill({ json: stored });
  });

  const proxyLocalFunctions = async (route: import("@playwright/test").Route) => {
    const req = route.request();
    const reqUrl = new URL(req.url());
    const path = reqUrl.pathname.replace(/^\/__sb\/functions\/v1/, "/functions/v1");
    const localUrl = `${base.replace(/\/$/, "")}${path}${reqUrl.search}`;
    const authHeader = req.headers().authorization ?? `Bearer ${stored.access_token as string}`;
    const headers: Record<string, string> = {
      apikey: anonKey,
      Authorization: authHeader,
    };
    const ct = req.headers()["content-type"];
    if (ct) headers["Content-Type"] = ct;
    const init: RequestInit = { method: req.method(), headers };
    const body = req.postData();
    if (body && req.method() !== "GET" && req.method() !== "HEAD") init.body = body;
    const res = await fetch(localUrl, init);
    const resHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      if (k.toLowerCase() === "content-encoding") return;
      resHeaders[k] = v;
    });
    await route.fulfill({
      status: res.status,
      headers: resHeaders,
      body: Buffer.from(await res.arrayBuffer()),
    });
  };

  await page.route("**/__sb/functions/v1/**", proxyLocalFunctions);
  await page.route("**/127.0.0.1:3000/functions/v1/**", proxyLocalFunctions);
  await page.route("**/127.0.0.1:5173/functions/v1/**", proxyLocalFunctions);
  await page.route(`**/${PROJECT_REF}.supabase.co/functions/v1/**`, proxyLocalFunctions);

  await page.addInitScript(({ s, ref }) => {
    const json = JSON.stringify(s);
    localStorage.setItem(`sb-${ref}-auth-token`, json);
    localStorage.setItem("sb-example-auth-token", json);
    /** Test copy (VITE_SUPABASE_URL=http://127.0.0.1:54321) stores the session as sb-127-auth-token. */
    localStorage.setItem("sb-127-auth-token", json);
  }, { s: stored, ref: PROJECT_REF });

  await page.evaluate(({ s, ref }) => {
    const json = JSON.stringify(s);
    localStorage.setItem(`sb-${ref}-auth-token`, json);
    localStorage.setItem("sb-example-auth-token", json);
    /** Test copy (VITE_SUPABASE_URL=http://127.0.0.1:54321) stores the session as sb-127-auth-token. */
    localStorage.setItem("sb-127-auth-token", json);
  }, { s: stored, ref: PROJECT_REF });

  return { stored, base, anonKey };
}
