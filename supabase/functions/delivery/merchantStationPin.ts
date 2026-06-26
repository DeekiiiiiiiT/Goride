export const PIN_MIN_LENGTH = 4;
export const PIN_MAX_LENGTH = 6;
export const PIN_MAX_ATTEMPTS = 5;
export const PIN_LOCKOUT_MINUTES = 15;
export const SHIFT_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

const PBKDF2_ITERATIONS = 120_000;

const TRIVIAL_PINS = new Set([
  "0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999",
  "1234", "4321", "0123", "1212", "6969",
  "000000", "111111", "222222", "333333", "444444", "555555", "666666",
  "123456", "654321",
]);

export function validatePinFormat(pin: string): string | null {
  const normalized = pin.trim();
  if (!/^\d+$/.test(normalized)) return "PIN must be numbers only";
  if (normalized.length < PIN_MIN_LENGTH || normalized.length > PIN_MAX_LENGTH) {
    return `PIN must be ${PIN_MIN_LENGTH}–${PIN_MAX_LENGTH} digits`;
  }
  if (TRIVIAL_PINS.has(normalized)) return "Choose a less obvious PIN";
  return null;
}

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function derivePinBytes(
  pin: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    key,
    256,
  );
  return new Uint8Array(bits);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await derivePinBytes(pin, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(derived)}`;
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  if (!hash) return false;

  const parts = hash.split("$");
  if (parts[0] !== "pbkdf2" || parts.length !== 4) return false;

  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations < 1) return false;

  const salt = base64ToBytes(parts[2]);
  const expected = base64ToBytes(parts[3]);
  const derived = await derivePinBytes(pin, salt, iterations);
  return constantTimeEqual(derived, expected);
}

function shiftSecret(): string {
  return Deno.env.get("STATION_SHIFT_SECRET") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    "station-shift-dev-secret";
}

async function hmacSign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(shiftSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashShiftToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function issueShiftToken(
  memberId: string,
  merchantId: string,
): Promise<{ token: string; expiresAt: string }> {
  const expiresAt = new Date(Date.now() + SHIFT_TOKEN_TTL_MS);
  const payload = `${memberId}.${merchantId}.${expiresAt.getTime()}`;
  const signature = await hmacSign(payload);
  const token = btoa(`${payload}.${signature}`);
  return { token, expiresAt: expiresAt.toISOString() };
}

export type ValidatedShiftToken = {
  teamMemberId: string;
  merchantId: string;
  expiresAt: string;
};

export async function validateShiftToken(token: string): Promise<ValidatedShiftToken | null> {
  try {
    const decoded = atob(token);
    const lastDot = decoded.lastIndexOf(".");
    if (lastDot <= 0) return null;
    const payload = decoded.slice(0, lastDot);
    const signature = decoded.slice(lastDot + 1);
    const expected = await hmacSign(payload);
    if (signature !== expected) return null;

    const [teamMemberId, merchantId, expiresMs] = payload.split(".");
    if (!teamMemberId || !merchantId || !expiresMs) return null;
    const expiresAt = new Date(Number(expiresMs));
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) return null;

    return {
      teamMemberId,
      merchantId,
      expiresAt: expiresAt.toISOString(),
    };
  } catch {
    return null;
  }
}

export function pinRateLimitLocked(until: string | null | undefined): boolean {
  if (!until) return false;
  return new Date(until).getTime() > Date.now();
}

export function nextPinLockoutUntil(): string {
  return new Date(Date.now() + PIN_LOCKOUT_MINUTES * 60 * 1000).toISOString();
}
