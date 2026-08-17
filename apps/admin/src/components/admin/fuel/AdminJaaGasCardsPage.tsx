/**
 * Platform Admin — JAA Gas Cards: programs, org-scoped cards, master CSV fan-out, unmatched queue.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CreditCard, Upload, Building2, AlertCircle, Loader2, CheckCircle2, Trash2, Link2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../ui/alert-dialog';
import {
  AdminJaaCsvImportWizard,
  type JaaCsvImportPreview,
  type JaaPreviewUnmatched,
} from './AdminJaaCsvImportWizard';
import { fuelService } from '../../../services/fuelService';
import { API_ENDPOINTS } from '../../../services/apiConfig';
import { supabase } from '../../../utils/supabase/client';
import { publicAnonKey } from '../../../utils/supabase/info';
import type {
  FuelCard,
  FuelEntry,
  JaaProgram,
  JaaUnmatchedRow,
  JaaCardType,
  JaaCsvImport,
} from '../../../types/fuel';
import {
  isJaaRawFuelCsv,
  processJaaRawFuelData,
  type ParsedRow,
} from '../../../utils/jaaRawFuelCsvParser';
import { findFuelCardByCode, normalizeFuelCardCode } from '../../../utils/fuelCardMatch';
import {
  buildJaaMatchUpdates,
  collectJaaStatementReceiptNumbers,
  isJaaStatementLedgerRow,
} from '../../../../../../packages/roam-shared/src/fuel/jaaFuelStatementMatcher';

type TabId = 'programs' | 'cards' | 'import' | 'matched' | 'unmatched';

type OrgOption = { id: string; name: string };

type MatchedCardSummary = {
  cardId: string;
  cardCode: string;
  organizationId?: string;
  rowCount: number;
  spend: number;
};

const JAA_PROVIDER = 'Jamaica Automobile Association (JAA) Advance';

function parseCsvText(text: string): { headers: string[]; rows: ParsedRow[] } {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { headers: [], rows: [] };
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    // Simple CSV split (JAA Raw is flat — no nested quotes in practice)
    const cols = lines[i].split(',');
    const row: ParsedRow = {};
    headers.forEach((h, idx) => {
      row[h] = (cols[idx] ?? '').trim().replace(/^"|"$/g, '');
    });
    rows.push(row);
  }
  return { headers, rows };
}

function hintJaaTypeFromCode(cardCode: string): JaaCardType {
  return /RN\d+/i.test(cardCode) ? 'rental' : 'driver_tied';
}

export function AdminJaaGasCardsPage() {
  const [tab, setTab] = useState<TabId>('programs');
  const [loading, setLoading] = useState(true);
  const [programs, setPrograms] = useState<JaaProgram[]>([]);
  const [cards, setCards] = useState<FuelCard[]>([]);
  const [unmatched, setUnmatched] = useState<JaaUnmatchedRow[]>([]);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [importing, setImporting] = useState(false);
  const [lastImportSummary, setLastImportSummary] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [matchedCards, setMatchedCards] = useState<MatchedCardSummary[]>([]);
  const [reprocessing, setReprocessing] = useState(false);
  const [csvImports, setCsvImports] = useState<JaaCsvImport[]>([]);
  const [untrackedImport, setUntrackedImport] = useState<{
    entryCount: number;
    unmatchedCount: number;
    hasData: boolean;
  } | null>(null);
  const [deletingImportId, setDeletingImportId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; label: string } | null>(null);
  const [importPreview, setImportPreview] = useState<JaaCsvImportPreview | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [matchingLogs, setMatchingLogs] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Program form
  const [progCode, setProgCode] = useState('00002920');
  const [progName, setProgName] = useState('Digital Goodys / Roam JAA');
  const [progMode, setProgMode] = useState<'roam_managed' | 'self_serve'>('roam_managed');
  const [progOrgId, setProgOrgId] = useState('');

  // Card form
  const [cardNumber, setCardNumber] = useState('');
  const [jaaType, setJaaType] = useState<JaaCardType>('rental');
  const [jaaCompanyCode, setJaaCompanyCode] = useState('00002920');
  const [savingCard, setSavingCard] = useState(false);

  const refreshMatched = useCallback(async (inventory: FuelCard[]) => {
    const entries = await fuelService.getFuelEntries({ limit: 5000 });
    const byCard = new Map<string, MatchedCardSummary>();
    for (const e of entries) {
      if (!isJaaStatementLedgerRow(e)) continue;
      const metaCode = normalizeFuelCardCode(String((e.metadata as any)?.jaaCardCode || ''));
      const byId = e.cardId ? inventory.find((c) => c.id === e.cardId) : undefined;
      const byCode = metaCode ? findFuelCardByCode(inventory, metaCode) : undefined;
      const card = byId || byCode;
      if (!card && !metaCode && !e.cardId) continue;
      const key = card?.id || metaCode || e.cardId || 'unknown';
      const prev = byCard.get(key) || {
        cardId: card?.id || e.cardId || key,
        cardCode: card?.cardNumber || metaCode || '—',
        organizationId: card?.organizationId || (e as any).organizationId,
        rowCount: 0,
        spend: 0,
      };
      prev.rowCount += 1;
      const kind = (e.metadata as any)?.jaaRowKind;
      if (kind !== 'fee' && kind !== 'declined' && (Number(e.amount) || 0) > 0) {
        prev.spend += Number(e.amount) || 0;
      }
      byCard.set(key, prev);
    }
    setMatchedCards([...byCard.values()].sort((a, b) => b.rowCount - a.rowCount));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: { session } }, programsData, unmatchedData] = await Promise.all([
        supabase.auth.getSession(),
        fuelService.getJaaPrograms(),
        fuelService.getJaaUnmatched('open'),
      ]);
      setPrograms(programsData);
      setUnmatched(unmatchedData);

      const token = session?.access_token || publicAnonKey;
      const custRes = await fetch(`${API_ENDPOINTS.admin}/admin/customers?productLine=fleet`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (custRes.ok) {
        const body = await custRes.json();
        const list = Array.isArray(body) ? body : body.customers || body.data || [];
        setOrgs(
          list
            .map((c: any) => ({
              id: c.organizationId || c.id,
              name: c.organizationName || c.name || c.companyName || c.email || c.id,
            }))
            .filter((o: OrgOption) => o.id),
        );
      }

      const allCards = await fuelService.getFuelCards(selectedOrgId || undefined);
      setCards(allCards);

      // One-shot heal: statement rows wrongly held without GPS → fuel_entry
      try {
        const healed = await fuelService.promoteJaaGateHeld();
        if (healed.promoted > 0) {
          toast.success(
            `Recovered ${healed.promoted} statement row(s) into card transactions (cleared ${healed.deletedDupes} held dupes).`,
          );
        }
      } catch (he) {
        console.warn('[JAA] promote gate-held skipped', he);
      }

      await refreshMatched(await fuelService.getFuelCards());

      try {
        const importPayload = await fuelService.getJaaCsvImports();
        setCsvImports(importPayload.imports || []);
        setUntrackedImport(importPayload.untracked || null);
      } catch (ie) {
        console.warn('[JAA] csv imports load failed', ie);
        setCsvImports([]);
        setUntrackedImport(null);
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to load JAA gas card data');
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, refreshMatched]);

  useEffect(() => {
    load();
  }, [load]);

  const roamPrograms = useMemo(
    () => programs.filter((p) => p.mode === 'roam_managed'),
    [programs],
  );

  const handleSaveProgram = async () => {
    try {
      const code = progCode.replace(/\D/g, '');
      if (!code) {
        toast.error('Company code required');
        return;
      }
      if (progMode === 'self_serve' && !progOrgId) {
        toast.error('Pick the fleet customer for self-serve');
        return;
      }
      await fuelService.saveJaaProgram({
        companyCode: code,
        displayName: progName,
        mode: progMode,
        organizationId: progMode === 'self_serve' ? progOrgId : null,
      });
      toast.success('JAA program saved');
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Save failed');
    }
  };

  const handleSaveCard = async () => {
    if (!selectedOrgId) {
      toast.error('Select a customer organization first');
      return;
    }
    if (!cardNumber.trim()) {
      toast.error('Card code required');
      return;
    }
    setSavingCard(true);
    try {
      await fuelService.saveFuelCard({
        id: crypto.randomUUID(),
        provider: JAA_PROVIDER,
        cardNumber: cardNumber.trim(),
        status: 'Active',
        organizationId: selectedOrgId,
        jaaCompanyCode: jaaCompanyCode.replace(/\D/g, ''),
        jaaCardType: jaaType,
      });
      toast.success('Card issued to customer');
      setCardNumber('');
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save card');
    } finally {
      setSavingCard(false);
    }
  };

  /** Parse CSV only — nothing saved until wizard Submit. */
  const handleCsvUpload = async (file: File) => {
    setImporting(true);
    setLastImportSummary(null);
    setImportError(null);
    setSelectedFileName(file.name);
    try {
      toast.message(`Reading ${file.name}…`);
      const text = await file.text();
      const { headers, rows } = parseCsvText(text);
      if (!isJaaRawFuelCsv(headers)) {
        const msg = 'Not a JAA Raw CSV (need CARD_CODE, TRANS_DATE, AMOUNT columns).';
        setImportError(msg);
        toast.error(msg);
        return;
      }

      const knownCodes = new Set(programs.map((p) => p.companyCode.replace(/\D/g, '')));
      const companyCodesInFile = new Set(
        rows
          .map((r) => String(r.COMPANY_CODE || '').replace(/\D/g, ''))
          .filter(Boolean),
      );
      const unknownPrograms = [...companyCodesInFile].filter((c) => !knownCodes.has(c));
      if (unknownPrograms.length) {
        toast.warning(
          `Unknown COMPANY_CODE(s): ${unknownPrograms.join(', ')}. Register programs first — rows still routed by CARD_CODE where possible.`,
        );
      }

      const inventory = await fuelService.getFuelCards();
      const existing = await fuelService.getFuelEntries({ limit: 5000 });
      // Only statement ledger receipts block re-import — matched driver logs keep
      // jaaReceiptNumber but must not hide Card Inventory rows after CSV delete.
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
      console.error(e);
      const msg = e?.message || 'Failed to read CSV';
      setImportError(msg);
      toast.error(msg);
    } finally {
      setImporting(false);
    }
  };

  const submitImportFromWizard = async (payload: {
    matchedEntries: JaaCsvImportPreview['matchedEntries'];
    unmatchedRows: JaaPreviewUnmatched[];
  }) => {
    if (!importPreview) return;
    setImporting(true);
    const importId = crypto.randomUUID();
    try {
      let saved = 0;
      let failed = 0;
      let lastFail = '';
      const savedEntries: FuelEntry[] = [];
      for (const entry of payload.matchedEntries) {
        try {
          entry.metadata = {
            ...(entry.metadata || {}),
            jaaImportId: importId,
          };
          const persisted = await fuelService.saveFuelEntry(entry);
          savedEntries.push(persisted);
          saved++;
        } catch (err: any) {
          failed++;
          lastFail = err?.message || 'Save failed';
          console.error('[JAA Import] saveFuelEntry failed', err);
        }
      }

      if (payload.unmatchedRows.length) {
        await fuelService.saveJaaUnmatched(
          payload.unmatchedRows.map((r) => ({ ...r, importId })),
        );
      }

      const fuel = payload.matchedEntries.filter(
        (e) => (e.metadata as any)?.jaaRowKind === 'approved_fuel',
      ).length;
      const dropped =
        importPreview.unmatchedRows.length - payload.unmatchedRows.length;

      // Close the wizard as soon as the CSV is in — matching must not trap the overlay.
      setWizardOpen(false);
      setImportPreview(null);
      setImporting(false);
      if (payload.unmatchedRows.length) setTab('unmatched');
      else if (saved) setTab('matched');
      if (failed && !saved) {
        setImportError(lastFail || 'All row saves failed — check console / auth.');
        toast.error(lastFail || 'Import failed to save any rows');
      } else if (saved) {
        toast.success(`Saved ${saved} statement row(s). Matching driver logs…`);
      }

      let matchResult = {
        matched: 0,
        unmatchedStatement: 0,
        ambiguous: 0,
        unmatchedDriver: 0,
      };
      try {
        matchResult = await runJaaGasCardMatch();
      } catch (matchErr) {
        console.error('[JAA Import] match step failed', matchErr);
        toast.error(matchErr instanceof Error ? matchErr.message : 'Statement saved, but log matching failed');
      }

      const summary =
        `Parsed ${importPreview.parsedRows} rows · saved ${saved}` +
        (failed ? ` · ${failed} failed` : '') +
        ` · fuel ${fuel} · fees/other ${Math.max(0, payload.matchedEntries.length - fuel)}` +
        ` · auto-matched ${matchResult.matched}` +
        ` · unmatched fuel ${matchResult.unmatchedStatement}` +
        (matchResult.ambiguous ? ` · ambiguous ${matchResult.ambiguous}` : '') +
        ` · duplicates skipped ${importPreview.skippedDuplicates}` +
        ` · unmatched queued ${payload.unmatchedRows.length}` +
        (dropped ? ` · unmatched dropped ${dropped}` : '') +
        '.';

      await fuelService.saveJaaCsvImport({
        id: importId,
        fileName: importPreview.fileName,
        uploadedAt: new Date().toISOString(),
        parsedRows: importPreview.parsedRows,
        savedEntries: saved,
        unmatchedCount: payload.unmatchedRows.length,
        skippedDuplicates: importPreview.skippedDuplicates,
        failedSaves: failed,
        summary,
        status: failed && !saved ? 'failed' : 'completed',
      });

      setLastImportSummary(summary);
      if (saved && matchResult.matched > 0) toast.success(summary);
      else if (saved) toast.message(summary);
      await load();
    } catch (e: any) {
      console.error(e);
      const msg = e?.message || 'Import failed';
      setImportError(msg);
      toast.error(msg);
    } finally {
      setImporting(false);
    }
  };

  /** Enrich driver Gas Card logs from unlinked statement ledger rows. */
  const runJaaGasCardMatch = async (statementScope?: FuelEntry[]) => {
    const [all, inventory] = await Promise.all([
      fuelService.getFuelEntries({ limit: 5000 }),
      fuelService.getFuelCards().catch(() => [] as FuelCard[]),
    ]);
    const statements =
      statementScope && statementScope.length
        ? statementScope.filter(isJaaStatementLedgerRow)
        : all.filter(isJaaStatementLedgerRow);
    const { updates, summary } = buildJaaMatchUpdates(statements, all, inventory);
    for (const entry of updates) {
      try {
        await fuelService.saveFuelEntry({
          ...entry,
          bypassSignatureCheck: true,
        } as FuelEntry);
      } catch (err) {
        console.error('[JAA match] save failed', entry.id, err);
      }
    }
    return summary;
  };

  const matchPendingDriverLogs = async () => {
    setMatchingLogs(true);
    try {
      const summary = await runJaaGasCardMatch();
      const msg =
        `Matched ${summary.matched} · unmatched fuel ${summary.unmatchedStatement}` +
        (summary.ambiguous ? ` · ambiguous ${summary.ambiguous}` : '');
      setLastImportSummary(msg);
      if (summary.matched > 0) toast.success(msg);
      else toast.message(msg || 'No new matches');
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Match failed');
    } finally {
      setMatchingLogs(false);
    }
  };

  const deleteCsvImport = async (id: string) => {
    setDeletingImportId(id);
    try {
      const result =
        id === '__untracked__'
          ? await fuelService.deleteUntrackedJaaCsvData()
          : await fuelService.deleteJaaCsvImport(id);
      toast.success(
        `Removed ${result.entriesDeleted} statement row(s) and ${result.unmatchedDeleted} unmatched item(s). Cards kept.`,
      );
      setLastImportSummary(null);
      setPendingDelete(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Delete failed');
    } finally {
      setDeletingImportId(null);
    }
  };

  /** Import open unmatched rows when those CARD_CODEs already exist in inventory. */
  const reprocessUnmatchedAgainstInventory = async () => {
    setReprocessing(true);
    try {
      const open = await fuelService.getJaaUnmatched('open');
      if (!open.length) {
        toast.message('No open unmatched rows');
        return;
      }
      const inventory = await fuelService.getFuelCards();
      const existing = await fuelService.getFuelEntries({ limit: 5000 });
      const receiptSet = collectJaaStatementReceiptNumbers(existing);

      const syntheticRows: ParsedRow[] = open.map((r) => ({
        CARD_CODE: r.cardCode,
        COMPANY_CODE: r.companyCode,
        RECEIPT_NUMBER: r.receiptNumber,
        AMOUNT: String(r.amount),
        TRANS_DATE: r.transDate || '',
        VENDOR_NAME: r.vendor || '',
        FUEL_TYPE: r.fuelType || '',
        DISPLAY_FUEL_AMOUNT: String(r.fuelAmount || 0),
        DISPLAY_FUEL_QUANTITY: String(r.liters || 0),
        RESPONSE: r.response || 'APPROVAL',
      }));

      const processed = processJaaRawFuelData(syntheticRows, inventory, receiptSet, {
        requireCardMatch: true,
      });

      let saved = 0;
      for (const entry of processed.entries) {
        const code = normalizeFuelCardCode(String((entry.metadata as any)?.jaaCardCode || ''));
        const card =
          (entry.cardId && inventory.find((c) => c.id === entry.cardId)) ||
          findFuelCardByCode(inventory, code);
        if (card) {
          entry.cardId = card.id;
          if (card.organizationId) (entry as any).organizationId = card.organizationId;
        }
        // Preserve original upload id from unmatched so CSV delete still rolls back
        const source = open.find(
          (r) =>
            normalizeFuelCardCode(r.cardCode) === code &&
            String(r.receiptNumber || '').toUpperCase() ===
              String((entry.metadata as any)?.jaaReceiptNumber || '').toUpperCase(),
        );
        if (source?.importId) {
          entry.metadata = { ...(entry.metadata || {}), jaaImportId: source.importId };
        }
        await fuelService.saveFuelEntry(entry);
        saved++;
      }

      // Close unmatched rows whose code now has an inventory card
      let resolved = 0;
      for (const r of open) {
        const card = findFuelCardByCode(inventory, r.cardCode);
        if (!card) continue;
        await fuelService.patchJaaUnmatched(r.id, {
          status: 'resolved',
          resolvedCardId: card.id,
          resolvedOrganizationId: card.organizationId,
        });
        resolved++;
      }

      toast.success(
        `Retry complete: imported ${saved} row(s), closed ${resolved} unmatched.`,
      );
      if (saved) {
        const match = await runJaaGasCardMatch();
        if (match.matched > 0) {
          toast.success(`Auto-matched ${match.matched} driver log(s)`);
        }
        setTab('matched');
      }
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Retry failed');
    } finally {
      setReprocessing(false);
    }
  };

  const createCardFromUnmatched = async (row: JaaUnmatchedRow) => {
    if (!selectedOrgId) {
      toast.error('Select a customer org (Cards tab) before resolving unmatched rows');
      setTab('cards');
      return;
    }
    try {
      const card = await fuelService.saveFuelCard({
        id: crypto.randomUUID(),
        provider: JAA_PROVIDER,
        cardNumber: row.cardCode,
        status: 'Active',
        organizationId: selectedOrgId,
        jaaCompanyCode: row.companyCode || jaaCompanyCode.replace(/\D/g, ''),
        jaaCardType: hintJaaTypeFromCode(row.cardCode),
      });

      // Reprocess open unmatched for this card code
      const open = await fuelService.getJaaUnmatched('open');
      const sameCode = open.filter(
        (r) => r.cardCode.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() ===
          row.cardCode.replace(/[^a-zA-Z0-9]/g, '').toUpperCase(),
      );
      const syntheticRows: ParsedRow[] = sameCode.map((r) => ({
        CARD_CODE: r.cardCode,
        COMPANY_CODE: r.companyCode,
        RECEIPT_NUMBER: r.receiptNumber,
        AMOUNT: String(r.amount),
        TRANS_DATE: r.transDate || '',
        VENDOR_NAME: r.vendor || '',
        FUEL_TYPE: r.fuelType || '',
        DISPLAY_FUEL_AMOUNT: String(r.fuelAmount || 0),
        DISPLAY_FUEL_QUANTITY: String(r.liters || 0),
        RESPONSE: r.response || 'APPROVAL',
      }));
      const inventory = await fuelService.getFuelCards();
      const processed = processJaaRawFuelData(syntheticRows, inventory, new Set(), {
        requireCardMatch: true,
      });
      for (const entry of processed.entries) {
        if (card.organizationId) (entry as any).organizationId = card.organizationId;
        entry.cardId = card.id;
        if (row.importId) {
          entry.metadata = { ...(entry.metadata || {}), jaaImportId: row.importId };
        }
        await fuelService.saveFuelEntry(entry);
      }
      for (const r of sameCode) {
        await fuelService.patchJaaUnmatched(r.id, {
          status: 'resolved',
          resolvedCardId: card.id,
          resolvedOrganizationId: selectedOrgId,
        });
      }
      toast.success(`Card created and ${processed.entries.length} statement row(s) imported`);
      if (processed.entries.length) {
        const match = await runJaaGasCardMatch();
        if (match.matched > 0) {
          toast.success(`Auto-matched ${match.matched} driver log(s)`);
        }
      }
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Resolve failed');
    }
  };

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'programs', label: 'Programs', icon: <Building2 className="h-4 w-4" /> },
    { id: 'cards', label: 'Cards', icon: <CreditCard className="h-4 w-4" /> },
    { id: 'import', label: 'CSV Import', icon: <Upload className="h-4 w-4" /> },
    {
      id: 'matched',
      label: `Matched (${matchedCards.length})`,
      icon: <CheckCircle2 className="h-4 w-4" />,
    },
    { id: 'unmatched', label: `Unmatched (${unmatched.length})`, icon: <AlertCircle className="h-4 w-4" /> },
  ];

  if (loading && !programs.length) {
    return <div className="p-6 text-slate-500">Loading JAA gas cards…</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">JAA Gas Cards</h1>
        <p className="text-sm text-slate-500 mt-1">
          Roam-managed programs, issue cards to customers, upload the master Raw CSV, and clear unmatched codes.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md ${
              tab === t.id
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'programs' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3 rounded-lg border border-slate-200 p-4 bg-white">
            <h2 className="font-medium">Register JAA company code</h2>
            <label className="block text-xs text-slate-500">Company code</label>
            <input
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={progCode}
              onChange={(e) => setProgCode(e.target.value)}
              placeholder="00002920"
            />
            <label className="block text-xs text-slate-500">Display name</label>
            <input
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={progName}
              onChange={(e) => setProgName(e.target.value)}
            />
            <label className="block text-xs text-slate-500">Mode</label>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={progMode}
              onChange={(e) => setProgMode(e.target.value as 'roam_managed' | 'self_serve')}
            >
              <option value="roam_managed">Roam-managed (you upload CSV)</option>
              <option value="self_serve">Self-serve (customer uploads CSV)</option>
            </select>
            {progMode === 'self_serve' && (
              <>
                <label className="block text-xs text-slate-500">Fleet customer</label>
                <select
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  value={progOrgId}
                  onChange={(e) => setProgOrgId(e.target.value)}
                >
                  <option value="">Select org…</option>
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </>
            )}
            <button
              type="button"
              onClick={handleSaveProgram}
              className="bg-slate-900 text-white text-sm px-4 py-2 rounded-md"
            >
              Save program
            </button>
          </div>
          <div className="rounded-lg border border-slate-200 p-4 bg-white">
            <h2 className="font-medium mb-3">Registered programs</h2>
            {programs.length === 0 ? (
              <p className="text-sm text-slate-500">None yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {programs.map((p) => (
                  <li key={p.id} className="flex justify-between border-b border-slate-100 py-2">
                    <span>
                      <span className="font-mono">{p.companyCode}</span> — {p.displayName}
                    </span>
                    <span className="text-slate-500">
                      {p.mode === 'roam_managed' ? 'Roam-managed' : 'Self-serve'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === 'cards' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Customer organization</label>
              <select
                className="border rounded-md px-3 py-2 text-sm min-w-[220px]"
                value={selectedOrgId}
                onChange={(e) => setSelectedOrgId(e.target.value)}
              >
                <option value="">All / pick to issue…</option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
            {roamPrograms[0] && (
              <p className="text-xs text-slate-500 pb-2">
                Default Roam program: {roamPrograms[0].companyCode}
              </p>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-4 rounded-lg border border-slate-200 p-4 bg-white">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Card code (CARD_CODE)</label>
              <input
                className="w-full border rounded-md px-3 py-2 text-sm font-mono"
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
                placeholder="00002920RN2783"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">JAA company code</label>
              <input
                className="w-full border rounded-md px-3 py-2 text-sm font-mono"
                value={jaaCompanyCode}
                onChange={(e) => setJaaCompanyCode(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Type</label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={jaaType}
                onChange={(e) => setJaaType(e.target.value as JaaCardType)}
              >
                <option value="rental">Rental</option>
                <option value="driver_tied">Driver card</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="button"
                disabled={savingCard}
                onClick={handleSaveCard}
                className="bg-slate-900 text-white text-sm px-4 py-2 rounded-md w-full disabled:opacity-50"
              >
                Issue card
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2">Card code</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Company</th>
                  <th className="px-3 py-2">Org</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {cards
                  .filter((c) => !selectedOrgId || c.organizationId === selectedOrgId)
                  .map((c) => (
                    <tr key={c.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-mono">{c.cardNumber}</td>
                      <td className="px-3 py-2">{c.jaaCardType || '—'}</td>
                      <td className="px-3 py-2 font-mono">{c.jaaCompanyCode || '—'}</td>
                      <td className="px-3 py-2 text-xs">
                        {orgs.find((o) => o.id === c.organizationId)?.name || c.organizationId || '—'}
                      </td>
                      <td className="px-3 py-2">{c.status}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!cards.length && (
              <p className="p-4 text-slate-500 text-sm">No cards yet.</p>
            )}
          </div>
        </div>
      )}

      {tab === 'import' && (
        <div className="space-y-4 max-w-2xl">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Choose a JAA Raw CSV to open the review wizard. Matched rows go to customer cards;
            unmatched rows can be queued or dropped before anything is saved.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv,.CSV"
            className="hidden"
            disabled={importing}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleCsvUpload(f);
              e.target.value = '';
            }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={importing}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-amber-500 dark:text-slate-950 dark:hover:bg-amber-400"
            >
              {importing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {importing && !wizardOpen ? 'Reading…' : 'Choose CSV file'}
            </button>
            <button
              type="button"
              disabled={matchingLogs || importing}
              onClick={() => void matchPendingDriverLogs()}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            >
              {matchingLogs ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Link2 className="h-4 w-4" />
              )}
              Match pending logs
            </button>
            {selectedFileName && (
              <span className="text-sm text-slate-500 truncate max-w-[240px]">{selectedFileName}</span>
            )}
          </div>
          {importError && (
            <p className="text-sm bg-rose-50 text-rose-800 border border-rose-200 rounded-md p-3">
              {importError}
            </p>
          )}
          {lastImportSummary && (
            <p className="text-sm bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-md p-3">
              {lastImportSummary}
            </p>
          )}

          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-100 bg-slate-50">
              <h2 className="text-sm font-medium text-slate-800">Upload history</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Delete removes statement rows and unmatched queue items from that file. Cards stay.
              </p>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-white text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2">File</th>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Saved</th>
                  <th className="px-3 py-2">Unmatched</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {untrackedImport?.hasData && (
                  <tr className="border-t border-amber-100 bg-amber-50/40">
                    <td className="px-3 py-2">
                      <span className="font-medium">Earlier untracked upload(s)</span>
                      <span className="block text-xs text-amber-800">
                        {untrackedImport.entryCount} statement · {untrackedImport.unmatchedCount} unmatched
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">Before tracking</td>
                    <td className="px-3 py-2">{untrackedImport.entryCount}</td>
                    <td className="px-3 py-2">{untrackedImport.unmatchedCount}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        disabled={deletingImportId !== null}
                        onClick={() =>
                          setPendingDelete({
                            id: '__untracked__',
                            label: 'earlier untracked upload(s)',
                          })
                        }
                        className="inline-flex items-center gap-1 text-xs text-rose-700 hover:text-rose-900 disabled:opacity-50"
                      >
                        {deletingImportId === '__untracked__' ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        Delete data
                      </button>
                    </td>
                  </tr>
                )}
                {csvImports.map((imp) => (
                  <tr key={imp.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 truncate max-w-[200px]" title={imp.fileName}>
                      {imp.fileName}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">
                      {imp.uploadedAt
                        ? new Date(imp.uploadedAt).toLocaleString()
                        : '—'}
                    </td>
                    <td className="px-3 py-2">{imp.savedEntries}</td>
                    <td className="px-3 py-2">{imp.unmatchedCount}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        disabled={deletingImportId !== null}
                        onClick={() =>
                          setPendingDelete({ id: imp.id, label: imp.fileName })
                        }
                        className="inline-flex items-center gap-1 text-xs text-rose-700 hover:text-rose-900 disabled:opacity-50"
                      >
                        {deletingImportId === imp.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!csvImports.length && !untrackedImport?.hasData && (
              <p className="p-4 text-slate-500 text-sm">No uploads recorded yet.</p>
            )}
          </div>
        </div>
      )}

      {tab === 'matched' && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Statement rows that matched an inventory CARD_CODE — these should show on that customer’s Fleet Card Inventory.
          </p>
          <button
            type="button"
            disabled={matchingLogs}
            onClick={() => void matchPendingDriverLogs()}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            {matchingLogs ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Link2 className="h-4 w-4" />
            )}
            Match pending logs
          </button>
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2">Card code</th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Rows</th>
                  <th className="px-3 py-2">Fuel spend</th>
                </tr>
              </thead>
              <tbody>
                {matchedCards.map((m) => (
                  <tr key={m.cardId} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-mono">{m.cardCode}</td>
                    <td className="px-3 py-2 text-xs">
                      {orgs.find((o) => o.id === m.organizationId)?.name || m.organizationId || '—'}
                    </td>
                    <td className="px-3 py-2">{m.rowCount}</td>
                    <td className="px-3 py-2">${m.spend.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!matchedCards.length && (
              <p className="p-4 text-slate-500 text-sm">
                No matched statement rows yet. Issue cards that match the CSV CARD_CODE, then re-upload or use Retry on Unmatched.
              </p>
            )}
          </div>
        </div>
      )}

      {tab === 'unmatched' && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            These CARD_CODEs are not in inventory yet. Issue the card on Cards (or Create card &amp; import), then Retry if needed.
          </p>
          <div className="flex flex-wrap gap-2 items-center">
            <button
              type="button"
              disabled={reprocessing || !unmatched.length}
              onClick={() => void reprocessUnmatchedAgainstInventory()}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
            >
              {reprocessing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Retry against inventory
            </button>
            {!selectedOrgId && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
                Tip: pick a customer on Cards before using Create card &amp; import.
              </p>
            )}
          </div>
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2">Card code</th>
                  <th className="px-3 py-2">Company</th>
                  <th className="px-3 py-2">Receipt</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {unmatched.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-mono">{r.cardCode}</td>
                    <td className="px-3 py-2 font-mono">{r.companyCode}</td>
                    <td className="px-3 py-2 text-xs">{r.receiptNumber}</td>
                    <td className="px-3 py-2">${Number(r.amount).toFixed(2)}</td>
                    <td className="px-3 py-2 text-xs">{r.transDate || '—'}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        className="text-xs bg-slate-900 text-white px-2 py-1 rounded"
                        onClick={() => createCardFromUnmatched(r)}
                      >
                        Create card &amp; import
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!unmatched.length && (
              <p className="p-4 text-slate-500 text-sm">No unmatched rows.</p>
            )}
          </div>
        </div>
      )}

      <AdminJaaCsvImportWizard
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

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => {
          if (!open && !deletingImportId) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-rose-600" />
              Delete this CSV upload?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes all statement rows and unmatched items from{' '}
              <span className="font-medium text-slate-700">“{pendingDelete?.label}”</span>.
              Issued cards stay in inventory.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingImportId}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!!deletingImportId || !pendingDelete}
              className="bg-rose-600 hover:bg-rose-700 focus:ring-rose-600"
              onClick={(e) => {
                e.preventDefault();
                if (pendingDelete) void deleteCsvImport(pendingDelete.id);
              }}
            >
              {deletingImportId ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                'Delete data'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
