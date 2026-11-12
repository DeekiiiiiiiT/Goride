/**
 * WRA-27/28: the week open in Week Reconciliation. While a week page is open, every
 * toll / fuel / settlement CHANGE carries `x-recon-week: <run id>@<version>`, so the
 * server refuses it if the week moved on (another tab, another person) or closed.
 *
 *  - After each saved change the server adds 1 to the week version; so do we, so your
 *    own clicks in a row never conflict.
 *  - A newer version from the page's own reload replaces ours (never an older one).
 *  - A refusal (WEEK_CHANGED / WEEK_CLOSED) raises `recon-week-changed`; the week page
 *    shows "This week changed — Reload week".
 * Outside Week Reconciliation nothing is added, so the old pages work as before.
 */
import { API_ENDPOINTS } from './apiConfig';

type WeekContext = { runId: string; version: number; closed: boolean };

let current: WeekContext | null = null;

export const RECON_WEEK_CHANGED_EVENT = 'recon-week-changed';

const CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
/**
 * POSTs that are not a person's decision; they must not count as a change to the week.
 *  - impact-preview only reads.
 *  - auto-match runs by itself every time the Tolls step opens. Sending the week with it
 *    made opening Tolls in one tab move the version, so the other tab's next click got
 *    "This week changed" (done-test 9t). What it matches still reaches the week: the
 *    toll trigger queues the calculator, and the calculator's publish moves the version.
 */
const READ_ONLY_POSTS = [/\/toll-info\/impact-preview(\?|$)/, /\/toll-reconciliation\/auto-match(\?|$)/];

export function setReconWeekContext(next: WeekContext) {
  // Our own saved changes can be ahead of a reload that started before them.
  if (current && current.runId === next.runId && current.version > next.version) {
    current = { ...current, closed: next.closed };
    return;
  }
  current = { ...next };
}

export function clearReconWeekContext(runId?: string) {
  if (!runId || current?.runId === runId) current = null;
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

/** The header value to add to this request, or null. */
export function reconWeekHeaderFor(url: string, method: string | undefined): string | null {
  if (!current || current.closed) return null;
  if (!CHANGING.has(String(method || 'GET').toUpperCase())) return null;
  if (!laneUrl(url) || READ_ONLY_POSTS.some((re) => re.test(url))) return null;
  return `${current.runId}@${current.version}`;
}

/** Adds the header to fetch options (plain object or Headers). Returns the value used. */
export function withReconWeekHeader(url: string, options: RequestInit): { options: RequestInit; sent: string | null } {
  const sent = reconWeekHeaderFor(url, options.method);
  if (!sent) return { options, sent: null };
  const headers = new Headers(options.headers || {});
  headers.set('x-recon-week', sent);
  return { options: { ...options, headers }, sent };
}

/** After the response: count our own saved change, or announce a refusal. */
export async function noteReconWeekResponse(sent: string | null, response: Response): Promise<void> {
  if (!sent || !current || !sent.startsWith(`${current.runId}@`)) return;
  if (response.ok) {
    const sentVersion = Number(sent.split('@')[1]);
    if (current.version === sentVersion) current = { ...current, version: sentVersion + 1 };
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
