import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';
import { supabase } from './supabase/client';

const BASE = API_ENDPOINTS.delivery;
const BUCKET = 'driver-photos';

type StartedUpload = { uploadUrl: string; headers: Record<string, string>; ticket: string };

/**
 * One photo, one address. When the server says the private R2 path is on, the photo is uploaded
 * there and the returned value is a signed address (any screen — the driver's own app, a
 * passenger, Fleet — can render it). Otherwise the old public bucket upload runs unchanged.
 */
async function startServerUpload(contentType: string, size: number): Promise<StartedUpload | null> {
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
      body: JSON.stringify({ purpose: 'driver-photos', contentType, size }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      enabled?: boolean;
      uploadUrl?: string;
      headers?: Record<string, string>;
      ticket?: string;
    };
    if (!body.enabled || !body.uploadUrl || !body.ticket) return null;
    return { uploadUrl: body.uploadUrl, headers: body.headers ?? {}, ticket: body.ticket };
  } catch {
    return null;
  }
}

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

/** Old path: one fixed object per driver, overwritten on each change, public address. */
async function uploadOldWay(userId: string, file: File): Promise<string | null> {
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${userId}/avatar.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
  if (error) return null;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl ?? null;
}

/**
 * Stores the driver's photo and returns the address to save (or null when the upload failed, which
 * is what the callers already handled). The previous photo is kept in both paths.
 */
export async function uploadHaulerPhoto(userId: string, file: File): Promise<string | null> {
  const started = await startServerUpload(file.type || 'image/jpeg', file.size);
  if (started) return uploadThroughServer(file, started);
  return uploadOldWay(userId, file);
}
