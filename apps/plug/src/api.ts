import { getSupabaseFunctionsBaseUrl, supabaseAnonFunctionHeaders } from '@roam/api-client';
import { supabasePlugApp } from '../../../packages/auth-client/src/supabase';

const catalog = `${getSupabaseFunctionsBaseUrl()}/platform-catalog`;
const explorer = `${getSupabaseFunctionsBaseUrl()}/explorer`;

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabasePlugApp.auth.getSession();
  const token = data.session?.access_token;
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

export async function publicGet<T>(path: string): Promise<T> {
  const response = await fetch(`${catalog}${path}`, { headers: supabaseAnonFunctionHeaders() });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Could not load that');
  return body as T;
}

let releaseJoin = () => {};
let joinGate: Promise<void> = Promise.resolve();

/** Hold Garage and the other signed-in calls until Plug membership is written. */
export function holdPlugCalls() {
  joinGate = new Promise<void>((resolve) => {
    releaseJoin = resolve;
  });
}

export function releasePlugCalls() {
  releaseJoin();
  releaseJoin = () => {};
}

export async function plugSend<T>(path: string, method: string, payload?: unknown, waitForJoin = true): Promise<T> {
  if (waitForJoin) await joinGate;
  const response = await fetch(`${explorer}${path}`, {
    method,
    headers: supabaseAnonFunctionHeaders(await authHeaders()),
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Could not save that');
  return body as T;
}

export function googleDirections(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

export function wazeDirections(lat: number, lng: number): string {
  return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
}
