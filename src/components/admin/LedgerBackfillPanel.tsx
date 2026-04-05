import React, { useState } from 'react';
import { projectId, publicAnonKey } from '../../utils/supabase/info';
import { api } from '../../services/api';
import { CheckCircle2, AlertTriangle, Play, Eye, Loader2, Clock, Database, ChevronDown, ChevronUp, Wrench, Search, Download, Info } from 'lucide-react';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-37f42386`;

function edgeFnHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    Authorization: `Bearer ${publicAnonKey}`,
    apikey: publicAnonKey,
    ...extra,
  };
}

interface BackfillResult {
  success: boolean;
  dryRun: boolean;
  filterDriverId: string | null;
  stats: {
    tripsProcessed: number;
    tripsSkipped: number;
    txProcessed: number;
    txSkipped: number;
    ledgerCreated: number;
    errors: number;
  };
  byPlatform: Record<string, number>;
  skipped: Record<string, number>;
  errorDetails?: { tripId: string; platform: string; driverId: string; error: string }[];
  startedAt: string;
  completedAt: string;
  durationMs: number;
  error?: string;
}

interface RepairResult {
  success: boolean;
  dryRun: boolean;
  filterDriverId: string | null;
  filterCanonicalId: string | null;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  stats: {
    scanned: number;
    alreadyCorrect: number;
    repaired: number;
    unresolvable: number;
    skippedNoDriverId: number;
    skippedFilterMismatch: number;
    errors: number;
    byPlatform: Record<string, { scanned: number; repaired: number }>;
    repairedSamples: { entryId: string; oldDriverId: string; newDriverId: string; platform: string; eventType: string }[];
    errorSamples: { entryId: string; error: string }[];
    unresolvableSamples?: { entryId: string; driverId: string; platform: string; eventType: string }[];
  };
  _diagnostics?: { driverRecords: { id: string; name: string; uberDriverId: string | null; inDriveDriverId: string | null }[] };
}

interface TollRepairDatesResponse {
  success: boolean;
  results: {
    dryRun: boolean;
    fleetTz: string;
    totalLedger: number;
    checked: number;
    legacyFound: number;
    toUpdate: number;
    updated: number;
    skipped: number;
    errors: number;
    samples: Array<{ id: string; from: string; to: string }>;
  };
  error?: string;
}

export function LedgerBackfillPanel() {
  // ── Backfill state ──
  const [driverId, setDriverId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BackfillResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  // ── Repair Driver IDs state ──
  const [repairDriverId, setRepairDriverId] = useState('');
  const [repairLoading, setRepairLoading] = useState(false);
  const [repairResult, setRepairResult] = useState<RepairResult | null>(null);
  const [repairError, setRepairError] = useState<string | null>(null);
  const [showRepairSamples, setShowRepairSamples] = useState(false);
  const [showRepairErrors, setShowRepairErrors] = useState(false);
  const [showUnresolvable, setShowUnresolvable] = useState(false);
  const [showDriverDiag, setShowDriverDiag] = useState(false);

  // ── UUID Discovery state ──
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [discoveryResult, setDiscoveryResult] = useState<any>(null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);

  // ── Step B: Set Platform ID state ──
  const [setPlatformLoading, setPlatformLoading_] = useState(false);
  const [setPlatformResult, setPlatformResult_] = useState<any>(null);
  const [setPlatformError, setPlatformError_] = useState<string | null>(null);
  const [confirmSetPlatform, setConfirmSetPlatform] = useState<{ roamId: string; platform: string; platformId: string; driverName: string } | null>(null);

  // ── Toll Ledger Date Repair state ──
  const [tollRepairLoading, setTollRepairLoading] = useState(false);
  const [tollRepairResult, setTollRepairResult] = useState<TollRepairDatesResponse | null>(null);
  const [tollRepairError, setTollRepairError] = useState<string | null>(null);
  const [tollBackupLoading, setTollBackupLoading] = useState(false);

  const [stripDriverId, setStripDriverId] = useState('');
  const [stripLoading, setStripLoading] = useState(false);
  const [stripResult, setStripResult] = useState<{
    resolvedAliases?: string[];
    deletedDriverMetricKeys?: number;
    deletedLedgerEventKeys?: number;
    deletedIdempotencyKeys?: number;
  } | null>(null);
  const [stripError, setStripError] = useState<string | null>(null);

  const runStripUberPaymentMetrics = async () => {
    const id = stripDriverId.trim();
    if (!id) {
      setStripError('Enter a driver UUID (Roam / internal id).');
      return;
    }
    setStripLoading(true);
    setStripError(null);
    setStripResult(null);
    try {
      const data = await api.stripUberPaymentDriverMetrics(id);
      setStripResult({
        resolvedAliases: data.resolvedAliases,
        deletedDriverMetricKeys: data.deletedDriverMetricKeys ?? data.deletedKeys,
        deletedLedgerEventKeys: data.deletedLedgerEventKeys,
        deletedIdempotencyKeys: data.deletedIdempotencyKeys,
      });
    } catch (e: any) {
      setStripError(e?.message || 'Request failed');
    } finally {
      setStripLoading(false);
    }
  };

  const runBackfill = async (dryRun: boolean) => {
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (dryRun) params.set('dryRun', 'true');
      if (driverId.trim()) params.set('driverId', driverId.trim());

      const url = `${API_BASE}/ledger/backfill${params.toString() ? '?' + params.toString() : ''}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${publicAnonKey}` },
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Server returned ${res.status}`);
      } else {
        setResult(data);
      }
    } catch (e: any) {
      setError(e.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const downloadTollLedgerBackup = async () => {
    setTollBackupLoading(true);
    setTollRepairError(null);
    try {
      const url = `${API_BASE}/ledger/backfill?tollLedgerBackup=1&dryRun=true`;
      const res = await fetch(url, {
        method: 'POST',
        headers: edgeFnHeaders(),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server returned ${res.status}`);
      }

      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const objectUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `toll_ledger_backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(objectUrl);
    } catch (e: any) {
      setTollRepairError(e.message || 'Backup download failed');
    } finally {
      setTollBackupLoading(false);
    }
  };

  const runTollRepairDates = async (dryRun: boolean) => {
    setTollRepairLoading(true);
    setTollRepairResult(null);
    setTollRepairError(null);

    try {
      const params = new URLSearchParams();
      params.set('tollLedgerDateRepair', '1');
      params.set('repairDryRun', dryRun ? 'true' : 'false');
      params.set('repairBatchSize', '200');
      params.set('dryRun', 'true');
      const url = `${API_BASE}/ledger/backfill?${params.toString()}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: edgeFnHeaders(),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTollRepairError(data.error || `Server returned ${res.status}`);
      } else {
        setTollRepairResult(data);
      }
    } catch (e: any) {
      setTollRepairError(e.message || 'Network error');
    } finally {
      setTollRepairLoading(false);
    }
  };

  const runDiscovery = async () => {
    setDiscoveryLoading(true);
    setDiscoveryResult(null);
    setDiscoveryError(null);
    try {
      const res = await fetch(`${API_BASE}/diagnostic/unresolvable-driver-map`, {
        headers: edgeFnHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        setDiscoveryError(data.error || `Server returned ${res.status}`);
      } else {
        setDiscoveryResult(data);
      }
    } catch (e: any) {
      setDiscoveryError(e.message || 'Network error');
    } finally {
      setDiscoveryLoading(false);
    }
  };

  const runSetPlatformId = async (roamId: string, platform: string, platformId: string) => {
    setPlatformLoading_(true);
    setPlatformResult_(null);
    setPlatformError_(null);
    try {
      const res = await fetch(`${API_BASE}/diagnostic/set-platform-id`, {
        method: 'POST',
        headers: edgeFnHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ roamId, platform, platformId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPlatformError_(data.error || `Server returned ${res.status}`);
      } else {
        setPlatformResult_(data);
        setConfirmSetPlatform(null);
        // Re-run discovery to show updated driver records
        runDiscovery();
      }
    } catch (e: any) {
      setPlatformError_(e.message || 'Network error');
    } finally {
      setPlatformLoading_(false);
    }
  };

  const runRepair = async (dryRun: boolean) => {
    setRepairLoading(true);
    setRepairResult(null);
    setRepairError(null);

    try {
      const params = new URLSearchParams();
      if (dryRun) params.set('dryRun', 'true');
      if (repairDriverId.trim()) params.set('driverId', repairDriverId.trim());

      const url = `${API_BASE}/ledger/repair-driver-ids${params.toString() ? '?' + params.toString() : ''}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: edgeFnHeaders(),
      });

      const data = await res.json();
      if (!res.ok) {
        setRepairError(data.error || `Server returned ${res.status}`);
      } else {
        setRepairResult(data);
      }
    } catch (e: any) {
      setRepairError(e.message || 'Network error');
    } finally {
      setRepairLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 1: LEDGER BACKFILL                                        */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      {/* Header */}
      <div className="flex items-center gap-3">
        <Database className="h-7 w-7 text-blue-600 dark:text-blue-400" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Ledger Backfill</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Preview what a historical backfill would do (dry run). Live legacy <code className="text-[11px]">ledger:%</code> writes from this tool are retired.
          </p>
        </div>
      </div>

      <div className="flex gap-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/40 p-4 text-sm text-slate-600 dark:text-slate-300">
        <Info className="h-5 w-5 flex-shrink-0 text-slate-500 dark:text-slate-400 mt-0.5" aria-hidden />
        <div className="space-y-1.5">
          <p className="font-medium text-slate-800 dark:text-slate-100">Legacy mass backfill and repair writes are off</p>
          <p>
            The server returns <span className="font-mono text-xs">403</span> for live runs that wrote legacy ledger rows. Use{' '}
            <span className="font-medium">Preview (Dry Run)</span> below to inspect counts only. To add money history from imports, use the app’s{' '}
            <span className="font-medium">Imports</span> flow (canonical <code className="text-[11px]">ledger_event:*</code> append).
          </p>
        </div>
      </div>

      {/* Stuck Uber cash — payment CSV metrics left in KV after batch delete */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Clear stuck Uber payment metrics</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Resolves <span className="font-medium">Roam id + Uber UUID</span> from the driver profile, then removes matching payment metrics and Uber{' '}
            <code className="text-[11px]">ledger_event:*</code> rows. Requires <span className="font-medium">data.backfill</span>.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={stripDriverId}
            onChange={(e) => setStripDriverId(e.target.value)}
            placeholder="Driver UUID (internal)"
            className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
            disabled={stripLoading}
          />
          <button
            type="button"
            onClick={runStripUberPaymentMetrics}
            disabled={stripLoading}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {stripLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Strip metrics
          </button>
        </div>
        {stripError && (
          <p className="text-sm text-red-600 dark:text-red-400">{stripError}</p>
        )}
        {stripResult && (
          <div className="text-sm text-emerald-700 dark:text-emerald-400 space-y-1">
            {stripResult.resolvedAliases && stripResult.resolvedAliases.length > 0 && (
              <p className="text-xs text-slate-600 dark:text-slate-300 font-mono break-all">
                Aliases: {stripResult.resolvedAliases.join(' · ')}
              </p>
            )}
            <p>
              Driver metrics: {stripResult.deletedDriverMetricKeys ?? 0} · Ledger events: {stripResult.deletedLedgerEventKeys ?? 0} · Idempotency keys:{' '}
              {stripResult.deletedIdempotencyKeys ?? 0}. Refresh the driver page.
            </p>
          </div>
        )}
      </div>

      {/* Backfill Controls */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Driver ID Filter <span className="text-slate-400 font-normal">(optional — leave blank for all drivers)</span>
          </label>
          <input
            type="text"
            value={driverId}
            onChange={(e) => setDriverId(e.target.value)}
            placeholder="e.g. a1b2c3d4-e5f6-..."
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            disabled={loading}
          />
        </div>

        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => runBackfill(true)}
            disabled={loading}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700 rounded-lg font-medium text-sm hover:bg-blue-100 dark:hover:bg-blue-900/50 disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
            Preview (Dry Run)
          </button>

          <button
            type="button"
            disabled
            title="Live legacy ledger backfill is disabled server-side (403). Use Preview (Dry Run) or Imports for canonical events."
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm border border-slate-200 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-80"
          >
            <Play className="h-4 w-4" />
            Run backfill (retired)
          </button>
        </div>
      </div>

      {/* Backfill Loading */}
      {loading && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6 flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-400" />
          <span className="text-blue-700 dark:text-blue-300 font-medium">Running backfill... this may take a minute for large datasets.</span>
        </div>
      )}

      {/* Backfill Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-5">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400 font-medium mb-1">
            <AlertTriangle className="h-4 w-4" />
            Backfill Failed
          </div>
          <p className="text-sm text-red-600 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Backfill Results */}
      {result && (
        <div className="space-y-4">
          <div className={`rounded-xl p-4 flex items-center gap-3 ${
            result.dryRun
              ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
              : 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
          }`}>
            {result.dryRun ? (
              <Eye className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            )}
            <div>
              <span className={`font-semibold ${result.dryRun ? 'text-blue-700 dark:text-blue-300' : 'text-green-700 dark:text-green-300'}`}>
                {result.dryRun ? 'Dry Run Complete' : 'Backfill Complete'}
              </span>
              {result.dryRun && (
                <span className="text-sm text-blue-600 dark:text-blue-400 ml-2">— No data was written. This is a preview only.</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <Clock className="h-4 w-4" />
            Completed in {(result.durationMs / 1000).toFixed(1)}s
            {result.filterDriverId && (
              <span className="ml-2 px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-xs font-mono">
                Driver: {result.filterDriverId.substring(0, 12)}...
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatCard label="Trips Processed" value={result.stats.tripsProcessed} color="green" />
            <StatCard label="Trips Skipped" value={result.stats.tripsSkipped} color="slate" />
            <StatCard label="Ledger Entries Created" value={result.stats.ledgerCreated} color="blue" subtitle={result.dryRun ? '(would create)' : undefined} />
            <StatCard label="Transactions Processed" value={result.stats.txProcessed} color="green" />
            <StatCard label="Transactions Skipped" value={result.stats.txSkipped} color="slate" />
            <StatCard label="Errors" value={result.stats.errors} color={result.stats.errors > 0 ? 'red' : 'slate'} />
          </div>

          {Object.keys(result.byPlatform).length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Ledger Entries by Platform</h3>
              <div className="space-y-2">
                {Object.entries(result.byPlatform).sort((a, b) => b[1] - a[1]).map(([platform, count]) => (
                  <div key={platform} className="flex items-center justify-between">
                    <span className="text-sm text-slate-600 dark:text-slate-400">{platform}</span>
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">{count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.skipped && Object.values(result.skipped).some(v => v > 0) && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Skip Reasons</h3>
              <div className="space-y-2">
                {Object.entries(result.skipped).filter(([, v]) => v > 0).map(([reason, count]) => (
                  <div key={reason} className="flex items-center justify-between">
                    <span className="text-sm text-slate-600 dark:text-slate-400">{formatSkipReason(reason)}</span>
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">{count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.errorDetails && result.errorDetails.length > 0 && (
            <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-xl p-5">
              <button
                onClick={() => setShowErrors(!showErrors)}
                className="flex items-center gap-2 w-full text-left"
              >
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <span className="text-sm font-semibold text-red-700 dark:text-red-300">
                  {result.errorDetails.length} Error{result.errorDetails.length > 1 ? 's' : ''} (click to {showErrors ? 'hide' : 'show'})
                </span>
                {showErrors ? <ChevronUp className="h-4 w-4 ml-auto text-red-400" /> : <ChevronDown className="h-4 w-4 ml-auto text-red-400" />}
              </button>
              {showErrors && (
                <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
                  {result.errorDetails.map((err, i) => (
                    <div key={i} className="text-xs bg-white dark:bg-slate-900 rounded-lg p-3 border border-red-100 dark:border-red-900">
                      <div className="flex gap-4 mb-1">
                        <span className="text-slate-500">Trip: <span className="font-mono">{err.tripId.substring(0, 12)}...</span></span>
                        <span className="text-slate-500">Platform: {err.platform}</span>
                        <span className="text-slate-500">Driver: <span className="font-mono">{err.driverId.substring(0, 12)}...</span></span>
                      </div>
                      <div className="text-red-600 dark:text-red-400">{err.error}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <details className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl">
            <summary className="px-5 py-3 text-sm font-medium text-slate-600 dark:text-slate-400 cursor-pointer hover:text-slate-900 dark:hover:text-white">
              Raw JSON Response
            </summary>
            <pre className="px-5 pb-4 text-xs text-slate-600 dark:text-slate-400 overflow-x-auto whitespace-pre-wrap font-mono">
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 1B: TOLL LEDGER DATE REPAIR                                 */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Toll Ledger Date Repair</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Aligns <span className="font-medium">toll_ledger.date</span> with legacy <span className="font-medium">transaction</span> dates.
              Calls the same <span className="font-medium">POST …/ledger/backfill</span> route as the section above (extra query flags only).
              <span className="block mt-1 text-slate-400 dark:text-slate-500">404 usually means the hosted Edge Function is not this codebase version—redeploy <span className="font-mono text-xs">make-server-37f42386</span>.</span>
            </p>
          </div>

          <button
            onClick={downloadTollLedgerBackup}
            disabled={tollBackupLoading || tollRepairLoading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg font-medium text-sm hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
            title="Download a full JSON backup of toll_ledger:* before making changes"
          >
            {tollBackupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Download Backup (toll_ledger)
          </button>
        </div>

        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => runTollRepairDates(true)}
            disabled={tollRepairLoading || tollBackupLoading}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700 rounded-lg font-medium text-sm hover:bg-blue-100 dark:hover:bg-blue-900/50 disabled:opacity-50 transition-colors"
          >
            {tollRepairLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
            Preview (Dry Run)
          </button>

          <button
            type="button"
            disabled
            title="Live toll date repair via legacy route is disabled (403). Use Preview (Dry Run) only."
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm border border-slate-200 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-80"
          >
            <Play className="h-4 w-4" />
            Run repair (retired)
          </button>
        </div>

        {tollRepairError && (
          <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
            <div>
              <div className="text-sm font-medium text-red-800 dark:text-red-200">Repair failed</div>
              <div className="text-sm text-red-700 dark:text-red-300">{tollRepairError}</div>
            </div>
          </div>
        )}

        {tollRepairResult?.success && (
          <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-lg space-y-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-sm font-semibold text-slate-900 dark:text-white">
                {tollRepairResult.results.dryRun ? 'Dry Run Results' : 'Repair Completed'}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Fleet TZ: <span className="font-medium">{tollRepairResult.results.fleetTz}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md p-3">
                <div className="text-xs text-slate-500 dark:text-slate-400">Ledger total</div>
                <div className="text-lg font-bold text-slate-900 dark:text-white">{tollRepairResult.results.totalLedger}</div>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md p-3">
                <div className="text-xs text-slate-500 dark:text-slate-400">Legacy found</div>
                <div className="text-lg font-bold text-slate-900 dark:text-white">{tollRepairResult.results.legacyFound}</div>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md p-3">
                <div className="text-xs text-slate-500 dark:text-slate-400">Would change</div>
                <div className="text-lg font-bold text-slate-900 dark:text-white">{tollRepairResult.results.toUpdate}</div>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md p-3">
                <div className="text-xs text-slate-500 dark:text-slate-400">Errors</div>
                <div className="text-lg font-bold text-slate-900 dark:text-white">{tollRepairResult.results.errors}</div>
              </div>
            </div>

            {tollRepairResult.results.samples?.length > 0 && (
              <div className="mt-2">
                <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Sample changes (max 25)</div>
                <div className="max-h-48 overflow-auto rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-slate-600 dark:text-slate-300">ID</th>
                        <th className="text-left px-3 py-2 font-medium text-slate-600 dark:text-slate-300">From</th>
                        <th className="text-left px-3 py-2 font-medium text-slate-600 dark:text-slate-300">To</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tollRepairResult.results.samples.map((s) => (
                        <tr key={s.id} className="border-b border-slate-100 dark:border-slate-800">
                          <td className="px-3 py-2 font-mono text-slate-700 dark:text-slate-200">{s.id}</td>
                          <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{s.from}</td>
                          <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{s.to}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 2: DRIVER ID REPAIR                                       */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      <div className="border-t border-slate-200 dark:border-slate-700 pt-8">
        {/* Repair Header */}
        <div className="flex items-center gap-3 mb-6">
          <Wrench className="h-7 w-7 text-purple-600 dark:text-purple-400" />
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Driver ID Repair</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Fix ledger entries that have a raw Uber/InDrive UUID instead of the canonical Roam UUID
            </p>
          </div>
        </div>

        {/* Explainer */}
        <div className="bg-purple-50 dark:bg-purple-900/15 border border-purple-200 dark:border-purple-800 rounded-xl p-4 mb-5">
          <p className="text-sm text-purple-700 dark:text-purple-300">
            <strong>Why is this needed?</strong> Uber trips imported before the driver ID fix stored the raw Uber UUID
            as the <code className="px-1 py-0.5 bg-purple-100 dark:bg-purple-800/50 rounded text-xs">driverId</code> in
            ledger entries. This means queries by Roam UUID miss those entries, causing Uber earnings to disappear from
            the Financials tab. This tool resolves each driverId to the canonical Roam UUID and updates mismatches.
          </p>
        </div>

        {/* ── Step A: UUID Discovery ── */}
        <div className="bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-700 rounded-xl p-5 space-y-4 mb-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-indigo-700 dark:text-indigo-300 flex items-center gap-2">
                <Search className="h-4 w-4" />
                Step A: Discover UUID → Driver Mapping
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Scans ledger entries to find non-Roam driverIds and shows which driver name they belong to.
                Use this to populate <code className="px-1 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-xs">uberDriverId</code> on driver records.
              </p>
            </div>
            <button
              onClick={runDiscovery}
              disabled={discoveryLoading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700 rounded-lg font-medium text-sm hover:bg-indigo-100 dark:hover:bg-indigo-900/50 disabled:opacity-50 transition-colors shrink-0"
            >
              {discoveryLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {discoveryLoading ? 'Scanning...' : 'Discover'}
            </button>
          </div>

          {discoveryError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <div className="flex items-center gap-2 text-red-700 dark:text-red-400 text-sm font-medium">
                <AlertTriangle className="h-4 w-4" />
                Discovery Failed
              </div>
              <p className="text-xs text-red-600 dark:text-red-300 mt-1">{discoveryError}</p>
            </div>
          )}

          {discoveryResult && (
            <div className="space-y-3">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Scanned {discoveryResult.totalLedgerEntries?.toLocaleString()} ledger entries • Found {discoveryResult.uniqueUnresolvableIds} unique non-Roam driverId{discoveryResult.uniqueUnresolvableIds !== 1 ? 's' : ''}
              </div>

              {/* Mapping results */}
              {discoveryResult.mapping && discoveryResult.mapping.length > 0 ? (
                <div className="space-y-3">
                  {discoveryResult.mapping.map((m: any, i: number) => (
                    <div key={i} className="bg-indigo-50 dark:bg-indigo-900/15 border border-indigo-200 dark:border-indigo-800 rounded-lg p-4">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Platform UUID</div>
                          <div className="font-mono text-sm text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-900/40 px-2 py-1 rounded break-all">
                            {m.driverId}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Ledger Entries</div>
                          <div className="text-lg font-bold text-indigo-700 dark:text-indigo-300">{m.count.toLocaleString()}</div>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-3">
                        <div>
                          <span className="text-xs text-slate-500">Driver Name(s): </span>
                          {m.driverNames.length > 0 ? (
                            m.driverNames.map((n: string, j: number) => (
                              <span key={j} className="inline-block text-sm font-semibold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded mr-1">
                                {n}
                              </span>
                            ))
                          ) : (
                            <span className="text-sm text-amber-600 dark:text-amber-400 italic">no driverName stored</span>
                          )}
                        </div>
                        <div>
                          <span className="text-xs text-slate-500">Platforms: </span>
                          {m.platforms.map((p: string, j: number) => (
                            <span key={j} className="inline-block text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded mr-1">
                              {p}
                            </span>
                          ))}
                        </div>
                      </div>
                      {m.roamId && (
                        <div className="mt-3">
                          <button
                            onClick={() => setConfirmSetPlatform({ roamId: m.roamId, platform: m.platforms[0], platformId: m.driverId, driverName: m.driverNames[0] })}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700 rounded-lg font-medium text-sm hover:bg-indigo-100 dark:hover:bg-indigo-900/50 disabled:opacity-50 transition-colors"
                          >
                            <Wrench className="h-4 w-4" />
                            Set Platform ID
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
                  All ledger driverIds are already Roam UUIDs — nothing to map!
                </div>
              )}

              {/* Roam Driver Records for reference */}
              {discoveryResult.driverRecords && discoveryResult.driverRecords.length > 0 && (
                <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">Roam Driver Records (for reference)</div>
                  {discoveryResult.driverRecords.map((d: any, i: number) => (
                    <div key={i} className="text-xs flex gap-4 items-center py-1 border-b border-slate-100 dark:border-slate-700 last:border-0 flex-wrap">
                      <span className="text-slate-700 dark:text-slate-300 font-medium">{d.name}</span>
                      <span className="font-mono text-slate-500 text-[10px]">{d.roamId}</span>
                      <span className={d.uberDriverId ? 'text-green-600' : 'text-red-500'}>{d.uberDriverId ? `Uber: ${d.uberDriverId.substring(0, 12)}...` : 'Uber: null'}</span>
                      <span className={d.inDriveDriverId ? 'text-green-600' : 'text-red-500'}>{d.inDriveDriverId ? `InDrive: ${d.inDriveDriverId.substring(0, 12)}...` : 'InDrive: null'}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Raw JSON */}
              <details className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg">
                <summary className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 cursor-pointer hover:text-slate-900 dark:hover:text-white">
                  Raw JSON Response
                </summary>
                <pre className="px-4 pb-3 text-xs text-slate-600 dark:text-slate-400 overflow-x-auto whitespace-pre-wrap font-mono">
                  {JSON.stringify(discoveryResult, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </div>

        {/* ── Step B: Set Platform ID on Driver Record ── */}
        <div className="bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-700 rounded-xl p-5 space-y-4 mb-5">
          <div>
            <h3 className="text-sm font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
              <Wrench className="h-4 w-4" />
              Step B: Set Platform ID on Driver Record
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Assigns a platform UUID (Uber/InDrive) to a Roam driver record so <code className="px-1 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-xs">resolveCanonicalDriverId()</code> can map it.
            </p>
          </div>

          {/* Success banner */}
          {setPlatformResult && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-400 text-sm font-medium">
                <CheckCircle2 className="h-4 w-4" />
                Successfully set {setPlatformResult.field} on "{setPlatformResult.driverName}"
              </div>
              <div className="text-xs text-green-600 dark:text-green-300 mt-1 font-mono">
                {setPlatformResult.oldValue || 'null'} &rarr; {setPlatformResult.newValue}
              </div>
            </div>
          )}

          {/* Error banner */}
          {setPlatformError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <div className="flex items-center gap-2 text-red-700 dark:text-red-400 text-sm font-medium">
                <AlertTriangle className="h-4 w-4" />
                Set Platform ID Failed
              </div>
              <p className="text-xs text-red-600 dark:text-red-300 mt-1">{setPlatformError}</p>
            </div>
          )}

          {/* Confirmation flow or trigger */}
          {!confirmSetPlatform ? (
            <div className="space-y-3">
              {/* Pre-fill from discovery if available */}
              {discoveryResult?.mapping?.filter((m: any) => m.driverId !== 'fleet_general' && m.platforms.includes('Uber')).map((m: any, i: number) => {
                // Try to match driverName to a Roam driver record
                const matchingRoam = discoveryResult.driverRecords?.find((d: any) =>
                  m.driverNames.some((name: string) => name.toLowerCase() === d.name.toLowerCase())
                );
                if (!matchingRoam) return null;
                return (
                  <div key={i} className="flex items-center gap-3 bg-emerald-50 dark:bg-emerald-900/15 rounded-lg p-3 border border-emerald-200 dark:border-emerald-800">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-slate-700 dark:text-slate-300">
                        Set <span className="font-semibold text-emerald-700 dark:text-emerald-300">uberDriverId</span> on{' '}
                        <span className="font-semibold">{matchingRoam.name}</span>
                      </div>
                      <div className="text-xs font-mono text-slate-500 mt-0.5 truncate">
                        {m.driverId}
                      </div>
                    </div>
                    <button
                      onClick={() => setConfirmSetPlatform({
                        roamId: matchingRoam.roamId,
                        platform: 'uber',
                        platformId: m.driverId,
                        driverName: matchingRoam.name,
                      })}
                      disabled={setPlatformLoading || !!matchingRoam.uberDriverId}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium text-sm hover:bg-emerald-700 disabled:opacity-50 transition-colors shrink-0"
                    >
                      {matchingRoam.uberDriverId ? (
                        <>
                          <CheckCircle2 className="h-4 w-4" />
                          Already Set
                        </>
                      ) : (
                        <>
                          <Wrench className="h-4 w-4" />
                          Set UUID
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
              {/* Fallback: if no discovery yet */}
              {!discoveryResult && (
                <p className="text-xs text-slate-400 italic">Run Step A (Discover) first to auto-detect UUID mappings.</p>
              )}
            </div>
          ) : (
            <div className="bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <p className="text-sm text-amber-700 dark:text-amber-300 font-medium mb-2">
                Confirm: Set <span className="font-semibold">uberDriverId</span> on driver "{confirmSetPlatform.driverName}"?
              </p>
              <div className="text-xs font-mono text-amber-600 dark:text-amber-400 mb-3">
                Roam ID: {confirmSetPlatform.roamId}<br />
                Uber UUID: {confirmSetPlatform.platformId}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => runSetPlatformId(confirmSetPlatform.roamId, confirmSetPlatform.platform, confirmSetPlatform.platformId)}
                  disabled={setPlatformLoading}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg font-medium text-sm hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {setPlatformLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Yes, Set It
                </button>
                <button
                  onClick={() => setConfirmSetPlatform(null)}
                  disabled={setPlatformLoading}
                  className="px-4 py-2 text-slate-600 dark:text-slate-400 text-sm hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Repair Controls */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Driver ID Filter <span className="text-slate-400 font-normal">(optional — leave blank to repair all entries)</span>
            </label>
            <input
              type="text"
              value={repairDriverId}
              onChange={(e) => setRepairDriverId(e.target.value)}
              placeholder="e.g. a1b2c3d4-e5f6-... (Roam UUID or Uber UUID)"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              disabled={repairLoading}
            />
          </div>

          <div className="flex gap-3 flex-wrap">
            {/* Repair Dry Run */}
            <button
              onClick={() => runRepair(true)}
              disabled={repairLoading}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-700 rounded-lg font-medium text-sm hover:bg-purple-100 dark:hover:bg-purple-900/50 disabled:opacity-50 transition-colors"
            >
              {repairLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
              Preview (Dry Run)
            </button>

            <button
              type="button"
              disabled
              title="Live driver-id repair writes are disabled server-side (403). Use Preview (Dry Run) only."
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm border border-slate-200 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-80"
            >
              <Wrench className="h-4 w-4" />
              Run repair (retired)
            </button>
          </div>
        </div>

        {/* Repair Loading */}
        {repairLoading && (
          <div className="mt-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl p-6 flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-purple-600 dark:text-purple-400" />
            <span className="text-purple-700 dark:text-purple-300 font-medium">Scanning ledger entries... this may take a moment.</span>
          </div>
        )}

        {/* Repair Error */}
        {repairError && (
          <div className="mt-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-5">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-400 font-medium mb-1">
              <AlertTriangle className="h-4 w-4" />
              Repair Failed
            </div>
            <p className="text-sm text-red-600 dark:text-red-300">{repairError}</p>
          </div>
        )}

        {/* Repair Results */}
        {repairResult && (
          <div className="mt-4 space-y-4">
            {/* Status Banner */}
            <div className={`rounded-xl p-4 flex items-center gap-3 ${
              repairResult.dryRun
                ? 'bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800'
                : repairResult.stats.repaired > 0
                  ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                  : 'bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700'
            }`}>
              {repairResult.dryRun ? (
                <Eye className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              ) : repairResult.stats.repaired > 0 ? (
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-slate-500 dark:text-slate-400" />
              )}
              <div>
                <span className={`font-semibold ${
                  repairResult.dryRun ? 'text-purple-700 dark:text-purple-300'
                    : repairResult.stats.repaired > 0 ? 'text-green-700 dark:text-green-300'
                    : 'text-slate-700 dark:text-slate-300'
                }`}>
                  {repairResult.dryRun
                    ? `Dry Run Complete — ${repairResult.stats.repaired} entries would be repaired`
                    : repairResult.stats.repaired > 0
                      ? `Repair Complete — ${repairResult.stats.repaired} entries updated`
                      : 'Scan Complete — no entries need repair'}
                </span>
                {repairResult.dryRun && (
                  <span className="text-sm text-purple-600 dark:text-purple-400 ml-2">— No data was written.</span>
                )}
              </div>
            </div>

            {/* Timing + filter info */}
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 flex-wrap">
              <Clock className="h-4 w-4" />
              Completed in {(repairResult.durationMs / 1000).toFixed(1)}s
              {repairResult.filterDriverId && (
                <span className="ml-2 px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-xs font-mono">
                  Filter: {repairResult.filterDriverId.substring(0, 12)}...
                </span>
              )}
              {repairResult.filterCanonicalId && repairResult.filterCanonicalId !== repairResult.filterDriverId && (
                <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/40 rounded text-xs font-mono text-purple-700 dark:text-purple-300">
                  Canonical: {repairResult.filterCanonicalId.substring(0, 12)}...
                </span>
              )}
            </div>

            {/* Main Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Scanned" value={repairResult.stats.scanned} color="slate" />
              <StatCard label="Already Correct" value={repairResult.stats.alreadyCorrect} color="green" />
              <StatCard
                label={repairResult.dryRun ? "Would Repair" : "Repaired"}
                value={repairResult.stats.repaired}
                color={repairResult.stats.repaired > 0 ? "purple" : "slate"}
              />
              <StatCard label="Unresolvable" value={repairResult.stats.unresolvable} color={repairResult.stats.unresolvable > 0 ? "amber" : "slate"} />
            </div>

            {/* Per-Platform Breakdown */}
            {Object.keys(repairResult.stats.byPlatform).length > 0 && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Breakdown by Platform</h3>
                <div className="space-y-2">
                  {Object.entries(repairResult.stats.byPlatform)
                    .sort((a, b) => b[1].repaired - a[1].repaired)
                    .map(([platform, { scanned, repaired }]) => (
                      <div key={platform} className="flex items-center justify-between">
                        <span className="text-sm text-slate-600 dark:text-slate-400">{platform}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-slate-400">{scanned.toLocaleString()} scanned</span>
                          {repaired > 0 && (
                            <span className="text-sm font-semibold text-purple-700 dark:text-purple-300">
                              {repaired.toLocaleString()} {repairResult.dryRun ? 'to repair' : 'repaired'}
                            </span>
                          )}
                          {repaired === 0 && (
                            <span className="text-sm text-green-600 dark:text-green-400">all correct</span>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Repaired Samples */}
            {repairResult.stats.repairedSamples.length > 0 && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
                <button
                  onClick={() => setShowRepairSamples(!showRepairSamples)}
                  className="flex items-center gap-2 w-full text-left"
                >
                  <Wrench className="h-4 w-4 text-purple-500" />
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    {repairResult.stats.repairedSamples.length} Sample{repairResult.stats.repairedSamples.length > 1 ? 's' : ''} (click to {showRepairSamples ? 'hide' : 'show'})
                  </span>
                  {showRepairSamples ? <ChevronUp className="h-4 w-4 ml-auto text-slate-400" /> : <ChevronDown className="h-4 w-4 ml-auto text-slate-400" />}
                </button>
                {showRepairSamples && (
                  <div className="mt-3 space-y-2 max-h-80 overflow-y-auto">
                    {repairResult.stats.repairedSamples.map((s, i) => (
                      <div key={i} className="text-xs bg-slate-50 dark:bg-slate-800 rounded-lg p-3 border border-slate-100 dark:border-slate-700">
                        <div className="flex gap-4 mb-1.5 flex-wrap">
                          <span className="text-slate-500">Platform: <span className="font-semibold text-slate-700 dark:text-slate-300">{s.platform}</span></span>
                          <span className="text-slate-500">Type: <span className="font-semibold text-slate-700 dark:text-slate-300">{s.eventType}</span></span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded">{s.oldDriverId.substring(0, 16)}...</span>
                          <span className="text-slate-400">-&gt;</span>
                          <span className="font-mono text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-1.5 py-0.5 rounded">{s.newDriverId.substring(0, 16)}...</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Error Samples */}
            {repairResult.stats.errorSamples.length > 0 && (
              <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-xl p-5">
                <button
                  onClick={() => setShowRepairErrors(!showRepairErrors)}
                  className="flex items-center gap-2 w-full text-left"
                >
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  <span className="text-sm font-semibold text-red-700 dark:text-red-300">
                    {repairResult.stats.errors} Error{repairResult.stats.errors > 1 ? 's' : ''} (click to {showRepairErrors ? 'hide' : 'show'})
                  </span>
                  {showRepairErrors ? <ChevronUp className="h-4 w-4 ml-auto text-red-400" /> : <ChevronDown className="h-4 w-4 ml-auto text-red-400" />}
                </button>
                {showRepairErrors && (
                  <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
                    {repairResult.stats.errorSamples.map((err, i) => (
                      <div key={i} className="text-xs bg-white dark:bg-slate-900 rounded-lg p-3 border border-red-100 dark:border-red-900">
                        <span className="text-slate-500 font-mono">{err.entryId.substring(0, 16)}...</span>
                        <div className="text-red-600 dark:text-red-400 mt-1">{err.error}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Unresolvable Samples */}
            {repairResult.stats.unresolvableSamples && repairResult.stats.unresolvableSamples.length > 0 && (
              <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl p-5">
                <button
                  onClick={() => setShowUnresolvable(!showUnresolvable)}
                  className="flex items-center gap-2 w-full text-left"
                >
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                    {repairResult.stats.unresolvableSamples.length} Unresolvable{repairResult.stats.unresolvableSamples.length > 1 ? 's' : ''} (click to {showUnresolvable ? 'hide' : 'show'})
                  </span>
                  {showUnresolvable ? <ChevronUp className="h-4 w-4 ml-auto text-amber-400" /> : <ChevronDown className="h-4 w-4 ml-auto text-amber-400" />}
                </button>
                {showUnresolvable && (
                  <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
                    {repairResult.stats.unresolvableSamples.map((err, i) => (
                      <div key={i} className="text-xs bg-white dark:bg-slate-900 rounded-lg p-3 border border-red-100 dark:border-red-900">
                        <div className="flex gap-4 mb-1">
                          <span className="text-slate-500">Entry: <span className="font-mono">{err.entryId.substring(0, 12)}...</span></span>
                          <span className="text-slate-500">Platform: {err.platform}</span>
                          <span className="text-slate-500">Driver: <span className="font-mono">{err.driverId.substring(0, 12)}...</span></span>
                        </div>
                        <div className="text-red-600 dark:text-red-400">{err.error}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Driver Diagnostics */}
            {repairResult._diagnostics && repairResult._diagnostics.driverRecords.length > 0 && (
              <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
                <button
                  onClick={() => setShowDriverDiag(!showDriverDiag)}
                  className="flex items-center gap-2 w-full text-left"
                >
                  <Wrench className="h-4 w-4 text-purple-500" />
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    {repairResult._diagnostics.driverRecords.length} Driver Record{repairResult._diagnostics.driverRecords.length > 1 ? 's' : ''} (click to {showDriverDiag ? 'hide' : 'show'})
                  </span>
                  {showDriverDiag ? <ChevronUp className="h-4 w-4 ml-auto text-slate-400" /> : <ChevronDown className="h-4 w-4 ml-auto text-slate-400" />}
                </button>
                {showDriverDiag && (
                  <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
                    {repairResult._diagnostics.driverRecords.map((record, i) => (
                      <div key={i} className="text-xs bg-slate-50 dark:bg-slate-800 rounded-lg p-3 border border-slate-100 dark:border-slate-700">
                        <div className="flex gap-4 mb-1.5 flex-wrap">
                          <span className="text-slate-500">ID: <span className="font-semibold text-slate-700 dark:text-slate-300">{record.id}</span></span>
                          <span className="text-slate-500">Name: <span className="font-semibold text-slate-700 dark:text-slate-300">{record.name}</span></span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {record.uberDriverId && (
                            <span className="font-mono text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded">Uber: {record.uberDriverId.substring(0, 16)}...</span>
                          )}
                          {record.inDriveDriverId && (
                            <span className="font-mono text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-1.5 py-0.5 rounded">InDrive: {record.inDriveDriverId.substring(0, 16)}...</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Raw JSON (collapsible) */}
            <details className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl">
              <summary className="px-5 py-3 text-sm font-medium text-slate-600 dark:text-slate-400 cursor-pointer hover:text-slate-900 dark:hover:text-white">
                Raw JSON Response
              </summary>
              <pre className="px-5 pb-4 text-xs text-slate-600 dark:text-slate-400 overflow-x-auto whitespace-pre-wrap font-mono">
                {JSON.stringify(repairResult, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color, subtitle }: { label: string; value: number; color: string; subtitle?: string }) {
  const colorMap: Record<string, string> = {
    green: 'text-green-700 dark:text-green-400',
    blue: 'text-blue-700 dark:text-blue-400',
    red: 'text-red-700 dark:text-red-400',
    purple: 'text-purple-700 dark:text-purple-400',
    amber: 'text-amber-700 dark:text-amber-400',
    slate: 'text-slate-700 dark:text-slate-300',
  };
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
      <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">{label}</div>
      <div className={`text-xl font-bold ${colorMap[color] || colorMap.slate}`}>{value.toLocaleString()}</div>
      {subtitle && <div className="text-xs text-slate-400 mt-0.5">{subtitle}</div>}
    </div>
  );
}

function formatSkipReason(reason: string): string {
  const map: Record<string, string> = {
    notCompleted: 'Trip not completed',
    zeroAmount: 'Zero or missing amount',
    noDriverId: 'No driver ID on trip',
    alreadyHasLedger: 'Already has ledger entries (dedup)',
    filteredOut: 'Filtered out by driver ID',
  };
  return map[reason] || reason;
}