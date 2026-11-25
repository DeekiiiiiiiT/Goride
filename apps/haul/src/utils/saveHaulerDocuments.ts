import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase/client';
import type { DocumentSlotKey } from '../lib/haulDocumentsDraft';
import { clearDocumentsDraft } from '../lib/haulDocumentsDraft';

export type DocumentUploads = Partial<Record<DocumentSlotKey, File>>;

const BASE = API_ENDPOINTS.delivery;

type StartedUpload = { uploadUrl: string; headers: Record<string, string>; ticket: string };

/**
 * Driver documents are scanned before they are kept, so they upload through our server when that
 * switch is on. Null means "not switched on / route not reachable" — the old direct upload below
 * then runs exactly as before.
 */
async function startScannedUpload(contentType: string, size: number): Promise<StartedUpload | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  try {
    const res = await fetch(`${BASE}/scanned-documents/start`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: publicAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ purpose: 'driver-docs', contentType, size }),
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

async function uploadScanned(file: File, started: StartedUpload): Promise<boolean> {
  try {
    const put = await fetch(started.uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': started.headers['content-type'] ?? file.type ?? 'application/pdf' },
      body: file,
    });
    if (!put.ok) return false;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return false;
    const res = await fetch(`${BASE}/scanned-documents/finish`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: publicAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ticket: started.ticket }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function uploadDocument(userId: string, slot: DocumentSlotKey, file: File): Promise<void> {
  // Scanned R2 path when switched on. If it starts and then fails (e.g. the scan rejects the
  // file) we do not fall back: the old file is left where it was and the failure is reported.
  const started = await startScannedUpload(file.type || 'application/pdf', file.size);
  if (started) {
    const done = await uploadScanned(file, started);
    if (!done) console.warn(`document upload ${slot}: scanned upload failed`);
    return;
  }

  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${userId}/${slot}.${ext}`;
  const { error } = await supabase.storage.from('driver-documents').upload(path, file, {
    upsert: true,
    contentType: file.type || undefined,
  });
  if (error) {
    console.warn(`document upload ${slot}:`, error.message);
  }
}

export async function saveHaulerDocuments(
  user: User,
  uploads: DocumentUploads,
  consent: boolean,
): Promise<void> {
  const entries = Object.entries(uploads) as [DocumentSlotKey, File][];
  await Promise.all(entries.map(([slot, file]) => uploadDocument(user.id, slot, file)));

  const { error } = await supabase
    .from('driver_profiles')
    .update({
      background_check_status: consent ? 'pending' : null,
      onboarding_step: 'permissions',
    })
    .eq('user_id', user.id);

  if (error) throw new Error(error.message);
  clearDocumentsDraft();
}

export async function completeHaulerOnboarding(userId: string): Promise<void> {
  const { error } = await supabase
    .from('driver_profiles')
    .update({
      onboarding_complete: true,
      onboarding_step: null,
    })
    .eq('user_id', userId);

  if (error) throw new Error(error.message);
}
