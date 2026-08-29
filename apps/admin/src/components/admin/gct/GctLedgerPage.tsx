import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { gctAdminService } from '../../../services/gctAdminService';

export function GctLedgerPage() {
  const [kind, setKind] = useState<'output' | 'input'>('output');
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await gctAdminService.ledger(kind);
      setRows(data.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load ledger');
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    void load();
  }, [load]);

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
                      No rows yet — ledger writes start when orders finalise (Workstream E).
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
