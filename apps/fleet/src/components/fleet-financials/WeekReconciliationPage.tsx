/**
 * Business Finance → Week Reconciliation
 * Hub for Fuel + Toll recon lanes (Close Week Review targets).
 */
import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { BusinessFinanceDeskChrome } from '../business-finance/BusinessFinanceDeskChrome';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { usePermissions } from '../../hooks/usePermissions';

const FuelManagementLazy = lazy(() =>
  import('../../pages/FuelManagement').then((m) => ({ default: m.FuelManagement })),
);
const TollReconciliationLazy = lazy(() =>
  import('../../pages/TollReconciliation').then((m) => ({ default: m.TollReconciliation })),
);

export type WeekReconciliationHubTab = 'fuel' | 'tolls';

type WeekReconNavigateOpts =
  | { startYmd: string; endYmd?: string }
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
  const { canView } = usePermissions();
  const canFuel = canView('fuel-reconciliation');
  const canTolls = canView('toll-tags');

  const defaultTab = useMemo<WeekReconciliationHubTab>(() => {
    if (initialHubTab === 'fuel' && canFuel) return 'fuel';
    if (initialHubTab === 'tolls' && canTolls) return 'tolls';
    if (canFuel) return 'fuel';
    return 'tolls';
  }, [initialHubTab, canFuel, canTolls]);

  const [hubTab, setHubTab] = useState<WeekReconciliationHubTab>(defaultTab);
  const [weekStart, setWeekStart] = useState<string | undefined>(
    initialWeekStart || undefined,
  );

  useEffect(() => {
    if (!initialHubTab && !initialWeekStart && !tollFocus) return;
    if (initialHubTab === 'fuel' && canFuel) setHubTab('fuel');
    else if (initialHubTab === 'tolls' && canTolls) setHubTab('tolls');
    if (initialWeekStart) setWeekStart(initialWeekStart);
    onHintsConsumed?.();
  }, [initialHubTab, initialWeekStart, tollFocus, canFuel, canTolls, onHintsConsumed]);

  // If permission drops the active tab, flip to the other available tab
  useEffect(() => {
    if (hubTab === 'fuel' && !canFuel && canTolls) setHubTab('tolls');
    if (hubTab === 'tolls' && !canTolls && canFuel) setHubTab('fuel');
  }, [hubTab, canFuel, canTolls]);

  const handleFuelTabChange = (tab: string) => {
    // Leave hub for other fuel desks (cards / logs / config / review queue)
    onNavigate?.(`fuel-${tab}`);
  };

  if (!canFuel && !canTolls) {
    return (
      <div className="mx-auto max-w-[1400px] space-y-6 p-4 sm:p-6">
        <BusinessFinanceDeskChrome
          deskLabel="Week Reconciliation"
          onBack={onBackToBusinessFinance}
        />
        <p className="text-sm text-slate-500">
          You do not have permission to open fuel or toll reconciliation.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-4 sm:p-6">
      <BusinessFinanceDeskChrome
        deskLabel="Week Reconciliation"
        onBack={onBackToBusinessFinance}
      />

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
    </div>
  );
}
