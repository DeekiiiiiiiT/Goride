// Stitch: dominion-redesign/b8c603a5127744e887b443ff58b9412d
/**
 * Petrojam Prices (Dominion → Fuel Management → Prices)
 * Wholesale / ex-refinery rates synced from petrojam.com — not pump prices.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  AlertCircle,
  CheckCircle2,
  Info,
  Loader2,
  RefreshCw,
} from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../maintenance-templates/plainUi";
import {
  petrojamPricesService,
  type PetrojamPrice,
  type PetrojamSyncResult,
} from "../../../services/petrojamPricesService";

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const PRODUCTS: Array<{
  key: keyof PetrojamPrice;
  label: string;
}> = [
  { key: "gasolene87", label: "Unleaded 87" },
  { key: "gasolene90", label: "Unleaded 90" },
  { key: "autoDiesel", label: "Auto diesel" },
  { key: "ulsd", label: "ULSD" },
  { key: "kerosene", label: "Kerosene" },
  { key: "propane", label: "Propane" },
  { key: "butane", label: "Butane" },
  { key: "hfo", label: "HFO" },
  { key: "asphalt", label: "Asphalt" },
];

function fmt(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "The data is not in yet";
  return `JMD $${n.toLocaleString("en-JM", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return "The data is not in yet";
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-JM", { year: "numeric", month: "long", day: "numeric" });
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
        : "";
  const pages = result.pagesFetched ? ` across ${result.pagesFetched} page(s)` : "";
  return `Synced ${result.rowCount} weeks${pages} — ${result.inserted} new, ${result.updated} updated${range}`;
}

export function FuelPricesPage() {
  const years = useMemo(() => yearOptions(), []);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [prices, setPrices] = useState<PetrojamPrice[]>([]);
  const [filterYear, setFilterYear] = useState<string>("all");
  const [filterMonth, setFilterMonth] = useState<string>("all");
  const [syncYear, setSyncYear] = useState<string>(String(years[0] ?? new Date().getFullYear()));
  const [syncMonth, setSyncMonth] = useState<string>(String(new Date().getMonth() + 1));
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const year = filterYear === "all" ? null : Number(filterYear);
      const month = filterMonth === "all" ? null : Number(filterMonth);
      const rows = await petrojamPricesService.listPrices({
        limit: year ? 400 : 200,
        year,
        month: year ? month : null,
      });
      setPrices(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load prices");
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
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const latest = prices[0];
  const busy = syncing || loading;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-8 text-slate-900">
      <div className="flex items-center justify-between">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-medium text-slate-500">
          <span>Dominion</span>
          <span aria-hidden>›</span>
          <span>Master data</span>
          <span aria-hidden>›</span>
          <span>Fuel</span>
          <span aria-hidden>›</span>
          <span className="font-semibold text-slate-900">Fuel prices</span>
        </nav>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 font-mono text-[11px] text-slate-600">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span>REGION: JM-KGN</span>
        </div>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Fuel prices</h1>
          <p className="mt-1 text-sm text-slate-500">
            Petrojam wholesale and ex-refinery prices. Not pump prices.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void runSync(() => petrojamPricesService.syncLatest())}
          className="inline-flex items-center gap-2 rounded-lg bg-[#316bf3] px-4 py-2 text-xs font-medium text-white shadow-sm transition-colors hover:bg-blue-600 disabled:opacity-60"
        >
          {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Sync Petrojam
        </button>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            <div className="font-semibold">Error</div>
            <div>{error}</div>
          </div>
        </div>
      ) : null}
      {success ? (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            <div className="font-semibold">Synced</div>
            <div>{success}</div>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-[12px] border border-slate-200/80 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading prices…
          </div>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/60 font-mono text-[11px] uppercase tracking-wider text-slate-500">
                <th scope="col" className="px-6 py-3.5 font-semibold">
                  Product
                </th>
                <th scope="col" className="px-6 py-3.5 font-semibold">
                  Effective date
                </th>
                <th scope="col" className="px-6 py-3.5 text-right font-semibold">
                  Wholesale JMD
                </th>
                <th scope="col" className="px-6 py-3.5 text-right font-semibold">
                  Ex-refinery JMD
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {PRODUCTS.map((product) => {
                const value = latest ? (latest[product.key] as number | null | undefined) : null;
                const hasValue = value != null && !Number.isNaN(value);
                return (
                  <tr key={product.key} className="transition-colors hover:bg-slate-50/50">
                    <td className="px-6 py-4 font-medium text-slate-800">{product.label}</td>
                    <td className={`px-6 py-4 ${hasValue ? "text-slate-600" : "italic text-slate-400"}`}>
                      {hasValue ? fmtDate(latest?.priceDate) : "The data is not in yet"}
                    </td>
                    <td
                      className={`px-6 py-4 text-right font-mono ${hasValue ? "text-slate-900" : "italic text-slate-400"}`}
                    >
                      {hasValue ? fmt(value) : "The data is not in yet"}
                    </td>
                    <td className="px-6 py-4 text-right font-mono italic text-slate-400">
                      The data is not in yet
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-[12px] border border-slate-200/80 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Import history</p>
            <p className="text-xs text-slate-500">Pull older Petrojam weeks, or sync the full archive.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select
              value={filterYear}
              onValueChange={(v) => {
                setFilterYear(v);
                if (v === "all") setFilterMonth("all");
              }}
              disabled={busy}
            >
              <SelectTrigger className="h-8 w-[130px] text-xs">
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
            <Select value={filterMonth} onValueChange={setFilterMonth} disabled={busy || filterYear === "all"}>
              <SelectTrigger className="h-8 w-[140px] text-xs">
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Year to sync</Label>
            <Select value={syncYear} onValueChange={setSyncYear} disabled={busy}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
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
          <div className="space-y-1.5">
            <Label className="text-xs">Month to sync</Label>
            <Select value={syncMonth} onValueChange={setSyncMonth} disabled={busy}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
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
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() =>
              void runSync(() => petrojamPricesService.sync({ mode: "year", year: Number(syncYear) }))
            }
          >
            Sync year {syncYear}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() =>
              void runSync(() =>
                petrojamPricesService.sync({
                  mode: "month",
                  year: Number(syncYear),
                  month: Number(syncMonth),
                }),
              )
            }
          >
            Sync {MONTH_LABELS[Number(syncMonth) - 1]} {syncYear}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setShowArchiveConfirm(true)}>
            <Archive className="mr-1.5 h-3.5 w-3.5" />
            Sync full archive
          </Button>
        </div>
        {prices.length > 1 ? (
          <p className="mt-3 text-xs text-slate-500">
            Showing latest week in the product table. {prices.length} weeks stored for this filter.
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-between rounded-[12px] border border-slate-200/80 bg-white px-5 py-3.5 text-xs shadow-sm">
        <div className="flex items-center gap-2.5 text-slate-500">
          <Info className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          <span>The data is not in yet.</span>
        </div>
        <div className="font-mono text-[11px] uppercase tracking-wide text-slate-400">
          LOC: KINGSTON / PETROJAM REFINERY JMD
        </div>
      </div>

      <Dialog open={showArchiveConfirm} onOpenChange={setShowArchiveConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Archive className="h-5 w-5" aria-hidden />
              Import full Petrojam archive?
            </DialogTitle>
            <DialogDescription>
              This pulls every page from Petrojam (back through ~2010). It can take about a minute, and
              duplicates are updated — not doubled.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={syncing} onClick={() => setShowArchiveConfirm(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={syncing}
              onClick={() => {
                setShowArchiveConfirm(false);
                void runSync(() => petrojamPricesService.sync({ mode: "all" }));
              }}
            >
              {syncing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Syncing…
                </>
              ) : (
                "Start full sync"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
