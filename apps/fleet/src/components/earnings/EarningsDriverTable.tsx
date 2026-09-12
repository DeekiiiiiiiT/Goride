import { useEffect, useMemo, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { ChevronRight, Search } from 'lucide-react';
import { api } from '../../services/api';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import type { EarningsPlatformTab } from './EarningsSummaryCard';
import { EarningsDriverOverlay } from './EarningsDriverOverlay';
import {
  aggregateStatementSummaries,
  computePeriodBalances,
} from '../../utils/aggregateStatementSummaries';
import type { StatementSummary } from '../../types/statementSummary';

const PAGE_SIZE = 10;

function formatMoney(n: number): string {
  const abs = Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `-$${abs}` : `$${abs}`;
}

type DriverRowMetrics = {
  totalEarnings: number;
  refundsExpenses: number;
  adjustments: number;
  payout: number;
  netEarnings: number;
};

function metricsFromSummaries(
  summaries: StatementSummary[],
  platformTab: EarningsPlatformTab,
): DriverRowMetrics {
  const filtered =
    platformTab === 'all' ? summaries : summaries.filter((s) => s.platform === platformTab);
  const agg = aggregateStatementSummaries(filtered);
  if (!agg) {
    return {
      totalEarnings: 0,
      refundsExpenses: 0,
      adjustments: 0,
      payout: 0,
      netEarnings: 0,
    };
  }
  const { endBalance } = computePeriodBalances(agg);
  return {
    totalEarnings: agg.totalEarnings,
    refundsExpenses: agg.totalRefundsExpenses,
    adjustments: agg.periodAdjustments,
    payout: agg.totalPayout,
    netEarnings: endBalance,
  };
}

type Props = {
  startDate: string;
  endDate: string;
  platformTab: EarningsPlatformTab;
};

export function EarningsDriverTable({
  startDate,
  endDate,
  platformTab,
}: Props) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [selectedDriver, setSelectedDriver] = useState<{
    id: string;
    name: string;
    avatarUrl?: string;
  } | null>(null);

  const rosterQuery = useQuery({
    queryKey: ['drivers-roster', 'earnings'],
    queryFn: () => api.getDriversRoster(),
    staleTime: 60_000,
  });

  const drivers = rosterQuery.data?.data ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return drivers;
    return drivers.filter((d) => {
      const name = (d.name || '').toLowerCase();
      const id = (d.id || '').toLowerCase();
      return name.includes(q) || id.includes(q);
    });
  }, [drivers, search]);

  useEffect(() => {
    setPage(0);
  }, [search, startDate, endDate, platformTab]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageDrivers = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const statementQueries = useQueries({
    queries: pageDrivers.map((d) => ({
      queryKey: ['statement-summary', 'driver', d.id, startDate, endDate] as const,
      queryFn: () =>
        api.getStatementSummary({
          platform: 'all',
          startDate,
          endDate,
          driverId: d.id,
        }),
      staleTime: 30_000,
      enabled: Boolean(d.id && startDate && endDate),
    })),
  });

  const anyLoading =
    rosterQuery.isLoading || statementQueries.some((q) => q.isLoading || q.isFetching);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
          Driver earnings
        </h2>
        <div className="relative w-[160px] shrink-0 sm:w-[180px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Driver name"
            className="h-9 rounded-full border-slate-200 bg-white pl-9 shadow-none dark:border-slate-700 dark:bg-slate-900"
            aria-label="Search drivers by name"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-slate-200 hover:bg-transparent dark:border-slate-700">
              <TableHead className="pl-0 font-medium text-slate-500 dark:text-slate-400">
                Driver name
              </TableHead>
              <TableHead className="text-right font-medium text-slate-500 dark:text-slate-400">
                Total earnings
              </TableHead>
              <TableHead className="text-right font-medium text-slate-500 dark:text-slate-400">
                Refunds &amp; expenses
              </TableHead>
              <TableHead className="text-right font-medium text-slate-500 dark:text-slate-400">
                Adjustments
              </TableHead>
              <TableHead className="text-right font-medium text-slate-500 dark:text-slate-400">
                Payout
              </TableHead>
              <TableHead className="pr-0 text-right font-medium text-slate-500 dark:text-slate-400">
                Net earnings
              </TableHead>
              <TableHead className="w-10 pr-0">
                <span className="sr-only">Open</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rosterQuery.isError ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-rose-600">
                  Could not load drivers.
                </TableCell>
              </TableRow>
            ) : pageDrivers.length === 0 && !rosterQuery.isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-slate-500">
                  No drivers match this search.
                </TableCell>
              </TableRow>
            ) : (
              pageDrivers.map((driver, idx) => {
                const q = statementQueries[idx];
                const metrics =
                  q?.data?.summaries != null
                    ? metricsFromSummaries(q.data.summaries as StatementSummary[], platformTab)
                    : null;
                const busy = !metrics && (q?.isLoading || q?.isFetching || rosterQuery.isLoading);

                return (
                  <TableRow
                    key={driver.id}
                    className="cursor-pointer border-b border-slate-100 hover:bg-slate-50/80 dark:border-slate-800 dark:hover:bg-slate-800/40"
                    onClick={() =>
                      setSelectedDriver({
                        id: driver.id,
                        name: driver.name?.trim() || 'Unknown driver',
                        avatarUrl: driver.avatarUrl,
                      })
                    }
                  >
                    <TableCell className="pl-0 font-medium text-slate-900 dark:text-slate-100">
                      {driver.name?.trim() || 'Unknown driver'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-slate-800 dark:text-slate-200">
                      {busy ? '—' : formatMoney(metrics!.totalEarnings)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-slate-800 dark:text-slate-200">
                      {busy ? '—' : formatMoney(metrics!.refundsExpenses)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-slate-800 dark:text-slate-200">
                      {busy ? '—' : formatMoney(metrics!.adjustments)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-slate-800 dark:text-slate-200">
                      {busy ? '—' : formatMoney(metrics!.payout)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium text-slate-900 dark:text-slate-100">
                      {busy ? '—' : formatMoney(metrics!.netEarnings)}
                    </TableCell>
                    <TableCell className="pr-0 text-right">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-slate-500 dark:border-slate-700">
                        <ChevronRight className="h-4 w-4" />
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-xs text-slate-500">
          {anyLoading ? 'Updating…' : `${PAGE_SIZE} rows`}
        </span>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={safePage <= 0}
            onClick={() => setPage(0)}
            className="text-slate-600"
          >
            « First
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={safePage <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="text-slate-600"
          >
            ‹ Prev
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            className="text-slate-600"
          >
            Next ›
          </Button>
        </div>
      </div>

      <EarningsDriverOverlay
        open={Boolean(selectedDriver)}
        onOpenChange={(next) => {
          if (!next) setSelectedDriver(null);
        }}
        driver={selectedDriver}
        startDate={startDate}
        endDate={endDate}
        platformTab={platformTab}
      />
    </div>
  );
}
