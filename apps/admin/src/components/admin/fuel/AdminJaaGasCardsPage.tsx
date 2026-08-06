/**
 * Platform Admin — JAA Gas Cards: programs, org-scoped cards, master CSV fan-out, unmatched queue.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CreditCard, Upload, Building2, AlertCircle } from 'lucide-react';
import { fuelService } from '../../../services/fuelService';
import { API_ENDPOINTS } from '../../../services/apiConfig';
import { supabase } from '../../../utils/supabase/client';
import { publicAnonKey } from '../../../utils/supabase/info';
import type { FuelCard, JaaProgram, JaaUnmatchedRow, JaaCardType } from '../../../types/fuel';
import {
  isJaaRawFuelCsv,
  processJaaRawFuelData,
  type ParsedRow,
} from '../../../utils/jaaRawFuelCsvParser';

type TabId = 'programs' | 'cards' | 'import' | 'unmatched';

type OrgOption = { id: string; name: string };

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
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to load JAA gas card data');
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId]);

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

  const handleCsvUpload = async (file: File) => {
    setImporting(true);
    setLastImportSummary(null);
    try {
      const text = await file.text();
      const { headers, rows } = parseCsvText(text);
      if (!isJaaRawFuelCsv(headers)) {
        toast.error('Not a JAA Raw CSV (need CARD_CODE, TRANS_DATE, AMOUNT)');
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

      const inventory = await fuelService.getFuelCards(); // all orgs (platform)
      const existing = await fuelService.getFuelEntries({ limit: 5000 });
      const receiptSet = new Set(
        existing
          .map((e) => String((e.metadata as any)?.jaaReceiptNumber || '').toUpperCase())
          .filter(Boolean),
      );

      const result = processJaaRawFuelData(rows, inventory, receiptSet, {
        requireCardMatch: true,
      });

      let saved = 0;
      for (const entry of result.entries) {
        await fuelService.saveFuelEntry(entry);
        saved++;
      }

      if (result.unmatchedRows.length) {
        await fuelService.saveJaaUnmatched(result.unmatchedRows);
      }

      const fees = result.entries.filter((e) => (e.metadata as any)?.jaaRowKind === 'fee').length;
      const fuel = result.entries.filter((e) => (e.metadata as any)?.jaaRowKind === 'approved_fuel').length;
      const summary =
        `Saved ${saved} (fuel ${fuel}, fees/other ${fees - (saved - fuel - fees) || fees}). ` +
        `Duplicates skipped ${result.skippedDuplicates}. Unmatched ${result.unmatchedRows.length}.`;
      setLastImportSummary(summary);
      toast.success(summary);
      setTab('unmatched');
      await load();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Import failed');
    } finally {
      setImporting(false);
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
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Resolve failed');
    }
  };

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'programs', label: 'Programs', icon: <Building2 className="h-4 w-4" /> },
    { id: 'cards', label: 'Cards', icon: <CreditCard className="h-4 w-4" /> },
    { id: 'import', label: 'CSV Import', icon: <Upload className="h-4 w-4" /> },
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
        <div className="space-y-4 max-w-xl">
          <p className="text-sm text-slate-600">
            Upload the JAA Raw CSV. Rows match inventory by CARD_CODE and land in that card’s customer org.
            Unknown codes go to Unmatched.
          </p>
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={importing}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleCsvUpload(f);
              e.target.value = '';
            }}
          />
          {importing && <p className="text-sm text-slate-500">Importing…</p>}
          {lastImportSummary && (
            <p className="text-sm bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-md p-3">
              {lastImportSummary}
            </p>
          )}
        </div>
      )}

      {tab === 'unmatched' && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Select the customer on the Cards tab, then create a card from a row to import its pending receipts.
          </p>
          {!selectedOrgId && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
              Tip: pick a customer organization on the Cards tab before resolving.
            </p>
          )}
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
    </div>
  );
}
