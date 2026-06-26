export const DEVICE_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generatePairingCode(): string {
  let suffix = "";
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < 4; i++) {
    suffix += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  }
  return `ROAM-${suffix}`;
}

function deviceSecret(): string {
  return Deno.env.get("STATION_DEVICE_SECRET") ||
    Deno.env.get("STATION_SHIFT_SECRET") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    "station-device-dev-secret";
}

async function hmacSign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(deviceSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashDeviceToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function issueDeviceToken(
  deviceId: string,
  merchantId: string,
): Promise<{ token: string; expiresAt: string }> {
  const expiresAt = new Date(Date.now() + DEVICE_TOKEN_TTL_MS);
  const payload = `${deviceId}.${merchantId}.${expiresAt.getTime()}`;
  const signature = await hmacSign(payload);
  const token = btoa(`${payload}.${signature}`);
  return { token, expiresAt: expiresAt.toISOString() };
}

export type ValidatedDeviceToken = {
  deviceId: string;
  merchantId: string;
  expiresAt: string;
};

export async function validateDeviceToken(token: string): Promise<ValidatedDeviceToken | null> {
  try {
    const decoded = atob(token);
    const lastDot = decoded.lastIndexOf(".");
    if (lastDot <= 0) return null;
    const payload = decoded.slice(0, lastDot);
    const signature = decoded.slice(lastDot + 1);
    const expected = await hmacSign(payload);
    if (signature !== expected) return null;

    const parts = payload.split(".");
    if (parts.length !== 3) return null;
    const [deviceId, merchantId, expiresMs] = parts;
    const expiresAt = new Date(Number(expiresMs));
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) return null;

    return { deviceId, merchantId, expiresAt: expiresAt.toISOString() };
  } catch {
    return null;
  }
}

export function normalizePairingCode(code: string): string {
  return code.trim().toUpperCase();
}

export const ALL_JOB_STATIONS = [
  "counter",
  "kitchen",
  "manager",
  "pos",
  "bar",
  "expo",
  "drive_thru",
] as const;

export type JobStation = typeof ALL_JOB_STATIONS[number];

export function isValidStation(value: string): value is JobStation {
  return (ALL_JOB_STATIONS as readonly string[]).includes(value);
}

const enrollAttempts = new Map<string, { count: number; resetAt: number }>();

export function enrollRateLimitOk(clientKey: string, maxPerMinute = 5): boolean {
  const now = Date.now();
  const entry = enrollAttempts.get(clientKey);
  if (!entry || entry.resetAt <= now) {
    enrollAttempts.set(clientKey, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= maxPerMinute) return false;
  entry.count += 1;
  return true;
}

export function buildStationDeepLinks(
  origin: string,
  pairingCode: string,
): Record<JobStation, string> {
  const code = encodeURIComponent(pairingCode);
  const base = `${origin.replace(/\/$/, "")}/tablet?code=${code}`;
  const links = {} as Record<JobStation, string>;
  for (const station of ALL_JOB_STATIONS) {
    links[station] = `${base}&station=${station}`;
  }
  return links;
}

export function filterStationLinksByEnabled(
  links: Record<JobStation, string>,
  enabledStations: string[],
): Partial<Record<JobStation, string>> {
  const enabled = new Set(enabledStations);
  const filtered = {} as Partial<Record<JobStation, string>>;
  for (const station of ALL_JOB_STATIONS) {
    if (enabled.has(station)) filtered[station] = links[station];
  }
  return filtered;
}
