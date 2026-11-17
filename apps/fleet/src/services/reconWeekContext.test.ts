import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_ENDPOINTS } from './apiConfig';
import {
  RECON_WEEK_CHANGED_EVENT,
  RECON_WEEK_SAVED_EVENT,
  announceReconWeekSave,
  clearReconWeekContext,
  getReconWeekContext,
  isReconDeskChangePath,
  noteReconWeekResponse,
  reconWeekHeaderFor,
  setReconWeekContext,
  withReconWeekHeader,
} from './reconWeekContext';

const RUN = '11111111-2222-4333-8444-555555555555';
const PERIOD = `${API_ENDPOINTS.fuel}/fuel/periods/org%3A2026-10-05`;

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
    expect(reconWeekHeaderFor(`${API_ENDPOINTS.claims}/claims`, 'POST')).toBe(`${RUN}@7`);
    expect(reconWeekHeaderFor(`${API_ENDPOINTS.toll}/toll-ledger`, 'GET')).toBeNull();
    expect(reconWeekHeaderFor(`${API_ENDPOINTS.toll}/toll-info/impact-preview`, 'POST')).toBeNull();
    expect(reconWeekHeaderFor(`${API_ENDPOINTS.toll}/toll-reconciliation/auto-match`, 'POST')).toBeNull();
    expect(reconWeekHeaderFor(`${API_ENDPOINTS.fuel}/fuel/periods/ensure`, 'POST')).toBeNull();
    expect(reconWeekHeaderFor(`${PERIOD}/compute`, 'POST')).toBeNull();
    expect(reconWeekHeaderFor(`${PERIOD}/materialize`, 'POST')).toBeNull();
    expect(reconWeekHeaderFor(`${API_ENDPOINTS.fleetCore}/recon/runs/x`, 'POST')).toBeNull();
  });

  it('a closed week adds nothing (the server refuses changes by itself)', () => {
    setReconWeekContext({ runId: RUN, version: 7, closed: true });
    expect(reconWeekHeaderFor(`${API_ENDPOINTS.toll}/toll-ledger/x`, 'POST')).toBeNull();
  });

  it('done-test 13: your own saved changes use X-Recon-Week-Version, so clicks in a row never conflict', async () => {
    setReconWeekContext({ runId: RUN, version: 7, closed: false });
    const first = withReconWeekHeader(`${API_ENDPOINTS.toll}/a`, { method: 'POST', headers: { Authorization: 'x' } });
    expect(new Headers(first.options.headers).get('x-recon-week')).toBe(`${RUN}@7`);
    expect(new Headers(first.options.headers).get('Authorization')).toBe('x');
    await noteReconWeekResponse(
      first.sent,
      new Response('{}', { status: 200, headers: { 'X-Recon-Week-Version': '8' } }),
    );
    expect(getReconWeekContext()?.version).toBe(8);
    setReconWeekContext({ runId: RUN, version: 7, closed: false });
    expect(getReconWeekContext()?.version).toBe(8);
    setReconWeekContext({ runId: RUN, version: 10, closed: false });
    expect(getReconWeekContext()?.version).toBe(10);
  });

  it('ok response without X-Recon-Week-Version leaves version unchanged', async () => {
    setReconWeekContext({ runId: RUN, version: 7, closed: false });
    const sent = withReconWeekHeader(`${API_ENDPOINTS.toll}/a`, { method: 'POST' }).sent;
    await noteReconWeekResponse(sent, new Response('{}', { status: 200 }));
    expect(getReconWeekContext()?.version).toBe(7);
  });

  it('the server-told version wins when the calculator published in between (21 Sep, v31 → v33)', async () => {
    setReconWeekContext({ runId: RUN, version: 31, closed: false });
    const sent = withReconWeekHeader(`${API_ENDPOINTS.toll}/a`, { method: 'POST' }).sent;
    await noteReconWeekResponse(
      sent,
      new Response('{}', { status: 200, headers: { 'X-Recon-Week-Version': '33' } }),
    );
    expect(getReconWeekContext()?.version).toBe(33);
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

describe('WRA-65: fuel prep does not drift the week version', () => {
  const VEHICLE = `${PERIOD}/data-quality-vehicle-review`;
  const noHeader = () => new Response('{}', { status: 200 });

  it('ensure → materialize → compute → materialize then Vehicle reviewed is accepted', async () => {
    setReconWeekContext({ runId: RUN, version: 56, closed: false });
    for (const path of [
      `${API_ENDPOINTS.fuel}/fuel/periods/ensure`,
      `${PERIOD}/materialize`,
      `${PERIOD}/compute`,
      `${PERIOD}/materialize`,
    ]) {
      const { sent } = withReconWeekHeader(path, { method: 'POST' });
      expect(sent).toBeNull();
      await noteReconWeekResponse(sent, noHeader());
    }
    expect(getReconWeekContext()?.version).toBe(56);
    const review = withReconWeekHeader(VEHICLE, { method: 'POST' });
    expect(review.sent).toBe(`${RUN}@56`);
    await noteReconWeekResponse(
      review.sent,
      new Response('{}', { status: 200, headers: { 'X-Recon-Week-Version': '57' } }),
    );
    expect(getReconWeekContext()?.version).toBe(57);
  });

  it('run refetch fixes inflated local version; header-confirmed save survives stale refetch', async () => {
    setReconWeekContext({ runId: RUN, version: 60, closed: false });
    setReconWeekContext({ runId: RUN, version: 56, closed: false });
    expect(getReconWeekContext()?.version).toBe(56);

    setReconWeekContext({ runId: RUN, version: 7, closed: false });
    const first = withReconWeekHeader(`${API_ENDPOINTS.toll}/a`, { method: 'POST' });
    await noteReconWeekResponse(
      first.sent,
      new Response('{}', { status: 200, headers: { 'X-Recon-Week-Version': '8' } }),
    );
    setReconWeekContext({ runId: RUN, version: 7, closed: false });
    expect(getReconWeekContext()?.version).toBe(8);
  });

  it('two own changes in a row → accepted', async () => {
    setReconWeekContext({ runId: RUN, version: 7, closed: false });
    const a = withReconWeekHeader(`${API_ENDPOINTS.toll}/a`, { method: 'POST' });
    await noteReconWeekResponse(
      a.sent,
      new Response('{}', { status: 200, headers: { 'X-Recon-Week-Version': '8' } }),
    );
    const b = withReconWeekHeader(`${API_ENDPOINTS.toll}/b`, { method: 'POST' });
    await noteReconWeekResponse(
      b.sent,
      new Response('{}', { status: 200, headers: { 'X-Recon-Week-Version': '9' } }),
    );
    expect(getReconWeekContext()?.version).toBe(9);
  });

  it('another person change in between → still refused with WEEK_CHANGED', async () => {
    setReconWeekContext({ runId: RUN, version: 7, closed: false });
    const seen: string[] = [];
    vi.stubGlobal('window', {
      dispatchEvent: (e: Event) => seen.push((e as CustomEvent<{ code: string }>).detail?.code ?? e.type),
    });
    const a = withReconWeekHeader(`${API_ENDPOINTS.toll}/a`, { method: 'POST' });
    await noteReconWeekResponse(
      a.sent,
      new Response('{}', { status: 200, headers: { 'X-Recon-Week-Version': '8' } }),
    );
    const b = withReconWeekHeader(`${API_ENDPOINTS.toll}/b`, { method: 'POST' });
    await noteReconWeekResponse(
      b.sent,
      new Response(JSON.stringify({ error: 'WEEK_CHANGED' }), { status: 409 }),
    );
    vi.unstubAllGlobals();
    expect(getReconWeekContext()?.version).toBe(8);
    expect(seen).toEqual(['WEEK_CHANGED']);
  });
});

describe('WRA-69: recon desk saves apply X-Recon-Week-Version without lane header', () => {
  const STEP = `${API_ENDPOINTS.fleetCore}/recon/runs/rideshare/2026-11-02/steps/settlement_preview/complete`;
  const SEAL = `${API_ENDPOINTS.fleetCore}/recon/runs/rideshare/2026-11-02/seal-earnings`;

  it('recognizes desk change URLs under fleet-core/recon', () => {
    expect(isReconDeskChangePath(STEP)).toBe(true);
    expect(isReconDeskChangePath(SEAL)).toBe(true);
    expect(isReconDeskChangePath(`${API_ENDPOINTS.fleetCore}/recon/weeks`)).toBe(true);
    expect(isReconDeskChangePath(`${API_ENDPOINTS.toll}/toll/v2/import`)).toBe(false);
  });

  it('step complete bumps context from the response header (sent null)', async () => {
    setReconWeekContext({ runId: RUN, version: 73, closed: false });
    await noteReconWeekResponse(
      null,
      new Response('{}', { status: 200, headers: { 'X-Recon-Week-Version': '74' } }),
      STEP,
      'POST',
    );
    expect(getReconWeekContext()?.version).toBe(74);
  });

  it('reseal bumps context the same way', async () => {
    setReconWeekContext({ runId: RUN, version: 80, closed: false });
    await noteReconWeekResponse(
      null,
      new Response('{}', { status: 200, headers: { 'X-Recon-Week-Version': '81' } }),
      SEAL,
      'POST',
    );
    expect(getReconWeekContext()?.version).toBe(81);
  });

  it('note runs before announce so onSaved reads post-save version', async () => {
    setReconWeekContext({ runId: RUN, version: 73, closed: false });
    const atSave: number[] = [];
    vi.stubGlobal('window', {
      dispatchEvent: () => atSave.push(getReconWeekContext()?.version ?? -1),
    });
    await noteReconWeekResponse(
      null,
      new Response('{}', { status: 200, headers: { 'X-Recon-Week-Version': '74' } }),
      STEP,
      'POST',
    );
    announceReconWeekSave(STEP, 'POST', true);
    vi.unstubAllGlobals();
    expect(atSave).toEqual([74]);
  });

  it('recon GET does not apply a version header without lane sent', async () => {
    setReconWeekContext({ runId: RUN, version: 73, closed: false });
    const runGet = `${API_ENDPOINTS.fleetCore}/recon/runs/rideshare/2026-11-02`;
    await noteReconWeekResponse(
      null,
      new Response('{}', { status: 200, headers: { 'X-Recon-Week-Version': '99' } }),
      runGet,
      'GET',
    );
    expect(getReconWeekContext()?.version).toBe(73);
  });
});

describe('WRA-54: a saved change tells the week page to keep checking', () => {
  const IMPORT = `${API_ENDPOINTS.toll}/toll/v2/import`;
  function capture() {
    const seen: string[] = [];
    vi.stubGlobal('window', { dispatchEvent: (e: Event) => seen.push(e.type) });
    return seen;
  }

  it('an OK change while a week is open announces it', () => {
    setReconWeekContext({ runId: RUN, version: 3, closed: false });
    const seen = capture();
    announceReconWeekSave(IMPORT, 'POST', true);
    vi.unstubAllGlobals();
    expect(seen).toEqual([RECON_WEEK_SAVED_EVENT]);
  });

  it('reads, failures, auto-match, closed weeks and no open week announce nothing', () => {
    const seen = capture();
    announceReconWeekSave(IMPORT, 'POST', true);
    setReconWeekContext({ runId: RUN, version: 3, closed: false });
    announceReconWeekSave(`${API_ENDPOINTS.toll}/toll/v2/desk`, 'GET', true);
    announceReconWeekSave(IMPORT, 'POST', false);
    announceReconWeekSave(`${API_ENDPOINTS.toll}/toll-reconciliation/auto-match`, 'POST', true);
    announceReconWeekSave(`${PERIOD}/compute`, 'POST', true);
    setReconWeekContext({ runId: RUN, version: 3, closed: true });
    announceReconWeekSave(IMPORT, 'POST', true);
    vi.unstubAllGlobals();
    expect(seen).toEqual([]);
  });
});