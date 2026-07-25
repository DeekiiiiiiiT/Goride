/**
 * Petrojam Prices (Dominion → Fuel Management → Prices)
 * Wholesale / ex-refinery rates synced from petrojam.com — not pump prices.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DollarSign,
  Loader2,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  CalendarRange,
  Archive,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Alert, AlertDescription, AlertTitle } from '../../ui/alert';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { Label } from '../../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
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
  petrojamPricesService,
  type PetrojamPrice,
  type PetrojamSyncResult,
} from '../../../services/petrojamPricesService';

const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function fmt(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toLocaleString('en-JM', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

function fmtDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-JM', { year: 'numeric', month: 'long', day: 'numeric' });
}

function yearOptions(): number[] {
  const current = new Date().getFullYear();
  const years: number[] = [];
  for (let y = current; y >= 2010; y -= 1) years.push(y);
  return years;
}

function summarizeSync(result: PetrojamSyncResult): string {
  const range =
    result.oldestDate && result.latestDate && result.oldestDate !== result.latestDate
      ? ` (${fmtDate(result.oldestDate)} → ${fmtDate(result.latestDate)})`
      : result.latestDate
        ? ` (latest ${fmtDate(result.latestDate)})`
        : '';
  const pages = result.pagesFetched ? ` across ${result.pagesFetched} page(s)` : '';
  return `Synced ${result.rowCount} weeks${pages} — ${result.inserted} new, ${result.updated} updated${range}`;
}

export function FuelPricesPage() {
  const years = useMemo(() => yearOptions(), []);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [prices, setPrices] = useState<PetrojamPrice[]>([]);

  const [filterYear, setFilterYear] = useState<string>('all');
  const [filterMonth, setFilterMonth] = useState<string>('all');
  const [syncYear, setSyncYear] = useState<string>(String(years[0] ?? new Date().getFullYear()));
  const [syncMonth, setSyncMonth] = useState<string>(String(new Date().getMonth() + 1));
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const year = filterYear === 'all' ? null : Number(filterYear);
      const month = filterMonth === 'all' ? null : Number(filterMonth);
      const rows = await petrojamPricesService.listPrices({
        limit: year ? 400 : 200,
        year,
        month: year ? month : null,
      });
      setPrices(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load prices');
    } finally {
      setLoading(false);
    }
  }, [filterYear, filterMonth]);

  useEffect(() => {
    void load();
  }, [load]);

  const runSync = async (fn: () => Promise<PetrojamSyncResult>) => {
    setSyncing(true);
    setSuccess(null);
    setError(null);
    try {
      const result = await fn();
      setSuccess(summarizeSync(result));
      setTimeout(() => setSuccess(null), 6000);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const latestScraped = prices[0]?.scrapedAt;
  const busy = syncing || loading;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-slate-700 dark:text-slate-200" />
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-50">Petrojam Prices</h1>
            <Badge variant="secondary">Wholesale</Badge>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Jamaica Petrojam ex-refinery / base product prices (JMD). These are not retail pump prices —
            stations add margin and other costs on top.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href="https://www.petrojam.com/price/" target="_blank" rel="noreferrer">
              Open Petrojam
              <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
            </a>
          </Button>
          <Button
            onClick={() => void runSync(() => petrojamPricesService.syncLatest())}
            disabled={busy}
          >
            {syncing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Sync latest
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Synced</AlertTitle>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarRange className="h-4 w-4" />
            Import history
          </CardTitle>
          <CardDescription>
            Pull older Petrojam weeks by year or month (back to 2010), or import the full archive. Full
            archive walks every page on their site and can take about a minute.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label>Year to sync</Label>
              <Select value={syncYear} onValueChange={setSyncYear} disabled={busy}>
                <SelectTrigger>
                  <SelectValue placeholder="Year" />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Month to sync</Label>
              <Select value={syncMonth} onValueChange={setSyncMonth} disabled={busy}>
                <SelectTrigger>
                  <SelectValue placeholder="Month" />
                </SelectTrigger>
                <SelectContent>
                  {MONTH_LABELS.map((label, idx) => (
                    <SelectItem key={label} value={String(idx + 1)}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void runSync(() =>
                  petrojamPricesService.sync({ mode: 'year', year: Number(syncYear) }),
                )
              }
            >
              {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Sync year {syncYear}
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void runSync(() =>
                  petrojamPricesService.sync({
                    mode: 'month',
                    year: Number(syncYear),
                    month: Number(syncMonth),
                  }),
                )
              }
            >
              {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Sync {MONTH_LABELS[Number(syncMonth) - 1]} {syncYear}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setShowArchiveConfirm(true)}
            >
              {syncing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Archive className="mr-2 h-4 w-4" />
              )}
              Sync full archive
            </Button>
          </div>

          <AlertDialog open={showArchiveConfirm} onOpenChange={setShowArchiveConfirm}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <Archive className="h-5 w-5" />
                  Import full Petrojam archive?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This pulls every page from Petrojam (back through ~2010). It can take about a minute,
                  and duplicates are updated — not doubled.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={syncing}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={syncing}
                  onClick={(e) => {
                    e.preventDefault();
                    setShowArchiveConfirm(false);
                    void runSync(() => petrojamPricesService.sync({ mode: 'all' }));
                  }}
                >
                  {syncing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Syncing…
                    </>
                  ) : (
                    'Start full sync'
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle className="text-base">Stored prices</CardTitle>
              <CardDescription>
                {latestScraped
                  ? `Last sync recorded ${new Date(latestScraped).toLocaleString('en-JM')}`
                  : 'No prices stored yet — sync latest or import history.'}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Select
                value={filterYear}
                onValueChange={(v) => {
                  setFilterYear(v);
                  if (v === 'all') setFilterMonth('all');
                }}
                disabled={busy}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Filter year" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All years</SelectItem>
                  {years.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={filterMonth}
                onValueChange={setFilterMonth}
                disabled={busy || filterYear === 'all'}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Filter month" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All months</SelectItem>
                  {MONTH_LABELS.map((label, idx) => (
                    <SelectItem key={label} value={String(idx + 1)}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading prices…
            </div>
          ) : prices.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No rows for this filter. Sync latest, a year/month, or the full archive.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">87</th>
                    <th className="px-3 py-2 font-medium">90</th>
                    <th className="px-3 py-2 font-medium">Auto Diesel</th>
                    <th className="px-3 py-2 font-medium">Kerosene</th>
                    <th className="px-3 py-2 font-medium">Propane</th>
                    <th className="px-3 py-2 font-medium">Butane</th>
                    <th className="px-3 py-2 font-medium">HFO</th>
                    <th className="px-3 py-2 font-medium">Asphalt</th>
                    <th className="px-3 py-2 font-medium">ULSD</th>
                  </tr>
                </thead>
                <tbody>
                  {prices.map((row) => (
                    <tr key={row.id || row.priceDate} className="border-t odd:bg-background even:bg-muted/20">
                      <td className="whitespace-nowrap px-3 py-2 font-medium">{fmtDate(row.priceDate)}</td>
                      <td className="px-3 py-2 tabular-nums">{fmt(row.gasolene87)}</td>
                      <td className="px-3 py-2 tabular-nums">{fmt(row.gasolene90)}</td>
                      <td className="px-3 py-2 tabular-nums">{fmt(row.autoDiesel)}</td>
                      <td className="px-3 py-2 tabular-nums">{fmt(row.kerosene)}</td>
                      <td className="px-3 py-2 tabular-nums">{fmt(row.propane)}</td>
                      <td className="px-3 py-2 tabular-nums">{fmt(row.butane)}</td>
                      <td className="px-3 py-2 tabular-nums">{fmt(row.hfo)}</td>
                      <td className="px-3 py-2 tabular-nums">{fmt(row.asphalt)}</td>
                      <td className="px-3 py-2 tabular-nums">{fmt(row.ulsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
