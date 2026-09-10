/**
 * Close-the-week client (audit §6.5 / Phase 7).
 *
 * Talks to fleet-server /settlements/week-close:
 *   GET  /settlements/week-close/preview?weekKey=YYYY-MM-DD  → dry-run lanes + blockers
 *   POST /settlements/week-close/sync { weekKey }            → seal/rebuild only when needed
 *   POST /settlements/week-close  { weekKey, reason }        → sign the week
 *   POST /settlements/week-close/reopen { weekKey, reason, acknowledgeSettlementRisk? }
 *
 * The route is registered in supabase/functions/_fleet-server/index.tsx via
 * week_close_controller.tsx. Preview is read-only; sync is slim (no-op writes when
 * healthy). POST close runs the cross-system invariants as a precondition and only
 * closes when every driver ties.
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
  /** H-3: week-level blockers (P&L, etc.) — not attributed to a driver. */
  weekBlockers?: CloseBlocker[];
  /** Pass 5: open statement↔engine drift rows for this org-week. */
  openEngineDriftCount?: number;
  /** Unfrozen drivers whose period toll_* ≠ seal before prepare/close rebuild. */
  tollPeriodSealDriftCount?: number;
  /** Unfrozen drivers rebuilt after lane seal on prepare. */
  periodsRebuiltAfterSeal?: number;
  /** Draft restatement rows awaiting sign for this week. */
  pendingRestatementCount?: number;
  /** Frozen drivers with settlement money already moved. */
  settlementRiskDriverCount?: number;
  /** Drivers with settlement_status = settled. */
  driversSettled?: number;
  /** True when every driver-period for the week is cash-settled. */
  cashAllSettled?: boolean;
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

export type WeekReopenResult = {
  organizationId: string;
  weekKey: string;
  reopened: boolean;
  driversReopened: number;
  driversSkipped: number;
  settlementRiskDrivers: Array<{
    driverId: string;
    settlementPaid: number;
    settlementAmount: number;
  }>;
};

export type ClosedWeekSummary = {
  weekKey: string;
  driversTotal: number;
  driversFrozen: number;
  closedAt: string | null;
  pendingRestatementCount: number;
};

export type OpenWeekSummary = {
  weekKey: string;
  driversTotal: number;
  driversFrozen: number;
  driversSettled: number;
  closedAt: string | null;
  cashAllSettled: boolean;
};

/** True when the endpoint is genuinely absent (route not deployed yet). */
export function isWeekCloseUnavailable(err: unknown): boolean {
  if (err instanceof WeekCloseApiError) return err.status === 404 || err.status === 501;
  if (err instanceof TypeError) return true;
  return false;
}

export class WeekCloseApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;
  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = 'WeekCloseApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function parseErrorPayload(
  response: Response,
  fallback: string,
): Promise<{ message: string; code?: string; details?: unknown }> {
  try {
    const j = await response.json();
    if (j && typeof j === 'object') {
      const code = typeof (j as { error?: string }).error === 'string'
        ? (j as { error: string }).error
        : undefined;
      const message =
        typeof (j as { message?: string }).message === 'string'
          ? (j as { message: string }).message
          : code || fallback;
      return { message, code, details: (j as { details?: unknown }).details };
    }
  } catch {
    /* ignore */
  }
  return { message: fallback };
}

export const weekCloseApi = {
  async preview(weekKey: string): Promise<WeekClosePreview> {
    const qs = new URLSearchParams({ weekKey });
    const response = await fetchWithRetry(`${BASE}/preview?${qs.toString()}`, {
      headers: await requireAuthHeaders(null),
    });
    if (!response.ok) {
      const err = await parseErrorPayload(response, 'Failed to load close preview');
      throw new WeekCloseApiError(err.message, response.status, err.code, err.details);
    }
    return response.json() as Promise<WeekClosePreview>;
  },

  /** Fully frozen weeks for the year (directory — not the Restatements queue). */
  async listClosed(year?: number): Promise<ClosedWeekSummary[]> {
    const qs = new URLSearchParams();
    if (year != null && Number.isFinite(year)) qs.set('year', String(year));
    const response = await fetchWithRetry(
      `${BASE}/closed-weeks${qs.toString() ? `?${qs.toString()}` : ''}`,
      { headers: await requireAuthHeaders(null) },
    );
    if (!response.ok) {
      const err = await parseErrorPayload(response, 'Failed to load closed weeks');
      throw new WeekCloseApiError(err.message, response.status, err.code, err.details);
    }
    const j = (await response.json()) as { weeks?: ClosedWeekSummary[] };
    return Array.isArray(j.weeks) ? j.weeks : [];
  },

  /** Not fully frozen weeks — dual-stamp cash settled counts for Open tab. */
  async listOpen(year?: number): Promise<OpenWeekSummary[]> {
    const qs = new URLSearchParams();
    if (year != null && Number.isFinite(year)) qs.set('year', String(year));
    const response = await fetchWithRetry(
      `${BASE}/open-weeks${qs.toString() ? `?${qs.toString()}` : ''}`,
      { headers: await requireAuthHeaders(null) },
    );
    if (!response.ok) {
      const err = await parseErrorPayload(response, 'Failed to load open weeks');
      throw new WeekCloseApiError(err.message, response.status, err.code, err.details);
    }
    const j = (await response.json()) as { weeks?: OpenWeekSummary[] };
    return Array.isArray(j.weeks) ? j.weeks : [];
  },

  /** H-1: seal lanes + persist drifts before close (preview stays read-only). */
  async prepare(
    weekKey: string,
    hints?: {
      forceFuelReseal?: boolean;
      forceTollReseal?: boolean;
      forceEarningsReseal?: boolean;
      forceAllLaneReseals?: boolean;
    },
  ): Promise<WeekClosePreview> {
    return this.sync(weekKey, hints);
  },

  /** Silent week sync (seal + rebuild when needed, else preview). Prefer over prepare in UI. */
  async sync(
    weekKey: string,
    hints?: {
      forceFuelReseal?: boolean;
      forceTollReseal?: boolean;
      forceEarningsReseal?: boolean;
      forceAllLaneReseals?: boolean;
    },
  ): Promise<WeekClosePreview> {
    const body = {
      weekKey,
      ...(hints?.forceFuelReseal ? { forceFuelReseal: true } : {}),
      ...(hints?.forceTollReseal ? { forceTollReseal: true } : {}),
      ...(hints?.forceEarningsReseal ? { forceEarningsReseal: true } : {}),
      ...(hints?.forceAllLaneReseals ? { forceAllLaneReseals: true } : {}),
    };
    const response = await fetchWithRetry(`${BASE}/sync`, {
      method: 'POST',
      headers: await requireAuthHeaders(),
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      // Older deploys may only have /prepare — fall back once.
      if (response.status === 404) {
        const legacy = await fetchWithRetry(`${BASE}/prepare`, {
          method: 'POST',
          headers: await requireAuthHeaders(),
          body: JSON.stringify(body),
        });
        if (!legacy.ok) {
          const err = await parseErrorPayload(legacy, 'Week sync failed');
          throw new WeekCloseApiError(err.message, legacy.status, err.code, err.details);
        }
        return legacy.json() as Promise<WeekClosePreview>;
      }
      const err = await parseErrorPayload(response, 'Week sync failed');
      throw new WeekCloseApiError(err.message, response.status, err.code, err.details);
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
      const err = await parseErrorPayload(response, 'Close week failed');
      throw new WeekCloseApiError(err.message, response.status, err.code, err.details);
    }
    return response.json() as Promise<WeekCloseResult>;
  },

  /** N-11: apply calendar freeze only after statements sealed but freeze failed. */
  async retryFreeze(weekKey: string, reason?: string): Promise<WeekCloseResult> {
    const response = await fetchWithRetry(`${BASE}/retry-freeze`, {
      method: 'POST',
      headers: await requireAuthHeaders(),
      body: JSON.stringify({
        weekKey,
        reason: reason || 'Retry freeze after ATOMIC_FREEZE_FAILED',
      }),
    });
    if (!response.ok) {
      const err = await parseErrorPayload(response, 'Retry freeze failed');
      throw new WeekCloseApiError(err.message, response.status, err.code, err.details);
    }
    return response.json() as Promise<WeekCloseResult>;
  },

  async reopen(
    weekKey: string,
    reason: string,
    acknowledgeSettlementRisk = false,
  ): Promise<WeekReopenResult> {
    const response = await fetchWithRetry(`${BASE}/reopen`, {
      method: 'POST',
      headers: await requireAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ weekKey, reason, acknowledgeSettlementRisk }),
    });
    if (!response.ok) {
      const err = await parseErrorPayload(response, 'Re-open week failed');
      throw new WeekCloseApiError(err.message, response.status, err.code, err.details);
    }
    return response.json() as Promise<WeekReopenResult>;
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
      const err = await parseErrorPayload(response, 'Fuel seal failed');
      throw new WeekCloseApiError(err.message, response.status, err.code, err.details);
    }
    const j = (await response.json()) as { published?: number };
    return { published: Number(j.published) || 0 };
  },

  /** Force re-seal toll week statements from events / plaza netting. */
  async sealToll(
    weekKey: string,
    opts?: { force?: boolean },
  ): Promise<{ published: number }> {
    const response = await fetchWithRetry(
      `${API_ENDPOINTS.financial}/toll/periods/${encodeURIComponent(weekKey)}/seal`,
      {
        method: 'POST',
        headers: await requireAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ force: opts?.force === true }),
      },
    );
    if (!response.ok) {
      const err = await parseErrorPayload(response, 'Toll seal failed');
      throw new WeekCloseApiError(err.message, response.status, err.code, err.details);
    }
    const j = (await response.json()) as { published?: number };
    return { published: Number(j.published) || 0 };
  },

  /**
   * Reverse orphan toll_usage events (no live toll_ledger row) for a week.
   * Driver settlement should not move for tag-only orphans.
   */
  async repairOrphanTollEvents(
    weekKey: string,
    opts?: { driverId?: string; rebuild?: boolean },
  ): Promise<{
    eventsReversed: number;
    orphanCount: number;
    orphanAmountMajor: number;
    periodsRebuilt: number;
    errors: string[];
  }> {
    const response = await fetchWithRetry(
      `${API_ENDPOINTS.financial}/toll/periods/${encodeURIComponent(weekKey)}/repair-orphan-events`,
      {
        method: 'POST',
        headers: await requireAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          driverId: opts?.driverId,
          rebuild: opts?.rebuild !== false,
          reason: 'orphan_toll_usage_no_ledger_row',
        }),
      },
    );
    if (!response.ok) {
      const err = await parseErrorPayload(response, 'Repair orphan toll events failed');
      throw new WeekCloseApiError(err.message, response.status, err.code, err.details);
    }
    const j = (await response.json()) as {
      eventsReversed?: number;
      orphanCount?: number;
      orphanAmountMajor?: number;
      periodsRebuilt?: number;
      errors?: string[];
    };
    return {
      eventsReversed: Number(j.eventsReversed) || 0,
      orphanCount: Number(j.orphanCount) || 0,
      orphanAmountMajor: Number(j.orphanAmountMajor) || 0,
      periodsRebuilt: Number(j.periodsRebuilt) || 0,
      errors: Array.isArray(j.errors) ? j.errors.map(String) : [],
    };
  },

  /**
   * Audit §10 — dry-run sample of active toll_usage on quarantined/voided/
   * amount-mismatched ledger rows (tag vs cash impact).
   */
  async ineligibleTollUsageReport(
    weekKey: string,
    opts?: { driverId?: string; sampleLimit?: number },
  ): Promise<{
    dryRun: boolean;
    totals: {
      count: number;
      amountMajor: number;
      tagAmountMajor: number;
      cashAmountMajor: number;
    };
    byWeek: Array<{
      weekKey: string;
      count: number;
      amountMajor: number;
      tagAmountMajor: number;
      cashAmountMajor: number;
    }>;
    rows: Array<{
      sourceId: string;
      eventId: string;
      reason: string;
      eventAmountMajor: number;
      paymentBucket: string;
      quarantineReason: string | null;
      plaza: string | null;
      date: string | null;
    }>;
  }> {
    const qs = new URLSearchParams();
    if (opts?.driverId) qs.set('driverId', opts.driverId);
    qs.set('sampleLimit', String(opts?.sampleLimit ?? 50));
    const response = await fetchWithRetry(
      `${API_ENDPOINTS.financial}/toll/periods/${encodeURIComponent(weekKey)}/ineligible-usage-report?${qs}`,
      { headers: await requireAuthHeaders(null) },
    );
    if (!response.ok) {
      const err = await parseErrorPayload(response, 'Ineligible toll usage report failed');
      throw new WeekCloseApiError(err.message, response.status, err.code, err.details);
    }
    return response.json() as Promise<{
      dryRun: boolean;
      totals: {
        count: number;
        amountMajor: number;
        tagAmountMajor: number;
        cashAmountMajor: number;
      };
      byWeek: Array<{
        weekKey: string;
        count: number;
        amountMajor: number;
        tagAmountMajor: number;
        cashAmountMajor: number;
      }>;
      rows: Array<{
        sourceId: string;
        eventId: string;
        reason: string;
        eventAmountMajor: number;
        paymentBucket: string;
        quarantineReason: string | null;
        plaza: string | null;
        date: string | null;
      }>;
    }>;
  },

  /**
   * Reverse ineligible / amount-mismatch toll_usage for a week, then rebuild.
   * Re-open closed weeks first; force-seal tolls after.
   */
  async repairIneligibleTollEvents(
    weekKey: string,
    opts?: { driverId?: string; rebuild?: boolean },
  ): Promise<{
    eventsReversed: number;
    periodsRebuilt: number;
    totals: {
      count: number;
      amountMajor: number;
      tagAmountMajor: number;
      cashAmountMajor: number;
    };
    errors: string[];
  }> {
    const response = await fetchWithRetry(
      `${API_ENDPOINTS.financial}/toll/periods/${encodeURIComponent(weekKey)}/ineligible-usage-report`,
      {
        method: 'POST',
        headers: await requireAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          driverId: opts?.driverId,
          apply: true,
          rebuild: opts?.rebuild !== false,
        }),
      },
    );
    if (!response.ok) {
      const err = await parseErrorPayload(response, 'Repair ineligible toll events failed');
      throw new WeekCloseApiError(err.message, response.status, err.code, err.details);
    }
    const j = (await response.json()) as {
      eventsReversed?: number;
      periodsRebuilt?: number;
      totals?: {
        count?: number;
        amountMajor?: number;
        tagAmountMajor?: number;
        cashAmountMajor?: number;
      };
      errors?: string[];
    };
    return {
      eventsReversed: Number(j.eventsReversed) || 0,
      periodsRebuilt: Number(j.periodsRebuilt) || 0,
      totals: {
        count: Number(j.totals?.count) || 0,
        amountMajor: Number(j.totals?.amountMajor) || 0,
        tagAmountMajor: Number(j.totals?.tagAmountMajor) || 0,
        cashAmountMajor: Number(j.totals?.cashAmountMajor) || 0,
      },
      errors: Array.isArray(j.errors) ? j.errors.map(String) : [],
    };
  },
};
