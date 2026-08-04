/**
 * Browser-safe constant-time hex compare helpers used by Uber webhook docs / tests.
 * Server HMAC lives in supabase/functions/_fleet-server/uber_fleet_auth.ts (Web Crypto).
 */
export async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

export async function verifyUberSignature(
  clientSecret: string,
  rawBody: string,
  headerSignature: string | null | undefined,
): Promise<boolean> {
  if (!headerSignature || !clientSecret) return false;
  const expected = await hmacSha256Hex(clientSecret, rawBody);
  return timingSafeEqualHex(expected, String(headerSignature).trim());
}
