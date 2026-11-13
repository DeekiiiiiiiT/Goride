/**
 * Business Finance → Week Reconciliation (Round 4a).
 * One section: the week list, then one week's eight-step desk. No classic Fuel/Tolls
 * escape hatch (WRA-04); the Delivery switch shows only when the server says Rush
 * deliveries is active (WRA-15). Links survive: ?line=&week=&step= (WRA-37).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import type { RunStepId } from '@roam/finance-core';
import { BusinessFinanceDeskChrome } from '../business-finance/BusinessFinanceDeskChrome';
import { usePermissions } from '../../hooks/usePermissions';
import { fetchDeliveryReconReadiness } from '../../services/reconApi';
import { ReconWeekLanding } from './recon/ReconWeekLanding';
import { ReconRunPage } from './recon/ReconRunPage';
import { ReconDeliveryReadinessCard } from './recon/ReconDeliveryReadinessCard';

export type WeekReconciliationHubTab = 'fuel' | 'tolls';

type Line = 'rideshare' | 'rush_delivery';

const STEP_IDS = ['sources', 'attribution', 'tolls', 'tag_account', 'fuel', 'trips_earnings', 'settlement_preview', 'close'];

function readRunQuery(): { line: Line; week: string; step?: RunStepId } {
  if (typeof window === 'undefined') return { line: 'rideshare', week: '' };
  const qs = new URLSearchParams(window.location.search);
  const line: Line = qs.get('line') === 'rush_delivery' ? 'rush_delivery' : 'rideshare';
  const week = String(qs.get('week') || '').split('T')[0];
  const stepRaw = qs.get('step');
  return { line, week, step: stepRaw && STEP_IDS.includes(stepRaw) ? (stepRaw as RunStepId) : undefined };
}

function pushRunQuery(line: string, week: string, step?: string) {
  if (typeof window === 'undefined') return;
  const qs = new URLSearchParams();
  qs.set('line', line);
  if (week) qs.set('week', week);
  if (step) qs.set('step', step);
  window.history.pushState({ page: 'week-reconciliation', line, week, step }, '', `/week-reconciliation?${qs.toString()}`);
}

type WeekReconNavigateOpts =
  | { startYmd: string; endYmd?: string; driverId?: string }
  | { weekKey: string }
  | { vehicleId?: string; driverId?: string; vehicleLabel?: string };

export function WeekReconciliationPage({
  onBackToBusinessFinance,
  onNavigate,
  initialWeekStart,
  initialStep,
  initialLine,
  onHintsConsumed,
}: {
  onBackToBusinessFinance?: () => void;
  onNavigate?: (page: string, opts?: WeekReconNavigateOpts) => void;
  /** Kept for old links; the hub tabs no longer exist (WRA-04). */
  initialHubTab?: WeekReconciliationHubTab | null;
  initialWeekStart?: string | null;
  initialStep?: string | null;
  initialLine?: Line | null;
  tollFocus?: { vehicleId?: string; driverId?: string; vehicleLabel?: string } | null;
  onHintsConsumed?: () => void;
  onViewDriverLedger?: (driverId: string) => void;
}) {
  const { canView, permissions } = usePermissions();
  const canReconDesk =
    canView('fuel-reconciliation') ||
    canView('toll-tags') ||
    permissions.some((p) => String(p) === 'recon.view' || String(p) === 'nav.recon');

  const [line, setLine] = useState<Line>(() => readRunQuery().line);
  const [runWeek, setRunWeek] = useState<string>(() => readRunQuery().week);
  const [deliveryActive, setDeliveryActive] = useState(false);

  // Hints from other pages (e.g. Close Week links, Past weeks) open that week.
  useEffect(() => {
    if (!initialWeekStart && !initialStep && !initialLine) return;
    const nextLine: Line = initialLine === 'rush_delivery' ? 'rush_delivery' : readRunQuery().line;
    setLine(nextLine);
    if (initialWeekStart) {
      const step = initialStep && STEP_IDS.includes(initialStep) ? initialStep : 'sources';
      setRunWeek(initialWeekStart);
      pushRunQuery(nextLine, initialWeekStart, step);
    } else {
      const q = readRunQuery();
      if (q.week) setRunWeek(q.week);
    }
    onHintsConsumed?.();
  }, [initialWeekStart, initialStep, initialLine, onHintsConsumed]);

  useEffect(() => {
    const sync = () => {
      const q = readRunQuery();
      setLine(q.line);
      setRunWeek(q.week);
    };
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  const deliveryReadyQuery = useQuery({
    queryKey: ['delivery-recon-readiness', runWeek],
    queryFn: () => fetchDeliveryReconReadiness(runWeek),
    enabled: !!runWeek && line === 'rush_delivery',
    staleTime: 60_000,
    retry: false,
  });

  const openWeek = useCallback((weekKey: string) => {
    setRunWeek(weekKey);
    pushRunQuery(line, weekKey, 'sources');
  }, [line]);

  const backToList = useCallback(() => {
    setRunWeek('');
    pushRunQuery(line, '');
  }, [line]);

  const switchLine = useCallback((next: Line) => {
    setLine(next);
    setRunWeek('');
    pushRunQuery(next, '');
  }, []);

  if (!canReconDesk) {
    return (
      <div className="w-full min-w-0 space-y-6 p-4 sm:p-6 md:mx-auto md:max-w-[1400px]">
        <BusinessFinanceDeskChrome deskLabel="Week Reconciliation" onBack={onBackToBusinessFinance} />
        <p className="text-sm text-[#47464c]">You do not have permission to open Week Reconciliation.</p>
      </div>
    );
  }

  const deliveryGated =
    !!runWeek &&
    line === 'rush_delivery' &&
    (deliveryReadyQuery.isLoading || deliveryReadyQuery.isError || !deliveryReadyQuery.data?.ready);

  return (
    <div className="w-full min-w-0 space-y-6 bg-[#f8f9ff] p-4 sm:p-6 md:mx-auto md:max-w-[1400px]">
      <BusinessFinanceDeskChrome deskLabel="Week Reconciliation" onBack={onBackToBusinessFinance} />

      {!runWeek ? (
        <ReconWeekLanding
          line={line}
          onLineChange={switchLine}
          showLineToggle={deliveryActive || line === 'rush_delivery'}
          onOpenWeek={openWeek}
          onDeliveryActive={setDeliveryActive}
        />
      ) : deliveryGated ? (
        <div className="space-y-3">
          <button
            type="button"
            onClick={backToList}
            className="flex h-10 items-center gap-2 rounded-xl border border-[#cbd5e1] bg-white px-4 text-sm font-semibold text-[#0b1c30]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> All weeks
          </button>
          <ReconDeliveryReadinessCard
            weekKey={runWeek}
            items={deliveryReadyQuery.data?.items ?? []}
            ready={false}
            loading={deliveryReadyQuery.isLoading}
          />
        </div>
      ) : (
        <ReconRunPage
          line={line}
          weekKey={runWeek}
          onBack={backToList}
          onNavigate={onNavigate}
          onOpenRemittance={() => onNavigate?.('courier-settlements')}
          onSwitchToRideshare={() => {
            setLine('rideshare');
            const step =
              typeof window !== 'undefined'
                ? new URLSearchParams(window.location.search).get('step') || 'tolls'
                : 'tolls';
            pushRunQuery('rideshare', runWeek, step);
          }}
        />
      )}
    </div>
  );
}
