/**
 * Client-parse bank CSV → column map → suggested matches → Accept writes fleet_bank_confirm only.
 */
import React, { useMemo, useState } from 'react';
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

const MONEY = (n: number) =>
  n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });

type Props = {
  expectedRows: FleetBankReceiveRow[];
  organizationId?: string | null;
  onConfirmed: () => void;
};

export function BankStatementImport({ expectedRows, organizationId, onConfirmed }: Props) {
  const [fileName, setFileName] = useState('');
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [hasHeader, setHasHeader] = useState(true);
  const [colMap, setColMap] = useState<BankCsvColumnMap>({ date: 0, amount: 1, description: 2 });
  const [suggestions, setSuggestions] = useState<BankMatchSuggestion[]>([]);
  const [unmatched, setUnmatched] = useState<BankStatementLine[]>([]);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [statementId, setStatementId] = useState<string | null>(null);

  const header = csvRows[0] || [];
  const colCount = header.length || 3;
  const colOptions = useMemo(
    () => Array.from({ length: colCount }, (_, i) => i),
    [colCount],
  );

  async function onFile(file: File | null) {
    if (!file) return;
    const text = await file.text();
    const rows = parseCsvText(text);
    if (rows.length === 0) {
      toast.error('CSV is empty');
      return;
    }
    setFileName(file.name);
    setCsvRows(rows);
    const guessed = guessColumnMap(rows[0]);
    setColMap(guessed);
    setHasHeader(true);
    setSuggestions([]);
    setUnmatched([]);
    setDismissed(new Set());
    setStatementId(null);
  }

  function runMatch() {
    if (csvRows.length === 0) return;
    const lines = mapCsvRowsToLines(csvRows, colMap, hasHeader);
    if (lines.length === 0) {
      toast.error('No valid date/amount rows — check column mapping');
      return;
    }
    const sug = suggestBankMatches(lines, expectedRows);
    const used = new Set(sug.map((s) => s.line.lineIndex));
    setSuggestions(sug);
    setUnmatched(lines.filter((l) => !used.has(l.lineIndex)));
    toast.message(`${sug.length} suggested · ${lines.length - sug.length} unmatched`);
  }

  async function persistStatement(lines: BankStatementLine[]) {
    const res = await api.saveFleetBankStatement({
      id: statementId || undefined,
      fileName: fileName || 'statement.csv',
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

  async function acceptOne(s: BankMatchSuggestion) {
    setBusy(true);
    try {
      await api.upsertFleetBankConfirm({
        organizationId: organizationId || undefined,
        weekStartYmd: s.target.weekStartYmd,
        amountReceived: s.line.amount,
        expectedAmount: s.target.expected,
      });
      const lines = mapCsvRowsToLines(csvRows, colMap, hasHeader);
      await persistStatement(lines);
      setSuggestions((prev) => prev.filter((x) => x.line.lineIndex !== s.line.lineIndex));
      onConfirmed();
      toast.success('Match accepted — bank received saved (Cash Returned unchanged)');
    } catch (e: any) {
      toast.error(e?.message || 'Accept failed');
    } finally {
      setBusy(false);
    }
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
            Map columns, review suggestions, then Accept. Does not change Cash Returned or Settlement.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => document.getElementById('fleet-bank-csv-input')?.click()}
        >
          <Upload className="h-4 w-4 mr-2" />
          {fileName || 'Upload CSV'}
        </Button>
        <input
          id="fleet-bank-csv-input"
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            void onFile(e.target.files?.[0] || null);
            e.target.value = '';
          }}
        />
      </div>

      {csvRows.length > 0 && (
        <>
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

          {suggestions.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wide">Suggested matches</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Statement</TableHead>
                    <TableHead>Expected week</TableHead>
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
                      <TableCell className="text-sm">
                        {s.target.weekStartYmd}
                        <span className="block text-xs text-slate-400">
                          Expected {MONEY(s.target.expected)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{MONEY(s.line.amount)}</TableCell>
                      <TableCell className="text-xs text-slate-500 max-w-[200px]">
                        {s.reasons.join(' · ')}
                      </TableCell>
                      <TableCell className="text-right space-x-2 whitespace-nowrap">
                        <Button size="sm" disabled={busy} onClick={() => void acceptOne(s)}>
                          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Accept'}
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

          {unmatched.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wide flex items-center gap-2">
                Unmatched lines
                <Badge variant="secondary">{unmatched.length}</Badge>
              </h3>
              <p className="text-xs text-slate-500">
                Use Enter amount on the table above for these, or rematch after fixing columns.
              </p>
              <ul className="text-sm text-slate-600 space-y-1 max-h-40 overflow-y-auto">
                {unmatched.slice(0, 40).map((l) => (
                  <li key={l.lineIndex} className="flex justify-between gap-4 border-b border-slate-50 py-1">
                    <span className="truncate">
                      {l.dateYmd} · {l.description || '—'}
                    </span>
                    <span className="tabular-nums shrink-0">{MONEY(l.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
