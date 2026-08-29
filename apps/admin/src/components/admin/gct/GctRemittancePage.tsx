import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { gctAdminService } from '../../../services/gctAdminService';

function money(n: unknown) {
  return `J$${Number(n ?? 0).toLocaleString('en-JM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function GctRemittancePage() {
  const [periods, setPeriods] = useState<Array<Record<string, unknown>>>([]);
  const [orphanCount, setOrphanCount] = useState(0);
  const [assignPeriodId, setAssignPeriodId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, orphans] = await Promise.all([
        gctAdminService.periods(),
        gctAdminService.orphans(),
      ]);
      setPeriods(data.periods);
      setOrphanCount(orphans.outputCount + orphans.inputCount);
      const open = data.periods.find((p) => p.status === 'open');
      if (open) setAssignPeriodId(String(open.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load periods');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function ensureCurrent() {
    setBusy(true);
    try {
      await gctAdminService.ensureMonth();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  async function closePeriod(id: string) {
    if (orphanCount > 0) {
      if (
        !confirm(
          `${orphanCount} ledger row(s) have no period (orphans). Assign them before closing, or continue anyway?`,
        )
      ) {
        return;
      }
    }
    if (!confirm('Close and lock this period? Totals will freeze.')) return;
    setBusy(true);
    try {
      await gctAdminService.closePeriod(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Close failed');
    } finally {
      setBusy(false);
    }
  }

  async function assignOrphans() {
    if (!assignPeriodId) return;
    setBusy(true);
    try {
      await gctAdminService.assignOrphans(assignPeriodId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Assign failed');
    } finally {
      setBusy(false);
    }
  }

  function exportCsv(p: Record<string, unknown>) {
    const lines = [
      'Form,Period start,Period end,Output tax,Input tax,Net payable,Status',
      [
        '4A-shaped',
        p.period_start,
        p.period_end,
        p.output_total_jmd,
        p.input_total_jmd,
        p.net_payable_jmd,
        p.status,
      ].join(','),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gct-form4a-${p.period_start}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Remittance & filing</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monthly output − input = net payable (Form 4A shape). Closed periods do not restate.
          </p>
        </div>
        <Button onClick={() => void ensureCurrent()} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Ensure current month'}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {orphanCount > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Orphan ledger rows</CardTitle>
            <CardDescription>
              {orphanCount} row(s) with no period (tax point fell in a closed/filed month). Assign to
              an open period before filing.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 items-center">
            <select
              className="border rounded-md h-9 px-2 text-sm"
              value={assignPeriodId}
              onChange={(e) => setAssignPeriodId(e.target.value)}
            >
              {periods
                .filter((p) => p.status === 'open')
                .map((p) => (
                  <option key={String(p.id)} value={String(p.id)}>
                    {String(p.period_start)} → {String(p.period_end)}
                  </option>
                ))}
            </select>
            <Button size="sm" onClick={() => void assignOrphans()} disabled={busy || !assignPeriodId}>
              Assign orphans to open period
            </Button>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {periods.map((p) => (
            <Card key={String(p.id)}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    {String(p.period_start)} → {String(p.period_end)}
                  </CardTitle>
                  <Badge variant={p.status === 'open' ? 'secondary' : 'outline'}>
                    {String(p.status)}
                  </Badge>
                </div>
                <CardDescription>Form 4A-shaped summary</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Output tax</span>
                  <span>{money(p.output_total_jmd)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Input tax (creditable)</span>
                  <span>{money(p.input_total_jmd)}</span>
                </div>
                <div className="flex justify-between font-medium border-t pt-2">
                  <span>Net payable</span>
                  <span>{money(p.net_payable_jmd)}</span>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button size="sm" variant="outline" onClick={() => exportCsv(p)}>
                    Export CSV
                  </Button>
                  {p.status === 'open' && (
                    <Button size="sm" onClick={() => void closePeriod(String(p.id))} disabled={busy}>
                      Close & lock
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          {periods.length === 0 && (
            <p className="text-sm text-muted-foreground">No periods yet — create the current month.</p>
          )}
        </div>
      )}
    </div>
  );
}
