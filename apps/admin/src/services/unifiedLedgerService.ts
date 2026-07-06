/**
 * Dominion — unified ledger feed + reconciliation (rides Edge admin API).
 */
import { API_ENDPOINTS } from './apiConfig';
import { publicAnonKey } from '../utils/supabase/info';

export type UnifiedLedgerEntry = {
  id: string;
  organization_id: string | null;
  idempotency_key: string;
  entry_type: string;
  product: string;
  amount_minor: number;
  currency: string;
  effective_at: string;
  reference_type: string | null;
  reference_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type UnifiedLedgerFeedResponse = {
  entries: UnifiedLedgerEntry[];
  total: number;
  page: number;
  limit: number;
  source: string;
};

export type IslandReconciliation = {
  source_system: string;
  legacy_count: number;
  unified_count: number;
  delta: number;
};

export type UnifiedLedgerReconciliationResponse = {
  islands: IslandReconciliation[];
  anomaly_count: number;
  healthy: boolean;
};

function edgeHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    apikey: publicAnonKey,
  };
}

async function parseError(res: Response): Promise<string> {
  const body = await res.json().catch(() => ({})) as { error?: string; message?: string };
  return body.message || body.error || `HTTP ${res.status}`;
}

const base = `${API_ENDPOINTS.rides}/admin/ledger/unified`;

export async function fetchUnifiedLedgerFeed(
  accessToken: string,
  opts: {
    page?: number;
    limit?: number;
    product?: string;
    from?: string;
    to?: string;
    organizationId?: string;
  } = {},
): Promise<UnifiedLedgerFeedResponse> {
  const sp = new URLSearchParams();
  if (opts.page) sp.set('page', String(opts.page));
  if (opts.limit) sp.set('limit', String(opts.limit));
  if (opts.product) sp.set('product', opts.product);
  if (opts.from) sp.set('from', opts.from);
  if (opts.to) sp.set('to', opts.to);
  if (opts.organizationId) sp.set('organization_id', opts.organizationId);

  const qs = sp.toString();
  const res = await fetch(`${base}/feed${qs ? `?${qs}` : ''}`, { headers: edgeHeaders(accessToken) });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function fetchUnifiedLedgerReconciliation(
  accessToken: string,
): Promise<UnifiedLedgerReconciliationResponse> {
  const res = await fetch(`${base}/reconciliation`, { headers: edgeHeaders(accessToken) });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}
