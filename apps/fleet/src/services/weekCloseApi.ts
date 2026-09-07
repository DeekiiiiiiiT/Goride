/**
 * Close-the-week client (audit §6.5 / Phase 7).
 *
 * Talks to fleet-server /settlements/week-close:
 *   GET  /settlements/week-close/preview?weekKey=YYYY-MM-DD  → dry-run lanes + blockers
 *   POST /settlements/week-close  { weekKey, reason }        → sign the week
 *
 * The route is registered in supabase/functions/_fleet-server/index.tsx via
 * week_close_controller.tsx. Preview is read-only; POST runs the cross-system
 * invariants as a precondition and only closes when every driver ties.
 */
import { requireAuthHeaders } from '../utils/authHeaders';
import { fetchWithRetry } from './api';
import { API_ENDPOINTS } from './apiConfig';
import type { CloseBlocker, FuelLaneMetrics, TollLaneMetrics } from '../utils/weekCloseBlockers';

const BASE = `${API_ENDPOINTS.financial}/settlements/week-close`;

export type WeekClosePreview = {
  weekKey: string;
  driversTotal: number;
  driversReady: number;
  driversBlocked: number;
  /** Drivers already frozen for this week. */
  driversFrozen?: number;
  /** True when every driver-period is frozen. */
  weekClosed?: boolean;
  /** Earliest freeze timestamp when weekClosed. */
  closedAt?: string | null;
  fuel: FuelLaneMetrics;
  toll: TollLaneMetrics;
  blockers: CloseBlocker[];
  /** Pass 5: open statement↔engine drift rows for this org-week. */
  openEngineDriftCount?: number;
};

export type WeekCloseResult = {
  organizationId: string;
  weekKey: string;
  closed: boolean;
  driversClosed: number;
  driversBlocked: number;
  blockers: CloseBlocker[];
  perDriver: Array<{ driverId: string; closed: boolean; closeHash?: string; blockers: CloseBlocker[] }>;
};

/** True when the endpoint is genuinely absent (route not deployed yet). */
export function isWeekCloseUnavailable(err: unknown): boolean {
  if (err instanceof WeekCloseApiError) return err.status === 404 || err.status === 501;
  if (err instanceof TypeError) return true;
  return false;
}

export class WeekCloseApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'WeekCloseApiError';
    this.status = status;
  }
}

async function parseError(response: Response, fallback: string): Promise<string> {
  try {
    const j = await response.json();
    if (j && typeof j === 'object') {
      if (typeof (j as { error?: string }).error === 'string') return (j as { error: string }).error;
      if (typeof (j as { message?: string }).message === 'string') return (j as { message: string }).message;
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

export const weekCloseApi = {
  async preview(weekKey: string): Promise<WeekClosePreview> {
    const qs = new URLSearchParams({ weekKey });
    const response = await fetchWithRetry(`${BASE}/preview?${qs.toString()}`, {
      headers: await requireAuthHeaders(null),
    });
    if (!response.ok) {
      throw new WeekCloseApiError(await parseError(response, 'Failed to load close preview'), response.status);
    }
    return response.json() as Promise<WeekClosePreview>;
  },

  async close(weekKey: string, reason: string): Promise<WeekCloseResult> {
    const response = await fetchWithRetry(BASE, {
      method: 'POST',
      headers: await requireAuthHeaders(),
      body: JSON.stringify({ weekKey, reason }),
    });
    if (!response.ok) {
      throw new WeekCloseApiError(await parseError(response, 'Close week failed'), response.status);
    }
    return response.json() as Promise<WeekCloseResult>;
  },

  /** Heal fuel lane from Consumption money-strip amounts (force restates closed weeks). */
  async sealFuel(
    weekKey: string,
    opts?: {
      force?: boolean;
      amountsByDriver?: Record<
        string,
        {
          driverShare?: number;
          companyShare?: number;
          totalSpend?: number;
          miscellaneousCost?: number;
        }
      >;
    },
  ): Promise<{ published: number }> {
    const response = await fetchWithRetry(`${BASE}/seal-fuel`, {
      method: 'POST',
      headers: await requireAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        weekKey,
        force: opts?.force === true,
        amountsByDriver: opts?.amountsByDriver,
      }),
    });
    if (!response.ok) {
      throw new WeekCloseApiError(await parseError(response, 'Fuel seal failed'), response.status);
    }
    const j = (await response.json()) as { published?: number };
    return { published: Number(j.published) || 0 };
  },
};
