import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';
import {
  EarningsPeriodFilter,
  initialEarningsPeriod,
} from './EarningsPeriodFilter';
import {
  EarningsSummaryCard,
  type EarningsPlatformTab,
} from './EarningsSummaryCard';
import { EarningsDriverTable } from './EarningsDriverTable';
import { aggregateStatementSummaries } from '../../utils/aggregateStatementSummaries';
import type { StatementSummary } from '../../types/statementSummary';

export function EarningsPage() {
  const [period, setPeriod] = useState(initialEarningsPeriod);
  const [platformTab, setPlatformTab] = useState<EarningsPlatformTab>('all');

  const startDate = period.startDate;
  const endDate = period.endDate;

  const statementQuery = useQuery({
    queryKey: ['statement-summary', 'earnings-fleet', startDate, endDate],
    queryFn: () =>
      api.getStatementSummary({
        platform: 'all',
        startDate,
        endDate,
      }),
    enabled: Boolean(startDate && endDate),
    staleTime: 30_000,
  });

  const summaries = (statementQuery.data?.summaries ?? []) as StatementSummary[];

  const cardSummary = useMemo(() => {
    if (platformTab === 'all') {
      return aggregateStatementSummaries(summaries);
    }
    const row = summaries.find((s) => s.platform === platformTab);
    return row ?? null;
  }, [summaries, platformTab]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            Earnings
          </h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Fleet earnings for the selected period across platforms.
          </p>
        </div>
        <EarningsPeriodFilter value={period} onChange={setPeriod} className="w-full sm:w-auto sm:min-w-[320px]" />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(280px,380px)_1fr]">
        <EarningsSummaryCard
          summary={cardSummary}
          loading={statementQuery.isLoading || statementQuery.isFetching}
          platformTab={platformTab}
          onPlatformTabChange={setPlatformTab}
        />
        <EarningsDriverTable
          startDate={startDate}
          endDate={endDate}
          platformTab={platformTab}
        />
      </div>
    </div>
  );
}
