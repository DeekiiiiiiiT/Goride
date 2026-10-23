/**
 * Google sign-in for the week calculator.
 * The admin page and the one-minute wake both use the same service account.
 * An access token changes the Cloud Run service. An identity token calls it.
 */

const PROJECT = "goride-recon";
const REGION = "us-east1";
const SERVICE = "recon-worker";
const SECRET = "GCP_RECON_WORKER_SA_JSON";

export const RECON_WORKER_API = `https://run.googleapis.com/v2/projects/${PROJECT}/locations/${REGION}/services/${SERVICE}`;

export type ReconServiceAccount = { client_email: string; private_key: string };

type CachedToken = { token: string; exp: number; audience: string };

let cachedAccess: CachedToken | null = null;
let cachedId: CachedToken | null = null;

export function readServiceAccount(): ReconServiceAccount | null {
  const raw = Deno.env.get(SECRET);
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as { client_email?: string; private_key?: string };
    if (!parsed.client_email || !parsed.private_key) return null;
    return { client_email: parsed.client_email, private_key: parsed.private_key };
  } catch {
    return null;
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const raw = atob(b64);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  return buf.buffer;
}

async function signedJwt(sa: ReconServiceAccount, claim: Record<string, unknown>): Promise<string> {
  const header = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const body = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(claim)));
  const unsigned = `${header}.${body}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  ));
  return `${unsigned}.${bytesToBase64Url(sig)}`;
}

async function exchange(assertion: string): Promise<{ access_token?: string; id_token?: string; expires_in?: number }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) {
    console.error("[recon-worker-google] token exchange failed", res.status);
    throw new Error("Google could not be reached. Try again.");
  }
  return await res.json() as { access_token?: string; id_token?: string; expires_in?: number };
}

export async function googleAccessToken(sa: ReconServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccess && cachedAccess.exp - 60 > now) return cachedAccess.token;
  const assertion = await signedJwt(sa, {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  });
  const body = await exchange(assertion);
  if (!body.access_token) throw new Error("Google could not be reached. Try again.");
  cachedAccess = { token: body.access_token, exp: now + Number(body.expires_in || 3600), audience: "cloud-platform" };
  return body.access_token;
}

/** Identity token whose audience is the calculator's public address. Cloud Run checks this. */
export async function googleIdToken(sa: ReconServiceAccount, audience: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedId && cachedId.audience === audience && cachedId.exp - 60 > now) return cachedId.token;
  const assertion = await signedJwt(sa, {
    iss: sa.client_email,
    sub: sa.client_email,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
    target_audience: audience,
  });
  const body = await exchange(assertion);
  if (!body.id_token) throw new Error("Google could not be reached. Try again.");
  cachedId = { token: body.id_token, exp: now + Number(body.expires_in || 3600), audience };
  return body.id_token;
}

export async function reconWorkerUri(sa: ReconServiceAccount): Promise<string> {
  const configured = (Deno.env.get("RECON_WORKER_URL") || "").trim().replace(/\/$/, "");
  if (configured) return configured;
  const token = await googleAccessToken(sa);
  const res = await fetch(RECON_WORKER_API, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    console.error("[recon-worker-google] service read failed", res.status);
    throw new Error("Google could not be reached. Try again.");
  }
  const body = await res.json() as { uri?: string };
  const uri = (body.uri || "").trim().replace(/\/$/, "");
  if (!uri) throw new Error("Google could not be reached. Try again.");
  return uri;
}
