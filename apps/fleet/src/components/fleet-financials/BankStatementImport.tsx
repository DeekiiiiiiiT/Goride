/**
 * Client-parse bank CSV or Sagicor PDF → suggested matches → Accept writes fleet_bank_confirm only.
 */
import React, { useMemo, useState } from 'react';
import { format, parseISO, addDays } from 'date-fns';
import { Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { api } from '../../services/api';
import type { FleetBankReceiveRow } from '../../utils/fleetBankReceive';
import {
  parseCsvText,
  guessColumnMap,
  mapCsvRowsToLines,
  suggestBankMatches,
  type BankCsvColumnMap,
  type BankMatchSuggestion,
  type BankStatementLine,
} from '../../utils/bankStatementMatch';
import { parseSagicorBankPdf } from '../../utils/sagicorBankPdf';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog';
import { FleetBusyProvider, useFleetBusy } from '../shared/FleetBusyLock';
import { useLockedDialog } from '../shared/useLockedDialog';

const MONEY = (n: number) => {
  const body = Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${n < 0 ? '-' : ''}$${body}`;
};

/** Mon–Sun settlement period label from week-start Monday. */
function formatWeekPeriod(weekStartYmd: string): string {
  const start = parseISO(weekStartYmd);
  const end = addDays(start, 6);
  return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
}

type ImportSource = 'csv' | 'pdf' | null;
type PendingAccept = { mode: 'one'; suggestion: BankMatchSuggestion } | { mode: 'all' };

/** Manual match picker for a bank line the auto-matcher skipped. */
type PendingManualMatch = {
  line: BankStatementLine;
  weekStartYmd: string;
};

type Props = {
  expectedRows: FleetBankReceiveRow[];
  organizationId?: string | null;
  onConfirmed: () => void;
};

function daysBetweenYmd(aYmd: string, bYmd: string): number {
  const a = new Date(`${aYmd}T12:00:00`).getTime();
  const b = new Date(`${bYmd}T12:00:00`).getTime();
  return Math.abs(a - b) / (24 * 60 * 60 * 1000);
}

export function BankStatementImport(props: Props) {
  return (
    <FleetBusyProvider>
      <BankStatementImportInner {...props} />
    </FleetBusyProvider>
  );
}

function BankStatementImportInner({ expectedRows, organizationId, onConfirmed }: Props) {
  const { runExclusive, setMessage } = useFleetBusy();
  const [fileName, setFileName] = useState('');
  const [source, setSource] = useState<ImportSource>(null);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [pdfLines, setPdfLines] = useState<BankStatementLine[]>([]);
  const [pdfFormatLabel, setPdfFormatLabel] = useState('');
  const [hasHeader, setHasHeader] = useState(true);
  const [colMap, setColMap] = useState<BankCsvColumnMap>({ date: 0, amount: 1, description: 2 });
  const [suggestions, setSuggestions] = useState<BankMatchSuggestion[]>([]);
  const [unmatched, setUnmatched] = useState<BankStatementLine[]>([]);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [statementId, setStatementId] = useState<string | null>(null);
  const [pendingAccept, setPendingAccept] = useState<PendingAccept | null>(null);
  const [pendingManual, setPendingManual] = useState<PendingManualMatch | null>(null);
  const acceptOpen = !!pendingAccept;
  const {
    onOpenChange: lockedAcceptOpenChange,
    contentProps: lockedAcceptContentProps,
  } = useLockedDialog(acceptOpen, (open) => { if (!open) setPendingAccept(null); }, busy);

  const header = csvRows[0] || [];
  const colCount = header.length || 3;
  const colOptions = useMemo(
    () => Array.from({ length: colCount }, (_, i) => i),
    [colCount],
  );

  const hasImport = source === 'csv' ? csvRows.length > 0 : pdfLines.length > 0;

  /** Open weeks still available for manual match (not already in suggestions). */
  const openWeeksForManual = useMemo(() => {
    const claimed = new Set(suggestions.map((s) => s.target.weekStartYmd));
    return expectedRows
      .filter((r) => r.status === 'unconfirmed' && !claimed.has(r.weekStartYmd))
      .slice()
      .sort((a, b) => a.weekStartYmd.localeCompare(b.weekStartYmd));
  }, [expectedRows, suggestions]);

  const manualTarget = pendingManual
    ? openWeeksForManual.find((r) => r.weekStartYmd === pendingManual.weekStartYmd) ?? null
    : null;
  const manualVariance =
    pendingManual && manualTarget
      ? pendingManual.line.amount - manualTarget.expected
      : null;

  function resetMatchState() {
    setSuggestions([]);
    setUnmatched([]);
    setDismissed(new Set());
    setStatementId(null);
  }

  /** Clear loaded file so ops can upload the next statement. */
  function clearImport() {
    setFileName('');
    setSource(null);
    setCsvRows([]);
    setPdfLines([]);
    setPdfFormatLabel('');
    setPendingAccept(null);
    setPendingManual(null);
    resetMatchState();
  }

  function currentLines(): BankStatementLine[] {
    if (source === 'pdf') return pdfLines;
    if (source === 'csv' && csvRows.length > 0) return mapCsvRowsToLines(csvRows, colMap, hasHeader);
    return [];
  }

  function pickClosestWeek(line: BankStatementLine): string {
    if (openWeeksForManual.length === 0) return '';
    return [...openWeeksForManual].sort(
      (a, b) =>
        daysBetweenYmd(line.dateYmd, a.weekStartYmd) -
        daysBetweenYmd(line.dateYmd, b.weekStartYmd),
    )[0].weekStartYmd;
  }

  function openManualMatch(line: BankStatementLine) {
    if (openWeeksForManual.length === 0) {
      toast.error('No open Expected weeks in this date range — widen Week from/to or refresh');
      return;
    }
    setPendingManual({ line, weekStartYmd: pickClosestWeek(line) });
  }

  function applyMatch(lines: BankStatementLine[]) {
    if (lines.length === 0) {
      toast.error('No Uber deposit lines found to match');
      return;
    }
    const sug = suggestBankMatches(lines, expectedRows);
    const used = new Set(sug.map((s) => s.line.lineIndex));
    setSuggestions(sug);
    setUnmatched(lines.filter((l) => !used.has(l.lineIndex)));
    toast.message(`${sug.length} suggested · ${lines.length - sug.length} unmatched`);
  }

  async function onCsvFile(file: File | null) {
    if (!file) return;
    const text = await file.text();
    const rows = parseCsvText(text);
    if (rows.length === 0) {
      toast.error('CSV is empty');
      return;
    }
    setFileName(file.name);
    setSource('csv');
    setCsvRows(rows);
    setPdfLines([]);
    setPdfFormatLabel('');
    const guessed = guessColumnMap(rows[0]);
    setColMap(guessed);
    setHasHeader(true);
    resetMatchState();
  }

  async function onPdfFile(file: File | null) {
    if (!file) return;
    setParsing(true);
    try {
      const result = await parseSagicorBankPdf(file);
      if (result.lines.length === 0) {
        toast.error('No Uber (VISA) deposits found in this PDF');
        return;
      }
      setFileName(file.name);
      setSource('pdf');
      setPdfLines(result.lines);
      setCsvRows([]);
      const label =
        result.format === 'online_history'
          ? 'Sagicor online history'
          : result.format === 'official_statement'
            ? 'Sagicor monthly statement'
            : 'Sagicor PDF';
      setPdfFormatLabel(label);
      resetMatchState();
      applyMatch(result.lines);
      toast.success(`Found ${result.lines.length} Uber deposit${result.lines.length === 1 ? '' : 's'}`);
    } catch (e: any) {
      toast.error(e?.message || 'Could not read PDF');
    } finally {
      setParsing(false);
    }
  }

  function runMatch() {
    applyMatch(currentLines());
  }

  function dismissUnmatched(line: BankStatementLine) {
    setDismissed((prev) => new Set(prev).add(line.lineIndex));
    const nextUnmatched = unmatched.filter((l) => l.lineIndex !== line.lineIndex);
    setUnmatched(nextUnmatched);
    maybeClearImport(suggestions.length, nextUnmatched.length);
  }

  async function persistStatement(lines: BankStatementLine[]) {
    const res = await api.saveFleetBankStatement({
      id: statementId || undefined,
      fileName: fileName || (source === 'pdf' ? 'statement.pdf' : 'statement.csv'),
      lines: lines.map((l) => ({
        lineIndex: l.lineIndex,
        dateYmd: l.dateYmd,
        amount: l.amount,
        description: l.description,
      })),
      dismissedLineIndexes: [...dismissed],
    });
    const id = String((res.data as any)?.id || '');
    if (id) setStatementId(id);
  }

  async function confirmSuggestion(s: BankMatchSuggestion) {
    await api.upsertFleetBankConfirm({
      organizationId: organizationId || undefined,
      weekStartYmd: s.target.weekStartYmd,
      amountReceived: s.line.amount,
      expectedAmount: s.target.expected,
      confirmMethod: 'statement',
      bankDateYmd: s.line.dateYmd,
      statementFileName: fileName || undefined,
      platform: s.target.platform || 'uber',
    });
  }

  /** Keep statement loaded if unmatched lines still need attention. */
  function maybeClearImport(remainingSuggestions: number, remainingUnmatched: number) {
    if (remainingSuggestions === 0 && remainingUnmatched === 0) clearImport();
  }

  async function acceptOne(s: BankMatchSuggestion) {
    setBusy(true);
    try {
      await confirmSuggestion(s);
      await persistStatement(currentLines());
      const remaining = suggestions.filter((x) => x.line.lineIndex !== s.line.lineIndex);
      setSuggestions(remaining);
      onConfirmed();
      toast.success('Match accepted — bank received saved (Cash Returned unchanged)');
      maybeClearImport(remaining.length, unmatched.length);
    } catch (e: any) {
      toast.error(e?.message || 'Accept failed');
    } finally {
      setBusy(false);
      setPendingAccept(null);
    }
  }

  async function acceptManualMatch() {
    if (!pendingManual) return;
    const target = openWeeksForManual.find((r) => r.weekStartYmd === pendingManual.weekStartYmd);
    if (!target) {
      toast.error('Selected week is no longer available');
      return;
    }
    const suggestion: BankMatchSuggestion = {
      line: pendingManual.line,
      target,
      score: 0,
      reasons: ['Manual match'],
    };
    setBusy(true);
    try {
      await confirmSuggestion(suggestion);
      await persistStatement(currentLines());
      const nextUnmatched = unmatched.filter((l) => l.lineIndex !== pendingManual.line.lineIndex);
      setUnmatched(nextUnmatched);
      onConfirmed();
      toast.success('Deposit matched — bank received saved (Cash Returned unchanged)');
      setPendingManual(null);
      maybeClearImport(suggestions.length, nextUnmatched.length);
    } catch (e: any) {
      toast.error(e?.message || 'Match failed');
    } finally {
      setBusy(false);
    }
  }

  async function acceptAll() {
    if (suggestions.length === 0) return;
    setBusy(true);
    const batch = [...suggestions];
    let ok = 0;
    const locked = await runExclusive(`Accepting ${batch.length} matches…`, async () => {
    try {
      for (let i = 0; i < batch.length; i++) {
        const s = batch[i];
        setMessage(`Accepting match ${i + 1} of ${batch.length}…`);
        await confirmSuggestion(s);
        ok += 1;
      }
      await persistStatement(currentLines());
      setSuggestions([]);
      onConfirmed();
      toast.success(
        `Accepted ${ok} match${ok === 1 ? '' : 'es'} — bank received saved (Cash Returned unchanged)`,
      );
      maybeClearImport(0, unmatched.length);
      return true;
    } catch (e: any) {
      if (ok > 0) {
        const acceptedIndexes = new Set(batch.slice(0, ok).map((s) => s.line.lineIndex));
        setSuggestions((prev) => prev.filter((x) => !acceptedIndexes.has(x.line.lineIndex)));
        onConfirmed();
      }
      toast.error(
        ok > 0
          ? `Accepted ${ok}, then failed: ${e?.message || 'Accept failed'}`
          : e?.message || 'Accept all failed',
      );
      return false;
    } finally {
      setBusy(false);
      setPendingAccept(null);
    }
    });
    if (locked === undefined) {
      setBusy(false);
      toast.message('Another action is still running — try again when it finishes.');
    }
  }

  function confirmPendingAccept() {
    if (!pendingAccept) return;
    if (pendingAccept.mode === 'one') {
      void acceptOne(pendingAccept.suggestion);
      return;
    }
    void acceptAll();
  }

  function dismissSuggestion(s: BankMatchSuggestion) {
    setDismissed((prev) => new Set(prev).add(s.line.lineIndex));
    setSuggestions((prev) => prev.filter((x) => x.line.lineIndex !== s.line.lineIndex));
    setUnmatched((prev) => [...prev, s.line]);
  }

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Import bank statement</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Upload Sagicor PDF (Uber deposits auto-detected) or CSV. Review suggestions, then Accept.
            Does not change Cash Returned or Settlement.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={parsing}
            onClick={() => document.getElementById('fleet-bank-pdf-input')?.click()}
          >
            {parsing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Upload PDF
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={parsing}
            onClick={() => document.getElementById('fleet-bank-csv-input')?.click()}
          >
            <Upload className="h-4 w-4 mr-2" />
            Upload CSV
          </Button>
          {hasImport && (
            <Button type="button" variant="ghost" size="sm" disabled={parsing || busy} onClick={clearImport}>
              Clear
            </Button>
          )}
        </div>
        <input
          id="fleet-bank-pdf-input"
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={(e) => {
            void onPdfFile(e.target.files?.[0] || null);
            e.target.value = '';
          }}
        />
        <input
          id="fleet-bank-csv-input"
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            void onCsvFile(e.target.files?.[0] || null);
            e.target.value = '';
          }}
        />
      </div>

      {source === 'pdf' && pdfLines.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="secondary">{pdfFormatLabel}</Badge>
          {fileName ? (
            <span className="text-xs text-slate-500 truncate max-w-[240px]" title={fileName}>
              {fileName}
            </span>
          ) : null}
          <span className="text-xs text-slate-500">
            {pdfLines.length} Uber deposit{pdfLines.length === 1 ? '' : 's'} extracted
          </span>
          <Button size="sm" onClick={runMatch}>
            Find matches
          </Button>
        </div>
      )}

      {source === 'csv' && csvRows.length > 0 && (
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <label className="text-xs text-slate-500">Date column</label>
            <Select
              value={String(colMap.date)}
              onValueChange={(v) => setColMap((m) => ({ ...m, date: Number(v) }))}
            >
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {colOptions.map((i) => (
                  <SelectItem key={i} value={String(i)}>
                    {hasHeader ? header[i] || `Col ${i + 1}` : `Col ${i + 1}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-500">Amount column</label>
            <Select
              value={String(colMap.amount)}
              onValueChange={(v) => setColMap((m) => ({ ...m, amount: Number(v) }))}
            >
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {colOptions.map((i) => (
                  <SelectItem key={i} value={String(i)}>
                    {hasHeader ? header[i] || `Col ${i + 1}` : `Col ${i + 1}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-500">Description</label>
            <Select
              value={colMap.description == null ? 'none' : String(colMap.description)}
              onValueChange={(v) =>
                setColMap((m) => ({
                  ...m,
                  description: v === 'none' ? null : Number(v),
                }))
              }
            >
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {colOptions.map((i) => (
                  <SelectItem key={i} value={String(i)}>
                    {hasHeader ? header[i] || `Col ${i + 1}` : `Col ${i + 1}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-600 pb-2">
            <Input
              type="checkbox"
              className="h-4 w-4"
              checked={hasHeader}
              onChange={(e) => setHasHeader(e.target.checked)}
            />
            First row is header
          </label>
          <Button size="sm" onClick={runMatch}>
            Find matches
          </Button>
        </div>
      )}

      {hasImport && suggestions.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Suggested matches
            </h3>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => setPendingAccept({ mode: 'all' })}
            >
              Accept all ({suggestions.length})
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Statement</TableHead>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Expected</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Why</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suggestions.map((s) => (
                <TableRow key={s.line.lineIndex}>
                  <TableCell className="text-sm">
                    {s.line.dateYmd}
                    {s.line.description ? (
                      <span className="block text-xs text-slate-400 truncate max-w-[220px]">
                        {s.line.description}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {formatWeekPeriod(s.target.weekStartYmd)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {MONEY(s.target.expected)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{MONEY(s.line.amount)}</TableCell>
                  <TableCell className="text-xs text-slate-500 max-w-[200px]">
                    {s.reasons.join(' · ')}
                  </TableCell>
                  <TableCell className="text-right space-x-2 whitespace-nowrap">
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => setPendingAccept({ mode: 'one', suggestion: s })}
                    >
                      Accept
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => dismissSuggestion(s)}>
                      Dismiss
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {hasImport && unmatched.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wide flex items-center gap-2">
            Unmatched lines
            <Badge variant="secondary">{unmatched.length}</Badge>
          </h3>
          <p className="text-xs text-slate-500">
            Assign each deposit to an open Expected week, or dismiss if it does not belong here.
          </p>
          <ul className="text-sm text-slate-600 space-y-1 max-h-56 overflow-y-auto">
            {unmatched.slice(0, 40).map((l) => (
              <li
                key={l.lineIndex}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-50 py-2"
              >
                <span className="truncate min-w-0 flex-1">
                  {l.dateYmd} · {l.description || '—'}
                </span>
                <span className="tabular-nums shrink-0 font-medium">{MONEY(l.amount)}</span>
                <span className="shrink-0 space-x-1">
                  <Button size="sm" disabled={busy} onClick={() => openManualMatch(l)}>
                    Match to week
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => dismissUnmatched(l)}
                  >
                    Dismiss
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog
        open={!!pendingManual}
        onOpenChange={(open) => {
          if (!open && !busy) setPendingManual(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Match deposit to week</DialogTitle>
            <DialogDescription>
              Pick the Expected week this bank deposit belongs to. Saves as statement-matched Received.
              Cash Returned and Settlement stay unchanged.
            </DialogDescription>
          </DialogHeader>

          {pendingManual && (
            <div className="space-y-4">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-slate-500">Bank deposit</span>
                  <span className="tabular-nums text-right">
                    {pendingManual.line.dateYmd} · {MONEY(pendingManual.line.amount)}
                  </span>
                </div>
                {pendingManual.line.description ? (
                  <p className="text-xs text-slate-400 truncate" title={pendingManual.line.description}>
                    {pendingManual.line.description}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-slate-500">Expected week</label>
                <Select
                  value={pendingManual.weekStartYmd}
                  onValueChange={(v) =>
                    setPendingManual((prev) => (prev ? { ...prev, weekStartYmd: v } : prev))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select week" />
                  </SelectTrigger>
                  <SelectContent>
                    {openWeeksForManual.map((row) => {
                      const variance = pendingManual.line.amount - row.expected;
                      const varianceLabel =
                        Math.abs(variance) < 0.005
                          ? 'exact'
                          : `${variance > 0 ? '+' : ''}${MONEY(variance)} vs expected`;
                      return (
                        <SelectItem key={row.weekStartYmd} value={row.weekStartYmd}>
                          {formatWeekPeriod(row.weekStartYmd)} · Expected {MONEY(row.expected)} (
                          {varianceLabel})
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {manualTarget && pendingManual && manualVariance != null && (
                  <div className="rounded-md border border-slate-200 p-3 space-y-2 text-sm">
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">Expected</span>
                      <span className="tabular-nums">{MONEY(manualTarget.expected)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">Will record received</span>
                      <span className="tabular-nums font-medium">
                        {MONEY(pendingManual.line.amount)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">Variance</span>
                      <span
                        className={`tabular-nums ${
                          Math.abs(manualVariance) >= 0.005 ? 'text-amber-700' : 'text-slate-600'
                        }`}
                      >
                        {Math.abs(manualVariance) < 0.005
                          ? '—'
                          : `${manualVariance > 0 ? '+' : ''}${MONEY(manualVariance)}`}
                      </span>
                    </div>
                  </div>
                )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setPendingManual(null)}>
              Cancel
            </Button>
            <Button
              disabled={busy || !pendingManual?.weekStartYmd}
              onClick={() => void acceptManualMatch()}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : null}
              Confirm match
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={acceptOpen}
        onOpenChange={lockedAcceptOpenChange}
      >
        <DialogContent className="max-w-lg" hideCloseButton={busy} {...lockedAcceptContentProps}>
          <DialogHeader>
            <DialogTitle>
              {pendingAccept?.mode === 'all'
                ? `Accept ${suggestions.length} matches?`
                : 'Confirm match'}
            </DialogTitle>
            <DialogDescription>
              This marks fleet bank Received for the period(s) below. Cash Returned and Settlement stay unchanged.
            </DialogDescription>
          </DialogHeader>

          {pendingAccept?.mode === 'one' && (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Period</span>
                <span className="font-medium text-right">
                  {formatWeekPeriod(pendingAccept.suggestion.target.weekStartYmd)}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Bank deposit</span>
                <span className="tabular-nums text-right">
                  {pendingAccept.suggestion.line.dateYmd} · {MONEY(pendingAccept.suggestion.line.amount)}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Expected</span>
                <span className="tabular-nums text-right">
                  {MONEY(pendingAccept.suggestion.target.expected)}
                </span>
              </div>
            </div>
          )}

          {pendingAccept?.mode === 'all' && (
            <ul className="max-h-56 overflow-y-auto space-y-2 text-sm border border-slate-200 rounded-md p-3">
              {suggestions.map((s) => (
                <li
                  key={s.line.lineIndex}
                  className="flex justify-between gap-3 border-b border-slate-100 last:border-0 pb-2 last:pb-0"
                >
                  <span>
                    <span className="font-medium block">{formatWeekPeriod(s.target.weekStartYmd)}</span>
                    <span className="text-xs text-slate-400">Bank {s.line.dateYmd}</span>
                  </span>
                  <span className="tabular-nums shrink-0">{MONEY(s.line.amount)}</span>
                </li>
              ))}
            </ul>
          )}

          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setPendingAccept(null)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={confirmPendingAccept}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : null}
              {pendingAccept?.mode === 'all' ? 'Accept all' : 'Confirm accept'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
