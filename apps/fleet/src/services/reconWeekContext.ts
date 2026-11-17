/**
 * WRA-27/28: the week open in Week Reconciliation. While a week page is open, every
 * toll / fuel / settlement CHANGE carries `x-recon-week: <run id>@<version>`, so the
 * server refuses it if the week moved on (another tab, another person) or closed.
 *
 *  - After a saved change we move the version only when the server returns X-Recon-Week-Version.
 *  - A run reload takes the server's version unless our own save (confirmed by that header) is newer.
 *  - A refusal (WEEK_CHANGED / WEEK_CLOSED) raises `recon-week-changed`; the week page
 *    shows "This week changed — Reload week".
 * Outside Week Reconciliation nothing is added, so the old pages work as before.
 */
import { isReconWeekReadLikePath } from '@roam/finance-core';
import { API_ENDPOINTS } from './apiConfig';

type WeekContext = { runId: string; version: number; closed: boolean };

let current: WeekContext | null = null;
/** Latest version the server confirmed via X-Recon-Week-Version on our own change. */
let lastServerConfirmedVersion: number | null = null;

export const RECON_WEEK_CHANGED_EVENT = 'recon-week-changed';

const CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function setReconWeekContext(next: WeekContext) {
  if (current?.runId !== next.runId) lastServerConfirmedVersion = null;
  if (current && current.runId === next.runId && current.version > next.version) {
    if (
      lastServerConfirmedVersion !== null &&
      current.version === lastServerConfirmedVersion &&
      lastServerConfirmedVersion > next.version
    ) {
      current = { ...current, closed: next.closed };
      return;
    }
  }
  current = { ...next };
}

export function clearReconWeekContext(runId?: string) {
  if (!runId || current?.runId === runId) {
    current = null;
    lastServerConfirmedVersion = null;
  }
}

export function getReconWeekContext(): Readonly<WeekContext> | null {
  return current;
}

function laneUrl(url: string): boolean {
  // Claims too: Charge Driver on a toll creates its charge through fleet-claims.
  return [API_ENDPOINTS.toll, API_ENDPOINTS.fuel, API_ENDPOINTS.fleetPay, API_ENDPOINTS.claims].some(
    (base) => base && url.startsWith(base),
  );
}

/** WRA-69: Week Reconciliation desk routes (step complete, seal, attest…) — expectedVersion in body. */
export function isReconDeskChangePath(url: string): boolean {
  const base = API_ENDPOINTS.fleetCore;
  return Boolean(base && url.startsWith(`${base}/recon/`));
}

/** The header value to add to this request, or null. */
export function reconWeekHeaderFor(url: string, method: string | undefined): string | null {
  if (!current || current.closed) return null;
  if (!CHANGING.has(String(method || 'GET').toUpperCase())) return null;
  if (!laneUrl(url) || isReconWeekReadLikePath(url)) return null;
  return `${current.runId}@${current.version}`;
}

/**
 * WRA-54: a change was saved while a week page is open (an upload, a decision, a seal, Collect…).
 * The week calculator publishes the new numbers about 2 minutes later, so the week page listens
 * for this and keeps asking until they arrive — the user never has to reload.
 */
export const RECON_WEEK_SAVED_EVENT = 'recon-week-saved';

export function announceReconWeekSave(url: string, method: string | undefined, ok: boolean): void {
  if (!ok || !current || current.closed) return;
  if (!CHANGING.has(String(method || 'GET').toUpperCase())) return;
  if (isReconWeekReadLikePath(url)) return;
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(RECON_WEEK_SAVED_EVENT));
}

/** Adds the header to fetch options (plain object or Headers). Returns the value used. */
export function withReconWeekHeader(url: string, options: RequestInit): { options: RequestInit; sent: string | null } {
  const sent = reconWeekHeaderFor(url, options.method);
  if (!sent) return { options, sent: null };
  const headers = new Headers(options.headers || {});
  headers.set('x-recon-week', sent);
  return { options: { ...options, headers }, sent };
}

function isTrackedWeekChange(sent: string | null, url: string | undefined, method: string | undefined): boolean {
  if (!current) return false;
  if (sent && sent.startsWith(`${current.runId}@`)) return true;
  const m = String(method || 'GET').toUpperCase();
  if (!CHANGING.has(m)) return false;
  if (!url || !isReconDeskChangePath(url) || isReconWeekReadLikePath(url)) return false;
  return true;
}

/** After the response: apply server version on our save, or announce a refusal. */
export async function noteReconWeekResponse(
  sent: string | null,
  response: Response,
  url?: string,
  method?: string,
): Promise<void> {
  if (!isTrackedWeekChange(sent, url, method)) return;
  if (response.ok) {
    const told = Number(response.headers.get('X-Recon-Week-Version'));
    if (Number.isFinite(told) && told > current!.version) {
      current = { ...current!, version: told };
      lastServerConfirmedVersion = told;
    }
    return;
  }
  if (response.status !== 409) return;
  let code = '';
  try {
    code = String(((await response.clone().json()) as { error?: unknown })?.error ?? '');
  } catch {
    /* not JSON */
  }
  if (code === 'WEEK_CHANGED' || code === 'WEEK_CLOSED') {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(RECON_WEEK_CHANGED_EVENT, { detail: { code } }));
    }
  }
}