import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_ENDPOINTS } from './apiConfig';
import {
  RECON_WEEK_CHANGED_EVENT,
  clearReconWeekContext,
  getReconWeekContext,
  noteReconWeekResponse,
  reconWeekHeaderFor,
  setReconWeekContext,
  withReconWeekHeader,
} from './reconWeekContext';

const RUN = '11111111-2222-4333-8444-555555555555';

afterEach(() => clearReconWeekContext());

describe('WRA-27 week version on toll / fuel / settlement changes', () => {
  it('nothing is added outside Week Reconciliation', () => {
    expect(reconWeekHeaderFor(`${API_ENDPOINTS.toll}/toll-ledger/x`, 'POST')).toBeNull();
  });

  it('changes to toll, fuel and settlement carry run@version; reads and other servers do not', () => {
    setReconWeekContext({ runId: RUN, version: 7, closed: false });
    expect(reconWeekHeaderFor(`${API_ENDPOINTS.toll}/toll-ledger/x`, 'POST')).toBe(`${RUN}@7`);
    expect(reconWeekHeaderFor(`${API_ENDPOINTS.fuel}/fuel/periods/p/finalize`, 'post')).toBe(`${RUN}@7`);
    expect(reconWeekHeaderFor(`${API_ENDPOINTS.fleetPay}/settlements/commands`, 'PUT')).toBe(`${RUN}@7`);
    // Charge Driver on a toll creates its claim on fleet-claims (done-tests 9t, 13).
    expect(reconWeekHeaderFor(`${API_ENDPOINTS.claims}/claims`, 'POST')).toBe(`${RUN}@7`);
    expect(reconWeekHeaderFor(`${API_ENDPOINTS.toll}/toll-ledger`, 'GET')).toBeNull();
    expect(reconWeekHeaderFor(`${API_ENDPOINTS.toll}/toll-info/impact-preview`, 'POST')).toBeNull();
    // Opening Tolls runs auto-match by itself: it must not make another tab out of date (9t).
    expect(reconWeekHeaderFor(`${API_ENDPOINTS.toll}/toll-reconciliation/auto-match`, 'POST')).toBeNull();
    expect(reconWeekHeaderFor(`${API_ENDPOINTS.fleetCore}/recon/runs/x`, 'POST')).toBeNull();
  });

  it('a closed week adds nothing (the server refuses changes by itself)', () => {
    setReconWeekContext({ runId: RUN, version: 7, closed: true });
    expect(reconWeekHeaderFor(`${API_ENDPOINTS.toll}/toll-ledger/x`, 'POST')).toBeNull();
  });

  it('done-test 13: your own saved changes count up, so clicks in a row never conflict', async () => {
    setReconWeekContext({ runId: RUN, version: 7, closed: false });
    const first = withReconWeekHeader(`${API_ENDPOINTS.toll}/a`, { method: 'POST', headers: { Authorization: 'x' } });
    expect(new Headers(first.options.headers).get('x-recon-week')).toBe(`${RUN}@7`);
    expect(new Headers(first.options.headers).get('Authorization')).toBe('x');
    await noteReconWeekResponse(first.sent, new Response('{}', { status: 200 }));
    expect(getReconWeekContext()?.version).toBe(8);
    // A reload that started before the change does not move us back.
    setReconWeekContext({ runId: RUN, version: 7, closed: false });
    expect(getReconWeekContext()?.version).toBe(8);
    // A newer version from the server is taken.
    setReconWeekContext({ runId: RUN, version: 10, closed: false });
    expect(getReconWeekContext()?.version).toBe(10);
  });

  it('done-test 9: a refusal raises "This week changed"', async () => {
    setReconWeekContext({ runId: RUN, version: 7, closed: false });
    const seen: string[] = [];
    const on = (e: Event) => seen.push(String((e as CustomEvent<{ code: string }>).detail.code));
    const target = new EventTarget();
    vi.stubGlobal('window', target);
    target.addEventListener(RECON_WEEK_CHANGED_EVENT, on);
    await noteReconWeekResponse(`${RUN}@7`, new Response(JSON.stringify({ error: 'WEEK_CHANGED' }), { status: 409 }));
    await noteReconWeekResponse(`${RUN}@7`, new Response(JSON.stringify({ error: 'SOMETHING_ELSE' }), { status: 409 }));
    vi.unstubAllGlobals();
    expect(seen).toEqual(['WEEK_CHANGED']);
    expect(getReconWeekContext()?.version).toBe(7);
  });
});
