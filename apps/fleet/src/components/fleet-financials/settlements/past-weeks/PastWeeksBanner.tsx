import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { SettlementCommandApiError, settlementCommandsApi } from '../../../../services/settlementCommandsApi';
import { bannerLabel, keptRepairCopy, PAST_WEEKS_NOT_LIVE } from '../../../../utils/pastWeeksCleanupCopy';
import {
  ackPastWeeks,
  isPastWeeksAcked,
  setPastWeeksReturn,
  peekPastWeeksReturn,
  takePastWeeksReturn,
} from '../../../../utils/pastWeeksCleanupSession';
import { Button } from '../../../ui/button';
import { PastWeeksCleanupDialog } from './PastWeeksCleanupDialog';

type StepId = 1 | 2 | 3 | 4;

export function PastWeeksBanner({
  hubTab,
  driverNameFor,
  onOpenCloseWeek,
}: {
  hubTab: string;
  driverNameFor: (driverId: string) => string;
  onOpenCloseWeek: (weekKey: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [initialStep, setInitialStep] = useState<StepId>(1);
  const [hidden, setHidden] = useState(false);
  const [repairBusy, setRepairBusy] = useState(false);
  const statusQuery = useQuery({
    queryKey: ['past-weeks-cleanup-status'],
    queryFn: () => settlementCommandsApi.pastWeeksStatus(),
    staleTime: 15_000,
  });

  useEffect(() => {
    if (hubTab !== 'cash') return;
    if (statusQuery.data?.partialWriteOff !== true) return;
    const step = takePastWeeksReturn();
    if (step == null) return;
    setInitialStep(step as StepId);
    setOpen(true);
  }, [hubTab, statusQuery.data?.partialWriteOff]);

  const status = statusQuery.data;
  const namedDriver = status?.keptRepair?.driverId || status?.driverId || '';
  const driverName = namedDriver ? driverNameFor(namedDriver) || 'Driver' : 'Driver';

  const openOn = (step: StepId) => {
    if (status?.partialWriteOff !== true) return;
    setInitialStep(step);
    setOpen(true);
  };

  const runRepair = async (action: 'restore' | 'leave') => {
    if (!status?.keptRepair || status.partialWriteOff !== true) return;
    setRepairBusy(true);
    try {
      await settlementCommandsApi.legacyKeptRepair({
        confirm: true,
        action,
        driverId: status.keptRepair.driverId || status.driverId,
      });
      toast.success(action === 'restore' ? 'The two halves are on the open week.' : 'The full write-off stays.');
      await statusQuery.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update the two half weeks');
    } finally {
      setRepairBusy(false);
    }
  };

  const undeployed = statusQuery.isError
    && statusQuery.error instanceof SettlementCommandApiError
    && statusQuery.error.status === 404;
  const serverLive = status?.partialWriteOff === true;
  const acked = Boolean(status?.complete && isPastWeeksAcked(status.driverId));
  const repair = serverLive ? status?.keptRepair : null;
  const showCleanup = !hidden && (
    Boolean(status && status.applicable && !acked && !status.complete)
    || Boolean(status?.complete && !acked)
  );

  // Keep the overlay mounted if it is open. A status refetch must not close it.
  if (!open && statusQuery.isLoading) return null;
  if (!open && !showCleanup && !repair && !undeployed && !statusQuery.isError && peekPastWeeksReturn() == null) {
    return null;
  }

  if (!open && (undeployed || (status && !serverLive))) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
        <p>{PAST_WEEKS_NOT_LIVE}</p>
      </div>
    );
  }

  if (!open && statusQuery.isError && !undeployed) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
        <p>Past-week clean-up couldn't load.</p>
        <Button type="button" variant="outline" className="h-11 bg-white" onClick={() => void statusQuery.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const step = !status || status.step === 'done' ? null : status.step;

  return (
    <>
      {repair ? (
        <div className="mb-2 space-y-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
          <p>{keptRepairCopy(driverName, repair.weeks, repair.net)}</p>
          {repair.reason ? <p>{repair.reason}</p> : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              className="h-11"
              disabled={repairBusy || !repair.canRestore}
              onClick={() => void runRepair('restore')}
            >
              Put the halves back
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 bg-white"
              disabled={repairBusy}
              onClick={() => void runRepair('leave')}
            >
              Leave the full write-off
            </Button>
          </div>
        </div>
      ) : null}
      {showCleanup && status?.complete ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
          <p className="font-medium">Clean-up complete</p>
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-md text-emerald-900"
            aria-label="Dismiss clean-up"
            onClick={() => {
              ackPastWeeks(status.driverId);
              setHidden(true);
            }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : showCleanup ? (
        <div className="flex flex-col gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-medium">{step ? bannerLabel(driverName, step) : 'Past-week clean-up'}</p>
          <Button type="button" className="h-11 shrink-0" disabled={!serverLive} onClick={() => openOn(step || 1)}>
            Continue
          </Button>
        </div>
      ) : null}
      <PastWeeksCleanupDialog
        open={open}
        initialStep={initialStep}
        driverId={status?.driverId || ''}
        driverName={driverName}
        nameFor={driverNameFor}
        onOpenChange={setOpen}
        onOpenCloseWeek={(weekKey) => {
          setPastWeeksReturn(2);
          onOpenCloseWeek(weekKey);
        }}
      />
    </>
  );
}
