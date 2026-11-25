import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';
import { supabase } from '@/lib/supabase';
import { normalizeStoragePath } from '@/lib/normalizeStoragePath';

const BUCKET = 'courier-documents';
const BASE = API_ENDPOINTS.delivery;

type CourierFolder = 'proofs' | 'issues' | 'docs' | 'vehicles' | 'avatars';

async function getUserId(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

/**
 * Identity documents ('docs') go through the scanned purpose; profile/vehicle photos go through
 * the public one, because those addresses are saved once and shown indefinitely (the media
 * address never expires); delivery proofs and issue photos go through the private unscanned one,
 * so a proof never waits on a virus check.
 */
function purposeForFolder(folder: CourierFolder): 'courier-docs' | 'courier-profile' | 'courier-photos' {
  if (folder === 'docs') return 'courier-docs';
  if (folder === 'avatars' || folder === 'vehicles') return 'courier-profile';
  return 'courier-photos';
}

type StartedUpload = {
  enabled: true;
  uploadUrl: string;
  headers: Record<string, string>;
  ticket: string;
};

/**
 * Ask our server for a one-time R2 upload link. Returns null when that purpose's switch is off,
 * the route is not deployed yet or the network failed — the caller then keeps the old direct
 * Supabase upload.
 */
async function startServerUpload(
  purpose: string,
  contentType: string,
  size: number,
): Promise<StartedUpload | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  try {
    const res = await fetch(`${BASE}/app-uploads/start`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: publicAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ purpose, contentType, size }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      enabled?: boolean;
      uploadUrl?: string;
      headers?: Record<string, string>;
      ticket?: string;
    };
    if (!body.enabled || !body.uploadUrl || !body.ticket) return null;
    return { enabled: true, uploadUrl: body.uploadUrl, headers: body.headers ?? {}, ticket: body.ticket };
  } catch {
    return null;
  }
}

/** Upload to R2 and return the address to save. Null means the upload failed. */
async function uploadThroughServer(file: File, started: StartedUpload): Promise<string | null> {
  try {
    const put = await fetch(started.uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': started.headers['content-type'] ?? file.type ?? 'image/jpeg' },
      body: file,
    });
    if (!put.ok) return null;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return null;
    const res = await fetch(`${BASE}/app-uploads/finish`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: publicAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ticket: started.ticket }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { address?: string; key?: string };
    return body.address || body.key || null;
  } catch {
    return null;
  }
}

export async function uploadAndGetProofUrl(
  file: File,
  folder: CourierFolder = 'proofs',
): Promise<string | null> {
  const userId = await getUserId();
  if (!userId) return null;

  // Server upload when that purpose is switched on; otherwise the old upload below.
  const started = await startServerUpload(purposeForFolder(folder), file.type || 'image/jpeg', file.size);
  if (started) return uploadThroughServer(file, started);

  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${userId}/${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || 'image/jpeg',
  });
  if (error) return null;
  return path;
}

export async function resolveCourierFileUrl(pathOrUrl: string): Promise<string | null> {
  const path = normalizeStoragePath(pathOrUrl);
  if (path.startsWith('http')) return path;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
