/**
 * Roam Driver — Tolls to dispute with Uber (toll disputes UI2, audit C3 "Roam driver app").
 * Reads GET /toll/v2/driver/disputes (the server finds the driver from the sign-in; never sent by the app) and
 * marks one sent with POST /toll/v2/driver/disputes/:id/sent. Every figure comes from the dispute row.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../utils/supabase/client';
import { publicAnonKey } from '../../utils/supabase/info';
import { API_ENDPOINTS } from '../../services/apiConfig';

export type DriverTollDispute = {
  id: string;
  version: number;
  /** to_send or sent */
  state: string;
  platform?: string;
  occurredAt?: string;
  plazaName?: string | null;
  plate?: string | null;
  tollMinor: number;
  paidMinor: number;
  leftMinor: number;
  trip?: { requestAt?: string; pickupAt?: string; dropoffAt?: string } | null;
  deadline?: string;
  windowDays?: number | null;
  daysLeft?: number;
  windowClosed?: boolean;
  red?: boolean;
  openedLate?: boolean;
  canMarkSent?: boolean;
  bearerIfNotSent?: { bearer: string; amountMinor: number } | null;
  /** The message to copy, filled in by the server. */
  text?: string | null;
};

export type DriverTollDisputes = { enabled: boolean; disputes: DriverTollDispute[] };

export class DriverDisputeError extends Error {
  constructor(message: string, readonly code: string, readonly status: number) {
    super(message);
  }
}

async function headers(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  return {
    Authorization: `Bearer ${data.session?.access_token ?? publicAnonKey}`,
    apikey: publicAnonKey,
    'Content-Type': 'application/json',
  };
}

async function readError(res: Response): Promise<DriverDisputeError> {
  let code = 'REQUEST_FAILED';
  let message = 'That did not work. Please try again.';
  try {
    const body = (await res.json()) as { code?: string; message?: string };
    if (body.code) code = body.code;
    if (body.message) message = body.message;
  } catch {
    /* keep defaults */
  }
  return new DriverDisputeError(message, code, res.status);
}

export async function fetchDriverTollDisputes(): Promise<DriverTollDisputes> {
  const res = await fetch(`${API_ENDPOINTS.toll}/toll/v2/driver/disputes`, { headers: await headers() });
  // Not a fleet driver, switched off, or no driver record: nothing to show (never an error on Home).
  if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 404 || res.status === 409) {
    return { enabled: false, disputes: [] };
  }
  if (!res.ok) throw await readError(res);
  const body = (await res.json()) as Partial<DriverTollDisputes>;
  return { enabled: body.enabled === true, disputes: body.disputes ?? [] };
}

export async function markDriverTollDisputeSent(d: Pick<DriverTollDispute, 'id' | 'version'>): Promise<void> {
  const res = await fetch(`${API_ENDPOINTS.toll}/toll/v2/driver/disputes/${encodeURIComponent(d.id)}/sent`, {
    method: 'POST',
    headers: await headers(),
    body: JSON.stringify({ command_id: crypto.randomUUID(), expected_dispute_version: d.version }),
  });
  if (!res.ok) throw await readError(res);
}

export const DRIVER_TOLL_DISPUTES_KEY = ['driver-toll-disputes'] as const;

export function useDriverTollDisputes(enabled = true) {
  return useQuery({
    queryKey: DRIVER_TOLL_DISPUTES_KEY,
    queryFn: fetchDriverTollDisputes,
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}

// ---- Plain words (no figures worked out here; amounts and days come from the row) ----

const JM = 'America/Jamaica';

export function fmtJmd(minor: number | null | undefined): string {
  if (minor == null || !Number.isFinite(minor)) return '—';
  return `J$${(minor / 100).toLocaleString('en-JM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function parts(iso: string, opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('en-US', { timeZone: JM, ...opts }).formatToParts(new Date(iso));
}
const pv = (p: Intl.DateTimeFormatPart[], t: Intl.DateTimeFormatPartTypes) => p.find((x) => x.type === t)?.value ?? '';

/** "7:15 AM" */
export function timeJm(iso: string | undefined): string {
  if (!iso) return '—';
  const p = parts(iso, { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${pv(p, 'hour')}:${pv(p, 'minute')} ${pv(p, 'dayPeriod').toUpperCase()}`;
}

/** "9 Nov, 7:15 AM" */
export function whenJm(iso: string | undefined): string {
  if (!iso) return '—';
  const p = parts(iso, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
  return `${pv(p, 'day')} ${pv(p, 'month')}, ${timeJm(iso)}`;
}

/** "Wed 18 Nov" */
export function dayJm(iso: string | undefined): string {
  if (!iso) return '';
  const p = parts(iso, { weekday: 'short', day: 'numeric', month: 'short' });
  return `${pv(p, 'weekday')} ${pv(p, 'day')} ${pv(p, 'month')}`;
}

/** "9 Nov" */
export function dateJm(iso: string | undefined): string {
  if (!iso) return '';
  const p = parts(iso, { day: 'numeric', month: 'short' });
  return `${pv(p, 'day')} ${pv(p, 'month')}`;
}

export function placeLine(d: DriverTollDispute): string {
  return `${whenJm(d.occurredAt)} · ${d.plazaName || 'Toll'}`;
}

export function tripPill(d: DriverTollDispute): string | null {
  const t = d.trip;
  if (!t) return null;
  const start = t.pickupAt || t.requestAt;
  if (!start && !t.dropoffAt) return null;
  return `Uber trip ${timeJm(start)}–${timeJm(t.dropoffAt)}`;
}

export function daysLeftLine(d: DriverTollDispute): string | null {
  if (d.state !== 'to_send' || d.daysLeft == null) return null;
  return d.windowDays ? `${d.daysLeft} of ${d.windowDays} days left` : `${d.daysLeft} days left`;
}

/** The step-2 helper line: where to find the trip in Uber. */
export function uberHelpLine(d: DriverTollDispute): string {
  const start = d.trip?.pickupAt || d.trip?.requestAt || d.occurredAt;
  return `In the Uber Driver app, open Earnings, find the trip on ${dateJm(start)} at ${timeJm(start)}, choose Help and paste the message.`;
}

/** B5 / AG6: what happens if the driver does nothing. `fleet` → the blue box. */
export function consequence(d: DriverTollDispute): { tone: 'driver' | 'fleet'; text: string } {
  const amount = fmtJmd(d.bearerIfNotSent?.amountMinor ?? d.leftMinor);
  // Who pays if it isn't sent follows the fleet's setting, also when Roam found it late (owner, 21 Nov).
  if (d.bearerIfNotSent?.bearer === 'fleet') {
    return {
      tone: 'fleet',
      text: "If this isn't sent in time, the fleet pays it, not you. If you send it and Uber refunds, the fleet gets the money back.",
    };
  }
  const by = d.daysLeft === 0 ? 'today' : dayJm(d.deadline);
  return { tone: 'driver', text: `If you don't send this by ${by}, ${amount} will be charged to you on your settlement.` };
}

/** Home card numbers, from the rows. */
export function homeSummary(list: DriverTollDispute[]) {
  const toSend = list.filter((d) => d.state === 'to_send' && !d.windowClosed);
  const sent = list.filter((d) => d.state === 'sent');
  const minDays = toSend.reduce<number | null>((m, d) => (d.daysLeft == null ? m : m == null ? d.daysLeft : Math.min(m, d.daysLeft)), null);
  return {
    toSend: toSend.length,
    toSendMinor: toSend.reduce((n, d) => n + (d.leftMinor ?? 0), 0),
    sent: sent.length,
    sentMinor: sent.reduce((n, d) => n + (d.leftMinor ?? 0), 0),
    /** Red chip on Home: 2 days or fewer on the oldest. */
    urgentDays: minDays != null && minDays <= 2 ? minDays : null,
  };
}
