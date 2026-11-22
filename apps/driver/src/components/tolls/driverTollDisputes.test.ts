/**
 * UI2 — Roam Driver "Tolls to dispute": server calls and wording (GET/POST /toll/v2/driver/disputes).
 * The driver app runs node-only tests; the screens are checked against the Stitch screens.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../utils/supabase/client', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'jwt' } } }) } },
}));
vi.mock('../../utils/supabase/info', () => ({ publicAnonKey: 'anon' }));
vi.mock('../../services/apiConfig', () => ({ API_ENDPOINTS: { toll: 'https://x/fleet-toll' } }));

import {
  DriverDisputeError,
  consequence,
  daysLeftLine,
  fetchDriverTollDisputes,
  homeSummary,
  markDriverTollDisputeSent,
  placeLine,
  tripPill,
  uberHelpLine,
  type DriverTollDispute,
} from './driverTollDisputes';

function row(over: Partial<DriverTollDispute> & { id: string }): DriverTollDispute {
  return {
    version: 2,
    state: 'to_send',
    occurredAt: '2026-11-09T07:15:00-05:00',
    plazaName: 'Portmore',
    plate: '5179KZ',
    tollMinor: 39000,
    paidMinor: 37000,
    leftMinor: 2000,
    trip: { pickupAt: '2026-11-09T06:55:00-05:00', dropoffAt: '2026-11-09T07:40:00-05:00' },
    deadline: '2026-11-18T23:59:00-05:00',
    windowDays: 9,
    daysLeft: 8,
    openedLate: false,
    bearerIfNotSent: { bearer: 'driver', amountMinor: 2000 },
    ...over,
  };
}

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('server calls', () => {
  it('reads the driver route with the sign-in token; the driver is never sent', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ enabled: true, disputes: [row({ id: 'a' })] }), { status: 200 }));
    const res = await fetchDriverTollDisputes();
    expect(res.enabled).toBe(true);
    expect(res.disputes).toHaveLength(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://x/fleet-toll/toll/v2/driver/disputes');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer jwt', apikey: 'anon' });
    expect(String(url)).not.toMatch(/driver_id|driverId/);
  });

  it('switched off, not a fleet driver or no driver record → nothing to show, never an error', async () => {
    for (const status of [400, 401, 403, 409]) {
      fetchMock.mockResolvedValueOnce(new Response('{}', { status }));
      expect(await fetchDriverTollDisputes()).toEqual({ enabled: false, disputes: [] });
    }
  });

  it('Mark as sent posts a new command id and the dispute version', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
    await markDriverTollDisputeSent({ id: 'd 1', version: 4 });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://x/fleet-toll/toll/v2/driver/disputes/d%201/sent');
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.expected_dispute_version).toBe(4);
    expect(body.command_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('after the deadline the refusal is window_closed with the server message', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ code: 'window_closed', message: 'The 9 days to dispute this toll have passed' }), { status: 409 }),
    );
    const err = await markDriverTollDisputeSent({ id: 'a', version: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(DriverDisputeError);
    expect(err.code).toBe('window_closed');
    expect(err.message).toBe('The 9 days to dispute this toll have passed');
  });
});

describe('wording', () => {
  it('place, trip, days left and where to find the trip in Uber', () => {
    const d = row({ id: 'a' });
    expect(placeLine(d)).toBe('9 Nov, 7:15 AM · Portmore');
    expect(tripPill(d)).toBe('Uber trip 6:55 AM–7:40 AM');
    expect(daysLeftLine(d)).toBe('8 of 9 days left');
    expect(daysLeftLine(row({ id: 's', state: 'sent' }))).toBeNull();
    expect(uberHelpLine(d)).toBe(
      'In the Uber Driver app, open Earnings, find the trip on 9 Nov at 6:55 AM, choose Help and paste the message.',
    );
  });

  it('consequence: the driver pays by the deadline, or "today" on the last day (B5)', () => {
    expect(consequence(row({ id: 'a' }))).toEqual({
      tone: 'driver',
      text: "If you don't send this by Wed 18 Nov, J$20.00 will be charged to you on your settlement.",
    });
    expect(consequence(row({ id: 'a', daysLeft: 0 })).text).toMatch(/by today,/);
  });

  it('consequence: the fleet setting decides, also when found late', () => {
    const fleetText =
      "If this isn't sent in time, the fleet pays it, not you. If you send it and Uber refunds, the fleet gets the money back.";
    // found late: follows the fleet's setting, not automatically the fleet (owner, 21 Nov)
    expect(consequence(row({ id: 'a', openedLate: true })).tone).toBe('driver');
    expect(consequence(row({ id: 'a', bearerIfNotSent: { bearer: 'fleet', amountMinor: 2000 } }))).toEqual({ tone: 'fleet', text: fleetText });
  });

  it('Home summary: only tolls still to send, red chip with 2 days or fewer', () => {
    expect(
      homeSummary([row({ id: 'a' }), row({ id: 'b', daysLeft: 2 }), row({ id: 'c', windowClosed: true, daysLeft: 0 }), row({ id: 's', state: 'sent' })]),
    ).toEqual({ toSend: 2, toSendMinor: 4000, sent: 1, sentMinor: 2000, urgentDays: 2 });
    expect(homeSummary([row({ id: 'a' })]).urgentDays).toBeNull();
  });
});
