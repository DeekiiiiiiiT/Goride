/**
 * Business Finance → Week Reconciliation
 * P3 wizard (flag) or classic Fuel + Toll tabs.
 */
import React, { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, MoreHorizontal } from 'lucide-react';
import type { RunStepId } from '@roam/finance-core';
import { BusinessFinanceDeskChrome } from '../business-finance/BusinessFinanceDeskChrome';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { usePermissions } from '../../hooks/usePermissions';
import { useReconWizardEnabled } from '../../hooks/useReconWizardFlag';
import {
  fetchDeliveryReconReadiness,
  fetchWeeks,
  isReconUnavailable,
  type ReconWeekSummary,
} from '../../services/reconApi';
import { useBusinessConfig } from '../auth/BusinessConfigContext';
import { useFeatureFlags } from '../auth/FeatureFlagContext';
import { ReconWeekLanding } from './recon/ReconWeekLanding';
import { ReconRunPage } from './recon/ReconRunPage';
import { ReconDeliveryReadinessCard } from './recon/ReconDeliveryReadinessCard';
import { cn } from '../ui/utils';

const FuelManagementLazy = lazy(() =>
  import('../../pages/FuelManagement').then((m) => ({ default: m.FuelManagement })),
);
const TollReconciliationLazy = lazy(() =>
  import('../../pages/TollReconciliation').then((m) => ({ default: m.TollReconciliation })),
);

export type WeekReconciliationHubTab = 'fuel' | 'tolls';

function aggregateReconKpis(weeks: ReconWeekSummary[]) {
  const openWeeks = weeks.filter((w) => w.blockers > 0).length;
  const needsData = weeks.reduce((n, w) => n + w.blockers, 0);
  const oldest = [...weeks]
    .filter((w) => w.blockers > 0)
    .sort((a, b) => a.weekKey.localeCompare(b.weekKey))[0];
  return {
    openWeeks,
    needsData,
    oldestLabel: oldest?.weekKey ?? '',
    oldestAction: oldest?.nextAction?.label ?? '',
  };
}

function readRunQuery(): { line: 'rideshare' | 'rush_delivery'; week: string; step?: RunStepId } {
  if (typeof window === 'undefined') {
    return { line: 'rideshare', week: '' };
  }
  const qs = new URLSearchParams(window.location.search);
  const lineRaw = qs.get('line') || 'rideshare';
  const line = lineRaw === 'rush_delivery' ? 'rush_delivery' : 'rideshare';
  const week = String(qs.get('week') || '').split('T')[0];
  const stepRaw = qs.get('step');
  const step = stepRaw as RunStepId | undefined;
  return { line, week, step };
}

function pushRunQuery(line: string, week: string, step?: string) {
  if (typeof window === 'undefined') return;
  const qs = new URLSearchParams();
  qs.set('line', line);
  qs.set('week', week);
  if (step) qs.set('step', step);
  const path = `/week-reconciliation?${qs.toString()}`;
  window.history.pushState({ page: 'week-reconciliation', line, week, step }, '', path);
}

type WeekReconNavigateOpts =
  | { startYmd: string; endYmd?: string; driverId?: string }
  | { weekKey: string }
  | { vehicleId?: string; driverId?: string; vehicleLabel?: string };

export function WeekReconciliationPage({
  onBackToBusinessFinance,
  onNavigate,
  initialHubTab,
  initialWeekStart,
  tollFocus,
  onHintsConsumed,
  onViewDriverLedger,
}: {
  onBackToBusinessFinance?: () => void;
  onNavigate?: (page: string, opts?: WeekReconNavigateOpts) => void;
  initialHubTab?: WeekReconciliationHubTab | null;
  initialWeekStart?: string | null;
  tollFocus?: {
    vehicleId?: string;
    driverId?: string;
    vehicleLabel?: string;
  } | null;
  onHintsConsumed?: () => void;
  onViewDriverLedger?: (driverId: string) => void;
}) {
  const { canView, permissions } = usePermissions();
  const wizardEnabled = useReconWizardEnabled();
  const { serviceLines } = useBusinessConfig();
  const { serviceLines: flagServiceLines, isModuleEnabled } = useFeatureFlags();
  // Org already has rush_delivery in DB; also accept modules/flags so a stale
  // session cache of rideshare-only does not hide the Delivery tab.
  const hasRushDeliveryLine =
    serviceLines.includes('rush_delivery') ||
    flagServiceLines.includes('rush_delivery') ||
    isModuleEnabled('rush_couriers') ||
    isModuleEnabled('rush_deliveries');
  const canFuel = canView('fuel-reconciliation');
  const canTolls = canView('toll-tags');
  const canReconDesk =
    canFuel ||
    canTolls ||
    permissions.some((p) => String(p) === 'recon.view' || String(p) === 'nav.recon');

  const defaultTab = useMemo<WeekReconciliationHubTab>(() => {
    if (initialHubTab === 'fuel' && canFuel) return 'fuel';
    if (initialHubTab === 'tolls' && canTolls) return 'tolls';
    if (canFuel) return 'fuel';
    return 'tolls';
  }, [initialHubTab, canFuel, canTolls]);

  const [hubTab, setHubTab] = useState<WeekReconciliationHubTab>(defaultTab);
  const [weekStart, setWeekStart] = useState<string | undefined>(initialWeekStart || undefined);
  const [classicMode, setClassicMode] = useState(false);
  const [runWeek, setRunWeek] = useState<string>(() => readRunQuery().week);
  const [runLine, setRunLine] = useState<'rideshare' | 'rush_delivery'>(() => readRunQuery().line);
  const [deskLine, setDeskLine] = useState<'rideshare' | 'rush_delivery'>(() => readRunQuery().line);

  const reconQuery = useQuery({
    queryKey: ['recon-weeks', deskLine],
    queryFn: () => fetchWeeks(deskLine),
    staleTime: 60_000,
    retry: false,
    enabled: wizardEnabled,
  });
  const reconUnavailable = reconQuery.isError && isReconUnavailable(reconQuery.error);
  const reconWeeks = reconQuery.data ?? [];
  const reconKpis = useMemo(() => aggregateReconKpis(reconWeeks), [reconWeeks]);

  useEffect(() => {
    if (!initialHubTab && !initialWeekStart && !tollFocus) return;
    if (initialHubTab === 'fuel' && canFuel) setHubTab('fuel');
    else if (initialHubTab === 'tolls' && canTolls) setHubTab('tolls');
    if (initialWeekStart) {
      setWeekStart(initialWeekStart);
      if (wizardEnabled) {
        setRunWeek(initialWeekStart);
        pushRunQuery('rideshare', initialWeekStart, 'sources');
      }
    }
    onHintsConsumed?.();
  }, [initialHubTab, initialWeekStart, tollFocus, canFuel, canTolls, onHintsConsumed, wizardEnabled]);

  useEffect(() => {
    if (hubTab === 'fuel' && !canFuel && canTolls) setHubTab('tolls');
    if (hubTab === 'tolls' && !canTolls && canFuel) setHubTab('fuel');
  }, [hubTab, canFuel, canTolls]);

  useEffect(() => {
    const sync = () => {
      const q = readRunQuery();
      setRunLine(q.line);
      setRunWeek(q.week);
    };
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  const deliveryReadyQuery = useQuery({
    queryKey: ['delivery-recon-readiness', runWeek],
    queryFn: () => fetchDeliveryReconReadiness(runWeek),
    enabled: wizardEnabled && !!runWeek && runLine === 'rush_delivery',
    staleTime: 60_000,
    retry: false,
  });

  const openRunWeek = useCallback((weekKey: string) => {
    setRunWeek(weekKey);
    setRunLine(deskLine);
    pushRunQuery(deskLine, weekKey, 'sources');
  }, [deskLine]);

  const switchDeskLine = useCallback((line: 'rideshare' | 'rush_delivery') => {
    setDeskLine(line);
    if (runWeek) {
      setRunLine(line);
      pushRunQuery(line, runWeek, 'sources');
    }
  }, [runWeek]);

  const handleFuelTabChange = (tab: string) => {
    onNavigate?.(`fuel-${tab}`);
  };

  if (!canReconDesk) {
    return (
      <div className="w-full min-w-0 space-y-6 p-4 sm:p-6 md:mx-auto md:max-w-[1400px]">
        <BusinessFinanceDeskChrome deskLabel="Week Reconciliation" onBack={onBackToBusinessFinance} />
        <p className="text-sm text-slate-500">
          You do not have permission to open fuel or toll reconciliation.
        </p>
      </div>
    );
  }

  // R3 UX: never hide Rideshare|Delivery because /recon/weeks failed — that dumped
  // orgs with rush_delivery into classic Fuel/Tolls with no line toggle (silent bug).
  const showWizardShell = wizardEnabled && !classicMode;
  const inRun = showWizardShell && !!runWeek && !reconUnavailable;
  const deliveryGated =
    inRun &&
    runLine === 'rush_delivery' &&
    (deliveryReadyQuery.isLoading ||
      deliveryReadyQuery.isError ||
      !deliveryReadyQuery.data?.ready);

  const lineSegment = hasRushDeliveryLine ? (
    <div
      className="grid max-w-md grid-cols-2 rounded-lg border border-slate-200 bg-slate-100 p-1"
      role="tablist"
      aria-label="Reconciliation service line"
    >
      {(['rideshare', 'rush_delivery'] as const).map((line) => {
        const active = deskLine === line;
        const label = line === 'rideshare' ? 'Rideshare' : 'Delivery';
        return (
          <button
            key={line}
            type="button"
            role="tab"
            aria-selected={active}
            className={cn(
              'rounded-md px-3 py-2 text-sm font-medium transition-colors',
              active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
            )}
            onClick={() => switchDeskLine(line)}
          >
            {label}
          </button>
        );
      })}
    </div>
  ) : null;

  return (
    <div className="w-full min-w-0 space-y-6 p-4 sm:p-6 md:mx-auto md:max-w-[1400px]">
      <BusinessFinanceDeskChrome deskLabel="Week Reconciliation" onBack={onBackToBusinessFinance} />

      {showWizardShell ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <p className="text-sm text-slate-600">Guided week reconciliation</p>
            {lineSegment}
          </div>
          {/* Escape hatch only on week list — Fuel/Tolls live in the run stepper. */}
          {!inRun ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="text-slate-500">
                  <MoreHorizontal className="mr-1 h-4 w-4" />
                  Advanced
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setClassicMode(true)}>
                  Open classic fuel/tolls
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      ) : wizardEnabled && classicMode ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {lineSegment}
          <Button type="button" variant="ghost" size="sm" onClick={() => setClassicMode(false)}>
            Back to week list
          </Button>
        </div>
      ) : null}

      {inRun && deliveryGated ? (
        <div className="space-y-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setRunWeek('');
              if (typeof window !== 'undefined') {
                window.history.pushState({ page: 'week-reconciliation' }, '', '/week-reconciliation');
              }
            }}
          >
            ← All weeks
          </Button>
          <ReconDeliveryReadinessCard
            weekKey={runWeek}
            items={deliveryReadyQuery.data?.items ?? []}
            ready={false}
            loading={deliveryReadyQuery.isLoading}
          />
        </div>
      ) : null}

      {inRun && !deliveryGated ? (
        <ReconRunPage
          line={runLine}
          weekKey={runWeek}
          onBack={() => {
            setRunWeek('');
            if (typeof window !== 'undefined') {
              window.history.pushState({ page: 'week-reconciliation' }, '', '/week-reconciliation');
            }
          }}
          onNavigate={onNavigate}
          onOpenRemittance={() => onNavigate?.('courier-settlements')}
        />
      ) : null}

      {showWizardShell && !inRun && reconUnavailable ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
          <p className="font-medium">Week list could not load</p>
          <p className="mt-1 text-amber-900/80">
            The guided Rideshare / Delivery desk is still here — retry, or open classic fuel/tolls
            below if you only need those lanes.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                void reconQuery.refetch();
              }}
            >
              Retry week list
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setClassicMode(true)}>
              Open classic fuel/tolls
            </Button>
          </div>
        </div>
      ) : null}

      {showWizardShell && !inRun && !reconUnavailable ? (
        <ReconWeekLanding
          weeks={reconWeeks}
          loading={reconQuery.isLoading}
          kpis={reconKpis}
          deskLine={deskLine}
          onOpenWeek={openRunWeek}
        />
      ) : null}

      {(!wizardEnabled || classicMode) && (
        <Tabs
          value={hubTab}
          onValueChange={(v) => setHubTab(v as WeekReconciliationHubTab)}
          className="space-y-4"
        >
          <TabsList className="h-auto flex-wrap gap-1">
            {canFuel ? <TabsTrigger value="fuel">Fuel</TabsTrigger> : null}
            {canTolls ? <TabsTrigger value="tolls">Tolls</TabsTrigger> : null}
          </TabsList>

          {canFuel ? (
            <TabsContent value="fuel" className="mt-0 focus-visible:outline-none">
              <Suspense
                fallback={
                  <div className="flex h-40 items-center justify-center text-sm text-slate-500">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Loading fuel reconciliation…
                  </div>
                }
              >
                <FuelManagementLazy
                  embedded
                  defaultTab="reconciliation"
                  initialWeekStart={weekStart}
                  onTabChange={handleFuelTabChange}
                  onViewDriverLedger={onViewDriverLedger}
                />
              </Suspense>
            </TabsContent>
          ) : null}

          {canTolls ? (
            <TabsContent value="tolls" className="mt-0 focus-visible:outline-none">
              <Suspense
                fallback={
                  <div className="flex h-40 items-center justify-center text-sm text-slate-500">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Loading toll reconciliation…
                  </div>
                }
              >
                <TollReconciliationLazy
                  embedded
                  initialWeekStart={weekStart}
                  focusVehicleId={tollFocus?.vehicleId}
                  focusDriverId={tollFocus?.driverId}
                  focusVehicleLabel={tollFocus?.vehicleLabel}
                />
              </Suspense>
            </TabsContent>
          ) : null}
        </Tabs>
      )}
    </div>
  );
}
