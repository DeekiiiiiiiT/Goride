/**
 * Token-based calls for the customer screens that moved to Fleet admin.
 * Uses the signed-in session from PlatformSessionProvider. No Dominion login.
 */
import { API_ENDPOINTS, getSupabaseFunctionsBaseUrl, projectId, publicAnonKey } from '@roam/api-client';
import { requirePlatformAuthHeaders } from '../auth/platformAuthHeaders';
import { ledgerApi } from './ledgerApi';
import type { FuelEntry } from '../types/fuel';

export type JaaProgram = {
  id: string;
  companyCode: string;
  displayName: string;
  mode: string;
  organizationId?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type JaaUnmatchedRow = {
  id: string;
  cardCode: string;
  companyCode: string;
  receiptNumber: string;
  amount: number;
  liters?: number;
  fuelAmount?: number;
  transDate?: string;
  vendor?: string;
  fuelType?: string;
  response?: string;
  classification?: string;
  status: string;
  importId?: string;
  resolvedCardId?: string;
  resolvedOrganizationId?: string;
  createdAt?: string;
};

export type JaaCsvImport = {
  id: string;
  fileName: string;
  uploadedAt: string;
  parsedRows: number;
  savedEntries: number;
  unmatchedCount: number;
  skippedDuplicates?: number;
  failedSaves?: number;
  status?: string;
  summary?: string | null;
};

export type JaaCsvImportsResponse = {
  imports: JaaCsvImport[];
  untracked: { entryCount: number; unmatchedCount: number; hasData: boolean };
};

export type FleetFuelCard = {
  id: string;
  cardNumber: string;
  provider: string;
  status: string;
  organizationId?: string;
  jaaCompanyCode?: string;
  jaaCardType?: string;
  assignedVehicleId?: string;
  assignedDriverId?: string;
  assignmentHistory?: unknown[];
  expiryDate?: string;
  notes?: string;
  [key: string]: unknown;
};

export type PetrojamPrice = {
  id: string;
  priceDate: string;
  gasolene87: number | null;
  gasolene90: number | null;
  autoDiesel: number | null;
  ulsd: number | null;
};

export type RetailMarkupVersion = {
  id: string;
  effectiveFrom: string;
  gasolene87Markup: number;
  gasolene90Markup: number;
  autoDieselMarkup: number;
  ulsdMarkup: number;
  isPublished: boolean;
  versionLabel?: string;
};

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

export type IslandReconciliation = {
  source_system: string;
  legacy_count: number;
  unified_count: number;
  delta: number;
};

async function authHeaders(contentType: string | null = 'application/json') {
  return requirePlatformAuthHeaders(contentType);
}

async function readError(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => ({})) as { error?: string; message?: string };
  return body.message || body.error || fallback;
}

export const fleetCustomerOpsApi = {
  getFuelEntries: ledgerApi.getFuelEntries.bind(ledgerApi) as typeof ledgerApi.getFuelEntries,

  async getAllFuelEntriesInRange(options: {
    startDate?: string;
    endDate?: string;
    organizationId?: string;
    pageSize?: number;
    maxPages?: number;
  } = {}): Promise<FuelEntry[]> {
    const pageSize = options.pageSize ?? 1500;
    const maxPages = options.maxPages ?? 40;
    const accumulated: FuelEntry[] = [];
    let totalCount: number | undefined;
    for (let page = 0; page < maxPages; page++) {
      const batch = await this.getFuelEntries({
        limit: pageSize,
        offset: page * pageSize,
        startDate: options.startDate,
        endDate: options.endDate,
        organizationId: options.organizationId,
      });
      if (typeof (batch as { totalCount?: number }).totalCount === 'number') {
        totalCount = (batch as { totalCount?: number }).totalCount;
      }
      if (!Array.isArray(batch) || batch.length === 0) break;
      accumulated.push(...batch);
      if (totalCount != null && accumulated.length >= totalCount) break;
      if (batch.length < pageSize) break;
    }
    if (totalCount != null) {
      (accumulated as FuelEntry[] & { totalCount?: number }).totalCount = totalCount;
    }
    return accumulated;
  },

  async getFuelEntriesForJaaMatch(limit = 5000): Promise<FuelEntry[]> {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 90);
    const ymd = (d: Date) => d.toISOString().slice(0, 10);
    return this.getFuelEntries({ limit, startDate: ymd(start), endDate: ymd(end) });
  },

  async getFuelCards(organizationId?: string): Promise<FleetFuelCard[]> {
    const q = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : '';
    const response = await fetch(`${API_ENDPOINTS.fuel}/fuel-cards${q}`, {
      headers: await authHeaders(null),
    });
    if (!response.ok) throw new Error(await readError(response, 'Failed to fetch fuel cards'));
    return response.json();
  },

  async saveFuelCard(card: Partial<FleetFuelCard>): Promise<FleetFuelCard> {
    const response = await fetch(`${API_ENDPOINTS.fuel}/fuel-cards`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(card),
    });
    if (!response.ok) throw new Error(await readError(response, 'Failed to save fuel card'));
    const result = await response.json();
    return result.data || result;
  },

  async getJaaPrograms(): Promise<JaaProgram[]> {
    const response = await fetch(`${API_ENDPOINTS.fuel}/jaa-programs`, {
      headers: await authHeaders(null),
    });
    if (!response.ok) throw new Error(await readError(response, 'Failed to fetch JAA programs'));
    return response.json();
  },

  async saveJaaProgram(program: Partial<JaaProgram>): Promise<JaaProgram> {
    const response = await fetch(`${API_ENDPOINTS.fuel}/jaa-programs`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(program),
    });
    if (!response.ok) throw new Error(await readError(response, 'Failed to save JAA program'));
    const result = await response.json();
    return result.data || result;
  },

  async deleteJaaProgram(id: string): Promise<void> {
    const response = await fetch(`${API_ENDPOINTS.fuel}/jaa-programs/${id}`, {
      method: 'DELETE',
      headers: await authHeaders(null),
    });
    if (!response.ok) throw new Error(await readError(response, 'Failed to delete JAA program'));
  },

  async getJaaUnmatched(status = 'open'): Promise<JaaUnmatchedRow[]> {
    const response = await fetch(
      `${API_ENDPOINTS.fuel}/jaa-unmatched?status=${encodeURIComponent(status)}`,
      { headers: await authHeaders(null) },
    );
    if (!response.ok) throw new Error(await readError(response, 'Failed to fetch unmatched rows'));
    return response.json();
  },

  async patchJaaUnmatched(id: string, patch: Partial<JaaUnmatchedRow>): Promise<JaaUnmatchedRow> {
    const response = await fetch(`${API_ENDPOINTS.fuel}/jaa-unmatched/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: await authHeaders(),
      body: JSON.stringify(patch),
    });
    if (!response.ok) throw new Error(await readError(response, 'Failed to update unmatched row'));
    const result = await response.json();
    return result.data || result;
  },

  async saveJaaUnmatched(rows: Partial<JaaUnmatchedRow>[]): Promise<JaaUnmatchedRow[]> {
    const response = await fetch(`${API_ENDPOINTS.fuel}/jaa-unmatched`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ rows }),
    });
    if (!response.ok) throw new Error(await readError(response, 'Failed to save unmatched rows'));
    const result = await response.json();
    return result.data || [];
  },

  async getJaaCsvImports(): Promise<JaaCsvImportsResponse> {
    const response = await fetch(`${API_ENDPOINTS.fuel}/jaa-csv-imports`, {
      headers: await authHeaders(null),
    });
    if (!response.ok) throw new Error(await readError(response, 'Failed to fetch CSV imports'));
    return response.json();
  },

  async saveJaaCsvImport(record: Partial<JaaCsvImport>): Promise<JaaCsvImport> {
    const response = await fetch(`${API_ENDPOINTS.fuel}/jaa-csv-imports`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(record),
    });
    if (!response.ok) throw new Error(await readError(response, 'Failed to save CSV import record'));
    const result = await response.json();
    return result.data || result;
  },

  async deleteJaaCsvImport(id: string): Promise<{ entriesDeleted: number; unmatchedDeleted: number }> {
    const response = await fetch(`${API_ENDPOINTS.fuel}/jaa-csv-imports/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: await authHeaders(null),
    });
    if (!response.ok) throw new Error(await readError(response, 'Failed to delete CSV import'));
    return response.json();
  },

  async deleteUntrackedJaaCsvData(): Promise<{ entriesDeleted: number; unmatchedDeleted: number }> {
    const response = await fetch(`${API_ENDPOINTS.fuel}/jaa-csv-imports/untracked`, {
      method: 'DELETE',
      headers: await authHeaders(null),
    });
    if (!response.ok) throw new Error(await readError(response, 'Failed to wipe untracked import data'));
    return response.json();
  },

  async promoteJaaGateHeld(): Promise<{ promoted: number; deletedDupes: number; uniqueReceipts?: number }> {
    const response = await fetch(`${API_ENDPOINTS.fuel}/admin/jaa-promote-gateheld`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({}),
    });
    if (!response.ok) throw new Error(await readError(response, 'Failed to promote gate-held JAA rows'));
    return response.json();
  },

  async applyJaaFuelMatches(pairs: unknown[]) {
    const response = await fetch(`${API_ENDPOINTS.fuel}/jaa/apply-matches`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ pairs }),
    });
    if (!response.ok) throw new Error(await readError(response, 'Failed to apply JAA fuel matches'));
    return response.json() as Promise<{
      success: boolean;
      results: Array<{ ok?: boolean; code?: string; error?: string; statementId?: string; driverId?: string }>;
    }>;
  },

  async saveFuelEntry(entry: FuelEntry): Promise<FuelEntry> {
    const response = await fetch(`${API_ENDPOINTS.fuel}/fuel-entries`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(entry),
    });
    if (!response.ok) throw new Error(await readError(response, 'Failed to save fuel entry'));
    const result = await response.json();
    return result.data || result;
  },

  async listPetrojamPrices(limit = 120): Promise<PetrojamPrice[]> {
    const response = await fetch(
      `${getSupabaseFunctionsBaseUrl()}/petrojam-prices/admin/prices?limit=${limit}`,
      { headers: await authHeaders() },
    );
    if (!response.ok) throw new Error(await readError(response, 'Failed to load prices'));
    const data = await response.json();
    return (data.prices || []) as PetrojamPrice[];
  },

  async listRetailMarkups(): Promise<RetailMarkupVersion[]> {
    const headers = await authHeaders(null);
    headers.apikey = headers.apikey || publicAnonKey;
    headers.Accept = 'application/json';
    const response = await fetch(
      `https://${projectId}.supabase.co/rest/v1/fuel_retail_price_markup?select=*&order=effective_from.desc`,
      { headers },
    );
    if (!response.ok) throw new Error(await readError(response, 'Failed to load retail markup'));
    const rows = await response.json() as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: String(r.id),
      effectiveFrom: String(r.effective_from),
      gasolene87Markup: Number(r.gasolene_87_markup) || 0,
      gasolene90Markup: Number(r.gasolene_90_markup) || 0,
      autoDieselMarkup: Number(r.auto_diesel_markup) || 0,
      ulsdMarkup: Number(r.ulsd_markup) || 0,
      isPublished: !!r.is_published,
      versionLabel: r.version_label ? String(r.version_label) : undefined,
    }));
  },

  async verifyRecordForensics(recordId: string): Promise<{ verified?: boolean; auditTrail?: { cryptographic?: string } }> {
    const response = await fetch(`${API_ENDPOINTS.fuel}/admin/verify-record-forensics`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ recordId }),
    });
    if (!response.ok) throw new Error(await readError(response, 'Forensic verification failed'));
    return response.json();
  },

  async listFleetCustomers(): Promise<{ id: string; name?: string; email?: string; organizationId?: string }[]> {
    const response = await fetch(`${API_ENDPOINTS.admin}/fleet-admin/customers`, {
      headers: await authHeaders(null),
    });
    if (!response.ok) throw new Error(await readError(response, 'Failed to load customers'));
    const data = await response.json() as {
      customers?: Array<{ id: string; name?: string; email?: string; organizationId?: string }>;
    };
    return data.customers || [];
  },

  async fetchReconExternalQueue(): Promise<Array<{
    organizationId: string;
    organizationName: string | null;
    serviceLine: string;
    weekKey: string;
    sourceId: string;
    runId: string | null;
    runSourceStatus: string | null;
    requestId: string | null;
    requestedAt: string | null;
    requestedBy: string | null;
    note: string | null;
  }> | null> {
    const response = await fetch(
      `${API_ENDPOINTS.fleetCore}/make-server-37f42386/recon/external-queue`,
      { headers: await authHeaders(null) },
    );
    if (response.status === 403) return null;
    if (!response.ok) throw new Error(await readError(response, 'Failed to load queue'));
    const body = await response.json() as { items?: [] };
    return body.items ?? [];
  },

  async fetchUnifiedLedgerFeed(opts: {
    page?: number;
    limit?: number;
    product?: string;
    driverId?: string;
  } = {}) {
    const sp = new URLSearchParams();
    if (opts.page) sp.set('page', String(opts.page));
    if (opts.limit) sp.set('limit', String(opts.limit));
    if (opts.product) sp.set('product', opts.product);
    if (opts.driverId) sp.set('driver_id', opts.driverId);
    const qs = sp.toString();
    const response = await fetch(
      `${API_ENDPOINTS.rides}/admin/ledger/unified/feed${qs ? `?${qs}` : ''}`,
      { headers: await authHeaders(null) },
    );
    if (!response.ok) throw new Error(await readError(response, 'Failed to load unified ledger'));
    return response.json() as Promise<{ entries: UnifiedLedgerEntry[]; total: number; page: number; limit: number }>;
  },

  async fetchUnifiedLedgerReconciliation() {
    const response = await fetch(`${API_ENDPOINTS.rides}/admin/ledger/unified/reconciliation`, {
      headers: await authHeaders(null),
    });
    if (!response.ok) throw new Error(await readError(response, 'Failed to load reconciliation'));
    return response.json() as Promise<{
      islands: IslandReconciliation[];
      anomaly_count: number;
      healthy: boolean;
      green_definition?: string;
    }>;
  },

  async fetchAmountReconciliation() {
    const response = await fetch(`${API_ENDPOINTS.rides}/admin/ledger/unified/reconciliation/amounts`, {
      headers: await authHeaders(null),
    });
    if (!response.ok) throw new Error(await readError(response, 'Failed to load amounts'));
    return response.json() as Promise<{ amounts: { source_system: string; entry_count: number; total_amount_minor: number; currency: string }[] }>;
  },

  async fetchBalanceChecks() {
    const response = await fetch(`${API_ENDPOINTS.rides}/admin/ledger/unified/reconciliation/balances`, {
      headers: await authHeaders(null),
    });
    if (!response.ok) throw new Error(await readError(response, 'Failed to load balances'));
    return response.json() as Promise<{
      balances: { product: string; total_debits_minor: number; total_credits_minor: number; net_balance_minor: number; balanced: boolean }[];
      all_balanced: boolean;
    }>;
  },

  async fetchLedgerSoakStatus() {
    const response = await fetch(`${API_ENDPOINTS.rides}/admin/ledger/unified/soak-status`, {
      headers: await authHeaders(null),
    });
    if (!response.ok) throw new Error(await readError(response, 'Failed to load soak status'));
    return response.json() as Promise<Record<string, unknown>>;
  },
};
