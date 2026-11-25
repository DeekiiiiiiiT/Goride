/**
 * Start/finish routes for the scanned purposes — the production guard:
 * shared R2 switch on + no MALWARE_SCAN_API_KEY → every start says "not enabled", so the apps keep
 * their old direct Supabase upload. (docs/cloudflare-r2-storage-migration-audit.md §0, slice 7)
 * deno test --no-config --no-lock --no-check --allow-env --allow-read <this file>
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import { Hono } from "npm:hono@4.3.11";
import { registerScannedDocumentRoutes } from "./scannedDocumentRoutes.ts";

const SWITCH_VARS = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "FILE_LINK_SECRET",
  "SUPABASE_URL",
  "MALWARE_SCAN_API_KEY",
  "MALWARE_SCAN_FAIL_OPEN",
];

/** Run `fn` with a clean copy of the switch secrets, restoring the environment afterwards. */
async function withEnv(vars: Record<string, string>, fn: () => Promise<void>): Promise<void> {
  const before = new Map<string, string | undefined>(SWITCH_VARS.map((n) => [n, Deno.env.get(n)]));
  try {
    for (const name of SWITCH_VARS) Deno.env.delete(name);
    for (const [name, value] of Object.entries(vars)) Deno.env.set(name, value);
    await fn();
  } finally {
    for (const [name, value] of before) {
      if (value === undefined) Deno.env.delete(name);
      else Deno.env.set(name, value);
    }
  }
}

/** The five secrets the shared R2 switch already has in production. */
const SHARED_ON: Record<string, string> = {
  R2_ACCOUNT_ID: "acct",
  R2_ACCESS_KEY_ID: "key",
  R2_SECRET_ACCESS_KEY: "secret",
  FILE_LINK_SECRET: "link-secret",
  SUPABASE_URL: "https://x.supabase.co",
};

function makeApp(userId: string | null = "user-1") {
  const app = new Hono();
  registerScannedDocumentRoutes(app as never, {
    getSupabase: () =>
      ({
        auth: {
          getUser: async () => ({ data: { user: userId ? { id: userId } : null } }),
        },
      }) as never,
  });
  return app;
}

async function start(app: Hono, body: Record<string, unknown>, token = "tok") {
  return await app.request("/scanned-documents/start", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}

Deno.test("scanned routes: shared switch on + no scan key → start says not enabled (old path)", async () => {
  await withEnv(SHARED_ON, async () => {
    const app = makeApp();
    const res = await start(app, { purpose: "courier-docs", contentType: "image/jpeg", size: 100 });
    assertEquals(res.status, 200);
    assertEquals(await res.json(), { enabled: false });

    const driver = await start(app, { purpose: "driver-docs", contentType: "application/pdf", size: 100 });
    assertEquals(await driver.json(), { enabled: false });
  });
});

Deno.test("scanned routes: fail-open flag without a scan key still keeps the old path", async () => {
  await withEnv({ ...SHARED_ON, MALWARE_SCAN_FAIL_OPEN: "1" }, async () => {
    const res = await start(makeApp(), { purpose: "courier-docs", contentType: "image/jpeg", size: 100 });
    assertEquals(await res.json(), { enabled: false });
  });
});

Deno.test("scanned routes: with the scan key, start hands out a private R2 upload link", async () => {
  await withEnv({ ...SHARED_ON, MALWARE_SCAN_API_KEY: "scan-key" }, async () => {
    const res = await start(makeApp(), { purpose: "courier-docs", contentType: "image/jpeg", size: 100 });
    assertEquals(res.status, 200);
    const body = await res.json() as {
      enabled: boolean;
      uploadUrl: string;
      ticket: string;
      headers: Record<string, string>;
    };
    assertEquals(body.enabled, true);
    assert(body.uploadUrl.includes("/roam-private/pending/"), body.uploadUrl);
    assert(body.uploadUrl.includes("X-Amz-Signature"), body.uploadUrl);
    assertEquals(body.headers["content-type"], "image/jpeg");
    assert(body.ticket.includes("."), body.ticket);
  });
});

Deno.test("scanned routes: merchant KYC is not offered as an app upload", async () => {
  await withEnv({ ...SHARED_ON, MALWARE_SCAN_API_KEY: "scan-key" }, async () => {
    const res = await start(makeApp(), { purpose: "merchant-kyc", contentType: "application/pdf", size: 100 });
    assertEquals(res.status, 400);
  });
});

Deno.test("scanned routes: finish is refused while the scan key is missing", async () => {
  await withEnv(SHARED_ON, async () => {
    const res = await makeApp().request("/scanned-documents/finish", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer tok" },
      body: JSON.stringify({ ticket: "x.y" }),
    });
    assertEquals(res.status, 409);
    assertEquals((await res.json() as { code?: string }).code, "scanned_uploads_off");
  });
});

Deno.test("scanned routes: no session → 401 on both steps", async () => {
  await withEnv({ ...SHARED_ON, MALWARE_SCAN_API_KEY: "scan-key" }, async () => {
    const app = makeApp(null);
    const started = await start(app, { purpose: "courier-docs", contentType: "image/jpeg", size: 100 });
    assertEquals(started.status, 401);
    const finished = await app.request("/scanned-documents/finish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket: "x.y" }),
    });
    assertEquals(finished.status, 401);
  });
});
