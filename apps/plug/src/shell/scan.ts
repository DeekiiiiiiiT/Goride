import { getSupabaseFunctionsBaseUrl, supabaseAnonFunctionHeaders } from '@roam/api-client';
import { supabasePlugApp } from '../../../../packages/auth-client/src/supabase';
import { demoOn } from '../demo/mode';

/** Reads a dashboard photo. Demo mode does not invent a number. */
export async function scanPlugPhoto(file: File, signal: AbortSignal): Promise<{ reading: number | null; confidence?: string }> {
  if (demoOn()) return { reading: null };
  const { data } = await supabasePlugApp.auth.getSession();
  const token = data.session?.access_token;
  const form = new FormData();
  form.append('file', file);
  const headers: Record<string, string> = { ...supabaseAnonFunctionHeaders() };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${getSupabaseFunctionsBaseUrl()}/explorer/odometer-scan`, {
    method: 'POST',
    headers,
    body: form,
    signal,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Could not read the odometer');
  const reading = body.reading == null ? null : Number(body.reading);
  return { reading: Number.isFinite(reading) ? reading : null, confidence: body.confidence };
}
