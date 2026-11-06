/**
 * P-01 local auth for maintenance master done-test (local JWT or password + TOTP → aal2).
 */
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const MM_P01_PASSWORD = "MmP01Local2026!";
export const MM_P01_TOTP_SECRET = "JBSWY3DPEHPK3PXP";
export const MM_P01_OWNER_EMAIL = "mm-p01-owner@local.test";
export const MM_P01_ANALYST_EMAIL = "mm-p01-analyst@local.test";
export const MM_P01_OWNER_ID = "10100003-0000-4000-8000-000000000003";
export const MM_P01_ANALYST_ID = "10100002-0000-4000-8000-000000000002";
export const MM_P01_PROJECT_REF = "csfllzzastacofsvcdsc";
export const MM_P01_FIXTURE_CATALOG_ID = "e2000005-0000-4000-8000-000000000010";

const MFA_FACTOR_BY_EMAIL: Record<string, string> = {
  [MM_P01_ANALYST_EMAIL]: "101000f2-0000-4000-8000-000000000002",
  "mm-p01-support@local.test": "101000f2-0000-4000-8000-000000000004",
  [MM_P01_OWNER_EMAIL]: "101000f2-0000-4000-8000-000000000003",
};

function jwtAal(accessToken: string): "aal1" | "aal2" {
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split(".")[1]!, "base64url").toString("utf8")) as {
      aal?: string;
    };
    return payload.aal === "aal2" ? "aal2" : "aal1";
  } catch {
    return "aal1";
  }
}

function base32Decode(input: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleaned = input.replace(/=+$/g, "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const ch of cleaned) {
    const val = alphabet.indexOf(ch);
    if (val < 0) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function totpCode(secret: string, counter = Math.floor(Date.now() / 1000 / 30)) {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, "0");
}

function b64urlJson(value: object) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function signLocalMaintenanceJwt(jwtSecret: string, authBase = "http://127.0.0.1:54321"): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    iss: `${authBase.replace(/\/$/, "")}/auth/v1`,
    sub: MM_P01_OWNER_ID,
    aud: "authenticated",
    exp: now + 3600,
    iat: now,
    email: MM_P01_OWNER_EMAIL,
    phone: "",
    app_metadata: {
      provider: "email",
      providers: ["email"],
      role: "platform_owner",
      roles: ["platform_owner"],
    },
    user_metadata: {},
    role: "authenticated",
    aal: "aal2",
    amr: [
      { method: "password", timestamp: now },
      { method: "totp", timestamp: now },
    ],
    session_id: crypto.randomUUID(),
    is_anonymous: false,
  };
  const unsigned = `${b64urlJson(header)}.${b64urlJson(payload)}`;
  const sig = crypto.createHmac("sha256", jwtSecret).update(unsigned).digest("base64url");
  return `${unsigned}.${sig}`;
}

let cachedLocalSupabaseKeys: {
  base: string;
  anonKey: string;
  jwtSecret?: string;
  serviceRoleKey?: string;
} | null = null;

export async function getLocalSupabaseKeys(): Promise<{
  base: string;
  anonKey: string;
  jwtSecret?: string;
  serviceRoleKey?: string;
}> {
  if (cachedLocalSupabaseKeys) return cachedLocalSupabaseKeys;
  const out = execSync("npx supabase status -o json", {
    encoding: "utf8",
    env: { ...process.env, CI: "1", NO_COLOR: "1" },
  });
  const start = out.indexOf("{");
  const end = out.lastIndexOf("}");
  const st = JSON.parse(out.slice(start, end + 1)) as {
    API_URL?: string;
    ANON_KEY?: string;
    JWT_SECRET?: string;
    SERVICE_ROLE_KEY?: string;
  };
  const base = st.API_URL || "http://127.0.0.1:54321";
  const anonKey = st.ANON_KEY;
  if (!anonKey) throw new Error("Missing ANON_KEY from supabase status");
  cachedLocalSupabaseKeys = {
    base,
    anonKey,
    jwtSecret: st.JWT_SECRET,
    serviceRoleKey: st.SERVICE_ROLE_KEY,
  };
  return cachedLocalSupabaseKeys;
}

export function applyMmP01HttpSeed() {
  const sql = readFileSync(join(process.cwd(), "e2e", "fixtures", "mm_p01_http_seed.sql"), "utf8");
  execSync(`docker exec -i supabase_db_Goride psql -U postgres -d postgres -v ON_ERROR_STOP=1`, {
    input: sql,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

export async function signInPlatformAal2(
  base: string,
  anonKey: string,
  email = MM_P01_OWNER_EMAIL,
  password = MM_P01_PASSWORD,
): Promise<{ access_token: string; refresh_token: string; user: Record<string, unknown> }> {
  const loginRes = await fetch(`${base}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const login = (await loginRes.json()) as { access_token?: string; refresh_token?: string; user?: Record<string, unknown> };
  if (!loginRes.ok) throw new Error(`Sign-in failed: ${JSON.stringify(login)}`);
  const accessToken = login.access_token!;
  if (jwtAal(accessToken) === "aal2") {
    return {
      access_token: accessToken,
      refresh_token: login.refresh_token ?? "refresh",
      user: (login.user as Record<string, unknown>) || {},
    };
  }

  const factorId = MFA_FACTOR_BY_EMAIL[email];
  if (!factorId) {
    return {
      access_token: accessToken,
      refresh_token: login.refresh_token ?? "refresh",
      user: (login.user as Record<string, unknown>) || {},
    };
  }

  const chRes = await fetch(`${base}/auth/v1/factors/${factorId}/challenge`, {
    method: "POST",
    headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: "{}",
  });
  const challenge = (await chRes.json()) as { id?: string };
  if (!chRes.ok) throw new Error(`MFA challenge failed: ${JSON.stringify(challenge)}`);

  const verifyRes = await fetch(`${base}/auth/v1/factors/${factorId}/verify`, {
    method: "POST",
    headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ challenge_id: challenge.id, code: totpCode(MM_P01_TOTP_SECRET) }),
  });
  const verified = (await verifyRes.json()) as { access_token?: string; refresh_token?: string; user?: Record<string, unknown> };
  if (!verifyRes.ok) throw new Error(`MFA verify failed: ${JSON.stringify(verified)}`);

  const token = verified.access_token ?? accessToken;
  if (jwtAal(token) !== "aal2") {
    throw new Error(`Expected aal2 for ${email}, got ${jwtAal(token)}`);
  }

  return {
    access_token: token,
    refresh_token: verified.refresh_token ?? login.refresh_token ?? "refresh",
    user: verified.user ?? login.user ?? {},
  };
}

function buildMmP01User(): Record<string, unknown> {
  return {
    id: MM_P01_OWNER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: MM_P01_OWNER_EMAIL,
    phone: "",
    app_metadata: {
      provider: "email",
      providers: ["email"],
      role: "platform_owner",
      roles: ["platform_owner"],
    },
    user_metadata: {},
  };
}

export async function buildMmP01StoredSession(): Promise<{
  stored: Record<string, unknown>;
  base: string;
  anonKey: string;
}> {
  const { base, anonKey, jwtSecret } = await getLocalSupabaseKeys();
  let access_token: string;
  let refresh_token = "local-refresh";
  let user: Record<string, unknown> = buildMmP01User();

  try {
    const signed = await signInPlatformAal2(base, anonKey);
    access_token = signed.access_token;
    refresh_token = signed.refresh_token;
    user = (signed.user as Record<string, unknown>) || user;
  } catch (signInErr) {
    if (!jwtSecret) throw signInErr;
    access_token = signLocalMaintenanceJwt(jwtSecret, base);
  }

  const stored = {
    access_token,
    refresh_token,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user,
  };
  return { stored, base, anonKey };
}

export async function seedMmP01Session(page: import("@playwright/test").Page) {
  const { stored, base, anonKey } = await buildMmP01StoredSession();
  const projectRef = MM_P01_PROJECT_REF;

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
  await page.route("**/127.0.0.1:5173/functions/v1/**", proxyLocalFunctions);
  await page.route("**/127.0.0.1:4173/functions/v1/**", proxyLocalFunctions);
  await page.route(`**/${projectRef}.supabase.co/functions/v1/**`, proxyLocalFunctions);

  await page.addInitScript(({ s, ref }) => {
    const json = JSON.stringify(s);
    localStorage.setItem(`sb-${ref}-auth-token`, json);
    localStorage.setItem("sb-example-auth-token", json);
  }, { s: stored, ref: projectRef });

  return { base, anonKey, stored };
}

export async function buildMmP01AnalystStoredSession(): Promise<{
  stored: Record<string, unknown>;
  base: string;
  anonKey: string;
}> {
  const { base, anonKey } = await getLocalSupabaseKeys();
  const signed = await signInPlatformAal2(base, anonKey, MM_P01_ANALYST_EMAIL, MM_P01_PASSWORD);
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

export async function seedMmP01AnalystSession(page: import("@playwright/test").Page) {
  const { stored, base, anonKey } = await buildMmP01AnalystStoredSession();
  const projectRef = MM_P01_PROJECT_REF;

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
  await page.route("**/127.0.0.1:5173/functions/v1/**", proxyLocalFunctions);
  await page.route("**/127.0.0.1:4173/functions/v1/**", proxyLocalFunctions);
  await page.route(`**/${projectRef}.supabase.co/functions/v1/**`, proxyLocalFunctions);

  await page.addInitScript(({ s, ref }) => {
    const json = JSON.stringify(s);
    localStorage.setItem(`sb-${ref}-auth-token`, json);
    localStorage.setItem("sb-example-auth-token", json);
  }, { s: stored, ref: projectRef });

  return { base, anonKey, stored };
}
