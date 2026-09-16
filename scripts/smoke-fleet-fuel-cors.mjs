/**
 * Phase I — CORS parity proof for fleet-fuel (preflight + expose-headers).
 *
 * Deploy gate (always): OPTIONS preflight Allow-Headers / Allow-Methods / Allow-Origin.
 * Optional (when credentials set): authenticated GET asserts Access-Control-Expose-Headers
 * includes X-Total-Count. Without credentials that half is SKIP — not FAIL — so
 * `deploy:fleet-fuel` can gate every deploy without smoke secrets.
 *
 * Auth for the GET expose check (one of):
 *   FLEET_USER_JWT=eyJ...
 *   FLEET_SMOKE_EMAIL + FLEET_SMOKE_PASSWORD
 *
 * Usage:
 *   node scripts/smoke-fleet-fuel-cors.mjs
 */
import { getApiKeys, signIn, SUPABASE_URL } from "./smoke/_shared.mjs";

const base = `${SUPABASE_URL}/functions/v1`;
const fuelEntriesUrl = `${base}/fleet-fuel/fuel-entries`;
const ORIGIN = "http://localhost:5173";

function exitSoon(code) {
  process.exitCode = code;
  setTimeout(() => process.exit(code), 150);
}

function headerIncludes(value, needle) {
  return String(value || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .includes(needle.toLowerCase());
}

function pass(label, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

function tryResolveUserJwtSync() {
  const fromEnv = (process.env.FLEET_USER_JWT || "").trim();
  if (fromEnv) return { kind: "jwt", jwt: fromEnv };
  const email = (process.env.FLEET_SMOKE_EMAIL || "").trim();
  const password = (process.env.FLEET_SMOKE_PASSWORD || "").trim();
  if (email && password) return { kind: "password", email, password };
  return null;
}

async function resolveUserJwt(anonKey, creds) {
  if (creds.kind === "jwt") return creds.jwt;
  return signIn(anonKey, creds.email, creds.password);
}

const { anonKey } = getApiKeys();
let failed = false;

const preflight = await fetch(fuelEntriesUrl, {
  method: "OPTIONS",
  headers: {
    Origin: ORIGIN,
    "Access-Control-Request-Method": "GET",
    "Access-Control-Request-Headers":
      "authorization,apikey,x-roam-product-line",
  },
});

const allowHeaders = preflight.headers.get("access-control-allow-headers");
const allowMethods = preflight.headers.get("access-control-allow-methods");
const allowOrigin = preflight.headers.get("access-control-allow-origin");

failed =
  !pass(
    "OPTIONS status",
    preflight.status === 204 || preflight.status === 200,
    `got ${preflight.status}`,
  ) || failed;

failed =
  !pass(
    "Allow-Headers has X-Roam-Product-Line",
    headerIncludes(allowHeaders, "X-Roam-Product-Line"),
    allowHeaders || "(missing)",
  ) || failed;

failed =
  !pass(
    "Allow-Methods has PUT",
    headerIncludes(allowMethods, "PUT"),
    allowMethods || "(missing)",
  ) || failed;

failed =
  !pass(
    "Allow-Origin echoes or *",
    Boolean(allowOrigin),
    allowOrigin || "(missing)",
  ) || failed;

const creds = tryResolveUserJwtSync();
if (!creds) {
  console.log(
    "SKIP GET expose-headers (no FLEET_USER_JWT / FLEET_SMOKE_*)",
  );
  if (failed) {
    console.error("\nCORS smoke FAILED (preflight)");
    exitSoon(1);
  } else {
    console.log("\nCORS smoke PASSED (preflight only)");
    exitSoon(0);
  }
} else {
  const userJwt = await resolveUserJwt(anonKey, creds);

  const getRes = await fetch(fuelEntriesUrl, {
    method: "GET",
    headers: {
      Origin: ORIGIN,
      apikey: anonKey,
      Authorization: `Bearer ${userJwt}`,
      "X-Roam-Product-Line": "fleet",
    },
  });

  const expose = getRes.headers.get("access-control-expose-headers");
  failed =
    !pass(
      "GET Access-Control-Expose-Headers has X-Total-Count",
      headerIncludes(expose, "X-Total-Count"),
      expose || "(missing)",
    ) || failed;

  failed =
    !pass(
      "GET fuel-entries not blocked (status)",
      getRes.status !== 404 && getRes.status !== 502 && getRes.status !== 503,
      `status ${getRes.status}`,
    ) || failed;

  if (failed) {
    console.error("\nCORS smoke FAILED");
    exitSoon(1);
  } else {
    console.log("\nCORS smoke PASSED");
    exitSoon(0);
  }
}
