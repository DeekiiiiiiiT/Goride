import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
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
import { Badge } from '../../ui/badge';
import { gctAdminService } from '../../../services/gctAdminService';

export function GctRatesPage() {
  const [rates, setRates] = useState<Array<Record<string, unknown>>>([]);
  const [classes, setClasses] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [supplyClass, setSupplyClass] = useState('standard');
  const [ratePercent, setRatePercent] = useState('15');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [authority, setAuthority] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await gctAdminService.rates();
      setRates(data.rates);
      setClasses(data.classes);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load rates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function appendRate() {
    setSaving(true);
    setError(null);
    try {
      await gctAdminService.appendRate({
        supplyClass,
        ratePercent: Number(ratePercent),
        effectiveFrom,
        authority,
      });
      setEffectiveFrom('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to append rate');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Rates & classes</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Append-only statutory rates. Never edit a live row — add a future rate instead.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="rounded-lg border p-4 space-y-3 max-w-xl">
        <h2 className="text-sm font-medium flex items-center gap-2">
          <Plus className="h-4 w-4" /> Add future rate
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Class</Label>
            <Select value={supplyClass} onValueChange={setSupplyClass}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={String(c.code)} value={String(c.code)}>
                    {String(c.label)} ({String(c.code)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Rate %</Label>
            <Input value={ratePercent} onChange={(e) => setRatePercent(e.target.value)} />
          </div>
          <div>
            <Label>Effective from</Label>
            <Input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          </div>
          <div>
            <Label>Authority</Label>
            <Input value={authority} onChange={(e) => setAuthority(e.target.value)} placeholder="s.4 / L.N. …" />
          </div>
        </div>
        <Button onClick={() => void appendRate()} disabled={saving || !effectiveFrom}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Append rate'}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-3 font-medium">Class</th>
              <th className="p-3 font-medium">Rate</th>
              <th className="p-3 font-medium">From</th>
              <th className="p-3 font-medium">To</th>
              <th className="p-3 font-medium">Authority</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin inline" /> Loading…
                </td>
              </tr>
            ) : (
              rates.map((r) => (
                <tr key={String(r.id)} className="border-t">
                  <td className="p-3">
                    <Badge variant="outline">{String(r.supply_class)}</Badge>
                  </td>
                  <td className="p-3 font-medium">{Number(r.rate_percent)}%</td>
                  <td className="p-3">{String(r.effective_from)}</td>
                  <td className="p-3">{r.effective_to ? String(r.effective_to) : 'open'}</td>
                  <td className="p-3 text-muted-foreground">{String(r.authority || '—')}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
