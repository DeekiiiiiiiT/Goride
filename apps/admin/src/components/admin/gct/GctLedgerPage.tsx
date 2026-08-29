import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import { gctAdminService } from '../../../services/gctAdminService';

function parseInputTaxCsv(text: string): Array<Record<string, unknown>> {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cols = line.split(',').map((c) => c.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? '';
    });
    return {
      tax_point: row.tax_point || row.date || new Date().toISOString(),
      supplier_trn: row.supplier_trn || row.trn || null,
      base_amount_jmd: Number(row.base_amount_jmd || row.base || 0),
      rate_percent: Number(row.rate_percent || row.rate || 15),
      tax_amount_jmd: Number(row.tax_amount_jmd || row.tax || 0),
      credit_restriction: row.credit_restriction || row.restriction || 'none',
      source_ref: row.source_ref || row.ref || null,
    };
  });
}

export function GctLedgerPage() {
  const [kind, setKind] = useState<'output' | 'input'>('output');
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [periods, setPeriods] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [supplierTrn, setSupplierTrn] = useState('');
  const [baseAmount, setBaseAmount] = useState('');
  const [ratePercent, setRatePercent] = useState('15');
  const [taxAmount, setTaxAmount] = useState('');
  const [restriction, setRestriction] = useState('none');
  const [periodId, setPeriodId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, p] = await Promise.all([
        gctAdminService.ledger(kind),
        gctAdminService.periods(),
      ]);
      setRows(data.rows);
      setPeriods(p.periods);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load ledger');
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveInputTax() {
    setSaving(true);
    setError(null);
    try {
      await gctAdminService.recordInputTax({
        supplier_trn: supplierTrn,
        base_amount_jmd: Number(baseAmount),
        rate_percent: Number(ratePercent),
        tax_amount_jmd: Number(taxAmount),
        credit_restriction: restriction,
        period_id: periodId || null,
      });
      setSupplierTrn('');
      setBaseAmount('');
      setTaxAmount('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function onCsvFile(file: File | null) {
    if (!file) return;
    setSaving(true);
    setError(null);
    try {
      const text = await file.text();
      const parsed = parseInputTaxCsv(text);
      if (!parsed.length) throw new Error('No data rows in CSV');
      await gctAdminService.importInputTaxBatch(parsed, periodId || undefined);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'CSV import failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">GCT ledger</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Output and input tax rows. Reversals are new rows — never deletes.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Tabs value={kind} onValueChange={(v) => setKind(v as 'output' | 'input')}>
        <TabsList>
          <TabsTrigger value="output">Output tax</TabsTrigger>
          <TabsTrigger value="input">Input tax</TabsTrigger>
        </TabsList>
        <TabsContent value="input" className="mt-4 space-y-4">
          <div className="rounded-lg border p-4 space-y-3 max-w-2xl">
            <h2 className="text-sm font-medium">Record input tax</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Supplier TRN</Label>
                <Input value={supplierTrn} onChange={(e) => setSupplierTrn(e.target.value)} />
              </div>
              <div>
                <Label>Restriction</Label>
                <Select value={restriction} onValueChange={setRestriction}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="entertainment">Entertainment</SelectItem>
                    <SelectItem value="motor_vehicle">Motor vehicle</SelectItem>
                    <SelectItem value="capital_24m">Capital (24m)</SelectItem>
                    <SelectItem value="apportioned">Apportioned</SelectItem>
                    <SelectItem value="de_minimis">De minimis</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Base (JMD)</Label>
                <Input value={baseAmount} onChange={(e) => setBaseAmount(e.target.value)} />
              </div>
              <div>
                <Label>Rate %</Label>
                <Input value={ratePercent} onChange={(e) => setRatePercent(e.target.value)} />
              </div>
              <div>
                <Label>Tax (JMD)</Label>
                <Input value={taxAmount} onChange={(e) => setTaxAmount(e.target.value)} />
              </div>
              <div>
                <Label>Period (optional)</Label>
                <Select value={periodId || '__none'} onValueChange={(v) => setPeriodId(v === '__none' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Open period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— None —</SelectItem>
                    {periods
                      .filter((p) => p.status === 'open')
                      .map((p) => (
                        <SelectItem key={String(p.id)} value={String(p.id)}>
                          {String(p.period_start)} → {String(p.period_end)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <Button onClick={() => void saveInputTax()} disabled={saving || !taxAmount}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save input tax'}
              </Button>
              <Label className="text-sm cursor-pointer underline">
                Import CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => void onCsvFile(e.target.files?.[0] ?? null)}
                />
              </Label>
              <span className="text-xs text-muted-foreground">
                CSV headers: tax_point, supplier_trn, base_amount_jmd, rate_percent, tax_amount_jmd,
                credit_restriction
              </span>
            </div>
          </div>
        </TabsContent>
        <TabsContent value={kind} className="mt-4">
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="p-3">Tax point</th>
                  {kind === 'output' ? (
                    <>
                      <th className="p-3">Source</th>
                      <th className="p-3">Class</th>
                    </>
                  ) : (
                    <>
                      <th className="p-3">Supplier TRN</th>
                      <th className="p-3">Restriction</th>
                    </>
                  )}
                  <th className="p-3">Base</th>
                  <th className="p-3">Rate</th>
                  <th className="p-3">Tax</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center">
                      <Loader2 className="h-4 w-4 animate-spin inline" />
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-muted-foreground">
                      No rows yet.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={String(r.id)} className="border-t">
                      <td className="p-3 whitespace-nowrap">{String(r.tax_point)}</td>
                      {kind === 'output' ? (
                        <>
                          <td className="p-3 font-mono text-xs">
                            {String(r.source_doc_type)}/{String(r.source_doc_id)}
                          </td>
                          <td className="p-3">{String(r.supply_class)}</td>
                        </>
                      ) : (
                        <>
                          <td className="p-3">{String(r.supplier_trn || '—')}</td>
                          <td className="p-3">{String(r.credit_restriction)}</td>
                        </>
                      )}
                      <td className="p-3">{Number(r.base_amount_jmd).toFixed(2)}</td>
                      <td className="p-3">{Number(r.rate_percent)}%</td>
                      <td className="p-3 font-medium">
                        {kind === 'input'
                          ? Number(r.creditable_amount_jmd ?? r.tax_amount_jmd).toFixed(2)
                          : Number(r.tax_amount_jmd).toFixed(2)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
