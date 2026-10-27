// Stitch: dominion-redesign/f213ca85e6014903b9a070adf73b86ba
/**
 * Dominion — JAA card catalogue (platform). Fleet org UI lives in GasCardsOrgView.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Upload } from 'lucide-react';
import {
  JaaCsvImportWizard,
  type JaaCsvImportPreview,
  type JaaPreviewUnmatched,
} from './JaaCsvImportWizard';
import {
  fleetCustomerOpsApi,
  type JaaProgram,
} from '../services/fleetCustomerOpsApi';
import type { FuelEntry } from '../types/fuel';
import {
  isJaaRawFuelCsv,
  processJaaRawFuelData,
  type ParsedRow,
} from './jaaRawFuelCsvParser';
import { findFuelCardByCode, normalizeFuelCardCode } from './fuelCardMatch';
import { collectJaaStatementReceiptNumbers } from '@roam/roam-shared';
import { GasCardsOrgView } from './GasCardsOrgView';

type GasCardScope = 'platform' | 'org';
type PlatformPane = 'catalogue' | 'import';

function parseCsvText(text: string): { headers: string[]; rows: ParsedRow[] } {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { headers: [], rows: [] };
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const row: ParsedRow = {};
    headers.forEach((h, idx) => {
      row[h] = (cols[idx] ?? '').trim().replace(/^"|"$/g, '');
    });
    rows.push(row);
  }
  return { headers, rows };
}

function GasCardsPlatformView() {
  const [pane, setPane] = useState<PlatformPane>('catalogue');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [programs, setPrograms] = useState<JaaProgram[]>([]);
  const [importing, setImporting] = useState(false);
  const [lastImportSummary, setLastImportSummary] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<JaaCsvImportPreview | null>(null);
  const [progCode, setProgCode] = useState('');
  const [progName, setProgName] = useState('');
  const [progMode, setProgMode] = useState<'roam_managed' | 'self_serve'>('roam_managed');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const programsData = await fleetCustomerOpsApi.getJaaPrograms();
      setPrograms(programsData);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load programs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSaveProgram = async () => {
    const companyCode = progCode.replace(/\D/g, '');
    if (!companyCode) {
      toast.error('Enter a company code');
      return;
    }
    try {
      await fleetCustomerOpsApi.saveJaaProgram({
        companyCode,
        displayName: progName || companyCode,
        mode: progMode,
      });
      toast.success('Program saved');
      setProgCode('');
      setProgName('');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    }
  };

  const handleCsvUpload = async (file: File) => {
    setImporting(true);
    setLastImportSummary(null);
    setImportError(null);
    setSelectedFileName(file.name);
    try {
      const text = await file.text();
      const { headers, rows } = parseCsvText(text);
      if (!isJaaRawFuelCsv(headers)) {
        const msg = 'Not a JAA Raw CSV (need CARD_CODE, TRANS_DATE, AMOUNT columns).';
        setImportError(msg);
        toast.error(msg);
        return;
      }

      const inventory = await fleetCustomerOpsApi.getFuelCards();
      const existing = await fleetCustomerOpsApi.getFuelEntriesForJaaMatch(5000);
      const receiptSet = collectJaaStatementReceiptNumbers(existing);
      const result = processJaaRawFuelData(rows, inventory, receiptSet, {
        requireCardMatch: true,
      });

      for (const entry of result.entries) {
        const code = normalizeFuelCardCode(String((entry.metadata as any)?.jaaCardCode || ''));
        const card =
          (entry.cardId && inventory.find((c) => c.id === entry.cardId)) ||
          findFuelCardByCode(inventory, code);
        if (card) {
          entry.cardId = card.id;
          if (card.organizationId) (entry as any).organizationId = card.organizationId;
        }
      }

      setImportPreview({
        fileName: file.name,
        parsedRows: rows.length,
        skippedDuplicates: result.skippedDuplicates,
        matchedEntries: result.entries,
        unmatchedRows: result.unmatchedRows,
      });
      setWizardOpen(true);
    } catch (e: any) {
      const msg = e?.message || 'Failed to read CSV';
      setImportError(msg);
      toast.error(msg);
    } finally {
      setImporting(false);
    }
  };

  const submitImportFromWizard = async (payload: {
    matchedEntries: FuelEntry[];
    unmatchedRows: JaaPreviewUnmatched[];
  }) => {
    if (!importPreview) return;
    setImporting(true);
    const importId = crypto.randomUUID();
    try {
      await fleetCustomerOpsApi.saveJaaCsvImport({
        id: importId,
        fileName: importPreview.fileName,
        uploadedAt: new Date().toISOString(),
        parsedRows: importPreview.parsedRows,
        savedEntries: 0,
        unmatchedCount: 0,
        skippedDuplicates: importPreview.skippedDuplicates,
        failedSaves: 0,
        status: 'in_progress',
      });
      let saved = 0;
      for (const entry of payload.matchedEntries) {
        try {
          entry.metadata = { ...(entry.metadata || {}), jaaImportId: importId };
          await fleetCustomerOpsApi.saveFuelEntry(entry);
          saved++;
        } catch {
          /* continue */
        }
      }
      if (payload.unmatchedRows.length) {
        await fleetCustomerOpsApi.saveJaaUnmatched(
          payload.unmatchedRows.map((r) => ({ ...r, importId })),
        );
      }
      setWizardOpen(false);
      setImportPreview(null);
      setLastImportSummary(`Saved ${saved} statement row(s).`);
      toast.success(`Saved ${saved} statement row(s).`);
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  if (loading && !programs.length) {
    return (
      <div className="flex h-[320px] items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (loadError && !programs.length) {
    return (
      <div className="p-8">
        <h1 className="text-xl font-semibold text-slate-900">JAA card catalogue</h1>
        <p className="mt-2 text-sm text-slate-600">{loadError}</p>
        <button type="button" className="mt-4 text-sm font-medium underline" onClick={() => void load()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl w-full space-y-6 p-8 text-slate-900">
      <div className="mb-4 flex items-center justify-between">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
          <span>Dominion</span>
          <span aria-hidden>›</span>
          <span>Master data</span>
          <span aria-hidden>›</span>
          <span>Fuel</span>
          <span aria-hidden>›</span>
          <span className="font-semibold text-slate-900">JAA card catalogue</span>
        </nav>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 font-mono text-[10px] text-slate-600">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          REGION: JM-KGN
        </div>
      </div>

      <div className="mb-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold leading-tight tracking-tight text-slate-900">JAA card catalogue</h1>
          <p className="mt-1 text-xs leading-normal text-slate-500">Platform gas-card programs.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPane('catalogue')}
            className={
              pane === 'catalogue'
                ? 'rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white'
                : 'rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700'
            }
          >
            Catalogue
          </button>
          <button
            type="button"
            onClick={() => setPane('import')}
            className={
              pane === 'import'
                ? 'inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white'
                : 'inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700'
            }
          >
            <Upload className="h-3.5 w-3.5" aria-hidden />
            Master CSV
          </button>
        </div>
      </div>

      {pane === 'catalogue' ? (
        <>
          <div className="mb-6 overflow-hidden rounded-[12px] border border-slate-200/90 bg-white shadow-sm">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/60 font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  <th className="px-6 py-3.5">Program</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Cards in master list</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {programs.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-6 py-8 text-center italic text-slate-400">
                      The data is not in yet.
                    </td>
                  </tr>
                ) : (
                  programs.map((program) => (
                    <tr key={program.id || program.companyCode} className="transition-colors hover:bg-slate-50/50">
                      <td className="px-6 py-4 font-medium text-slate-900">
                        {program.displayName || program.companyCode || 'JAA'}
                        <div className="font-mono text-[11px] text-slate-400">{program.companyCode}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          Active
                        </span>
                      </td>
                      <td className="px-6 py-4 font-mono text-[11px] italic text-slate-400">
                        The data is not in yet.
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-3 rounded-[12px] border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-slate-900">Register program</h2>
              <label className="block text-xs text-slate-500">Company code</label>
              <input
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                value={progCode}
                onChange={(e) => setProgCode(e.target.value)}
                placeholder="00002920"
              />
              <label className="block text-xs text-slate-500">Display name</label>
              <input
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                value={progName}
                onChange={(e) => setProgName(e.target.value)}
              />
              <label className="block text-xs text-slate-500">Mode</label>
              <select
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                value={progMode}
                onChange={(e) => setProgMode(e.target.value as 'roam_managed' | 'self_serve')}
              >
                <option value="roam_managed">Roam-managed (you upload CSV)</option>
                <option value="self_serve">Self-serve (customer uploads CSV)</option>
              </select>
              <button
                type="button"
                onClick={() => void handleSaveProgram()}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white"
              >
                Save program
              </button>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600 shadow-sm">
              <span>Customer cards stay in Fleet admin.</span>
              <span className="font-mono text-[11px] text-slate-400">FLEET-ADMIN-ISO</span>
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-4 rounded-[12px] border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-slate-900">Master CSV</h2>
          <p className="text-xs text-slate-500">
            Upload the JAA master list. Rows fan out to org cards by company code.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="block w-full text-sm text-slate-600"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleCsvUpload(file);
            }}
          />
          {selectedFileName ? (
            <p className="font-mono text-[11px] text-slate-500">Selected: {selectedFileName}</p>
          ) : null}
          {importing && !wizardOpen ? (
            <p className="inline-flex items-center gap-2 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" /> Reading…
            </p>
          ) : null}
          {importError ? <p className="text-sm text-red-600">{importError}</p> : null}
          {lastImportSummary ? <p className="text-sm text-emerald-700">{lastImportSummary}</p> : null}
        </div>
      )}

      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500 shadow-sm">
        <span className="italic">The data is not in yet.</span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
          LOC: KINGSTON / PARISH REGISTRY JMD
        </span>
      </div>

      <JaaCsvImportWizard
        open={wizardOpen}
        preview={importPreview}
        submitting={importing && wizardOpen}
        onOpenChange={(open) => {
          if (!open && importing) return;
          setWizardOpen(open);
          if (!open) setImportPreview(null);
        }}
        onSubmit={(payload) => void submitImportFromWizard(payload)}
      />
    </div>
  );
}

export function GasCardsPage({ scope = 'platform' }: { scope?: GasCardScope }) {
  if (scope === 'org') {
    return <GasCardsOrgView scope="org" />;
  }
  return <GasCardsPlatformView />;
}
