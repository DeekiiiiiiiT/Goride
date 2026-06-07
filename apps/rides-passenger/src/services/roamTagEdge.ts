import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';
import { supabase } from '@roam/auth-client';
import type {
  RoamPassengerTagDto,
  RoamPassengerTagLookupDto,
  UpdateRoamPassengerTagBody,
} from '@roam/types/roamPassengerTag';

async function tagHeaders(): Promise<HeadersInit> {
  const { data: { user } } = await supabase.auth.getUser();
  let token = user ? (await supabase.auth.getSession()).data.session?.access_token : null;
  if (!token) {
    const refreshed = await supabase.auth.refreshSession();
    token = refreshed.data.session?.access_token ?? null;
  }
  return {
    Authorization: `Bearer ${token ?? publicAnonKey}`,
    apikey: publicAnonKey,
    'Content-Type': 'application/json',
  };
}

const base = API_ENDPOINTS.rides;

async function parseError(res: Response): Promise<never> {
  const text = await res.text();
  let message = text || `HTTP ${res.status}`;
  try {
    const body = JSON.parse(text) as { message?: string; error?: string };
    message = body.message ?? body.error ?? message;
  } catch {
    /* use raw */
  }
  throw new Error(message);
}

export function roamTagErrorMessage(code: string): string {
  switch (code) {
    case 'tag_length':
      return 'Use 3–24 characters for your Roam Tag.';
    case 'tag_format':
      return 'Use letters, numbers, and underscores only.';
    case 'tag_reserved':
      return 'That tag name is not available.';
    case 'tag_taken':
      return 'That Roam Tag is already taken.';
    case 'tag_collides_with_internal':
      return 'That name is not available. Try another.';
    default:
      return code;
  }
}

export async function ensureRoamPassengerTag(): Promise<{ tag: RoamPassengerTagDto }> {
  const res = await fetch(`${base}/v1/roam-tag/ensure`, {
    method: 'POST',
    headers: await tagHeaders(),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function getMyRoamPassengerTag(): Promise<{ tag: RoamPassengerTagDto }> {
  const res = await fetch(`${base}/v1/roam-tag/me`, { headers: await tagHeaders() });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function updateMyRoamPassengerTag(
  body: UpdateRoamPassengerTagBody,
): Promise<{ tag: RoamPassengerTagDto }> {
  const res = await fetch(`${base}/v1/roam-tag/me`, {
    method: 'PATCH',
    headers: await tagHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

export async function lookupRoamPassengerTag(
  name: string,
): Promise<{ tag: RoamPassengerTagLookupDto }> {
  const normalized = name.trim().toLowerCase().replace(/^@+/, '');
  const res = await fetch(`${base}/v1/roam-tag/lookup/${encodeURIComponent(normalized)}`, {
    headers: { apikey: publicAnonKey },
  });
  if (!res.ok) await parseError(res);
  return res.json();
}

/** Client-side normalization (matches server rules). */
export function normalizeRoamTagInput(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@+/, '').replace(/[^a-z0-9_]/g, '');
}

export function formatRoamTagDisplay(customTagName: string | null | undefined): string | null {
  if (!customTagName?.trim()) return null;
  return `@${customTagName.trim().toLowerCase()}`;
}
