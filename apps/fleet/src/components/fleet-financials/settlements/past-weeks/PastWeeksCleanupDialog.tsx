import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PAST_WEEKS_CLOSE } from '@roam/finance-core';
import { toast } from 'sonner';
import { SettlementCommandApiError, settlementCommandsApi } from '../../../../services/settlementCommandsApi';
import { weekCloseApi } from '../../../../services/weekCloseApi';
import {
  cleanupProgress,
  legacyFooter,
  outlookSentence,
  chosenWriteOffSize,
  openCloseWeeksFromStatus,
  PAST_WEEK_STEP_TITLES,
} from '../../../../utils/pastWeeksCleanupCopy';
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '../../../ui/responsive-dialog';
import { AllDoneStep } from './AllDoneStep';
import { CloseWeeksStep } from './CloseWeeksStep';
import { FuelCorrectionsStep } from './FuelCorrectionsStep';
import { MissingPaymentsStep } from './MissingPaymentsStep';
import { OlderWeeksStep } from './OlderWeeksStep';
import { PastWeeksStepper } from './PastWeeksStepper';

type Choice = 'carry' | 'write_off';
type StepId = 1 | 2 | 3 | 4;

const STATUS_KEY = ['past-weeks-cleanup-status'] as const;

export function PastWeeksCleanupDialog({
  open,
  initialStep,
  driverId,
  driverName,
  nameFor,
  onOpenChange,
  onOpenCloseWeek,
}: {
  open: boolean;
  initialStep: StepId;
  driverId: string;
  driverName: string;
  nameFor: (driverId: string) => string;
  onOpenChange: (open: boolean) => void;
  onOpenCloseWeek: (weekKey: string) => void;
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState<StepId>(initialStep);
  const [finished, setFinished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [choice, setChoice] = useState<Record<string, Choice>>({});
  const [reason, setReason] = useState<Record<string, string>>({});
  const [writeOffAmount, setWriteOffAmount] = useState<Record<string, string>>({});
  const [keptSnapshot, setKeptSnapshot] = useState<Array<{ week: string; amount: number }>>([]);
  const [pickedStep, setPickedStep] = useState(false);

  const legacyQuery = useQuery({
    queryKey: ['past-weeks-legacy'],
    queryFn: () => settlementCommandsApi.legacyWeeks({ confirm: false }),
    enabled: open,
  });
  const correctionsQuery = useQuery({
    queryKey: ['past-weeks-corrections', driverId],
    queryFn: () => settlementCommandsApi.fuelShareCorrections({ confirm: false, driverId: driverId || undefined }),
    enabled: open,
  });
  const statusQuery = useQuery({
    queryKey: STATUS_KEY,
    queryFn: () => settlementCommandsApi.pastWeeksStatus(),
    enabled: open,
    retry: false,
  });
  const statusMissing = statusQuery.isError
    && statusQuery.error instanceof SettlementCommandApiError
    && statusQuery.error.status === 404;
  const serverLive = statusQuery.data?.partialWriteOff === true;
  const closedQuery = useQuery({
    queryKey: ['past-weeks-closed', 2026],
    queryFn: () => weekCloseApi.listClosed(2026).catch(() => []),
    enabled: open && statusMissing,
  });
  const resolvedDriverId = driverId
    || legacyQuery.data?.weeks?.[0]?.driverId
    || correctionsQuery.data?.lines?.[0]?.driverId
    || '';
  const payoutQuery = useQuery({
    queryKey: ['past-weeks-payout', resolvedDriverId],
    queryFn: () => settlementCommandsApi.payoutBackfill({ confirm: false, driverId: resolvedDriverId }),
    enabled: open && Boolean(resolvedDriverId),
  });

  useEffect(() => {
    if (!open) {
      setPickedStep(false);
      return;
    }
    setStep(initialStep);
    setFinished(false);
  }, [open, initialStep]);

  const weeks = legacyQuery.data?.weeks ?? [];
  const legacyWeeks = legacyQuery.data?.weeks;
  useEffect(() => {
    if (!legacyWeeks || legacyWeeks.length === 0) return;
    setChoice((prev) => {
      const next = { ...prev };
      for (const week of legacyWeeks) next[week.week] = next[week.week] || 'carry';
      return next;
    });
    setKeptSnapshot(legacyWeeks.map((week) => ({ week: week.week, amount: week.amount })));
  }, [legacyWeeks]);

  const lines = correctionsQuery.data?.lines || [];
  const oct12 = correctionsQuery.data?.oct12 || null;
  const payoutsPosted = Boolean(payoutQuery.data?.alreadyPosted || statusQuery.data?.alreadyPosted);
  const closedKeys = useMemo(
    () => new Set((closedQuery.data || []).map((week) => String(week.weekKey).slice(0, 10))),
    [closedQuery.data],
  );
  const previewOpenWeeks = PAST_WEEKS_CLOSE.filter((week) => !closedKeys.has(week));
  const olderDone = legacyQuery.isSuccess && weeks.length === 0;
  const closeDone = olderDone && closedQuery.isSuccess && previewOpenWeeks.length === 0;
  const correctionsDonePreview = closeDone && correctionsQuery.isSuccess && lines.length === 0 && !oct12;
  const previewProgress: 1 | 2 | 3 | 4 | 5 = !olderDone
    ? 1
    : !closeDone
      ? 2
      : !correctionsDonePreview
        ? 3
        : !payoutsPosted
          ? 4
          : 5;
  const openCloseWeeks = statusQuery.data
    ? openCloseWeeksFromStatus(statusQuery.data)
    : previewOpenWeeks;
  const progress = statusQuery.data
    ? cleanupProgress(statusQuery.data.step, Boolean(statusQuery.data.complete))
    : previewProgress;
  const correctionsDone = statusQuery.data ? progress > 3 : correctionsDonePreview;
  const loading = (!statusMissing && statusQuery.isLoading)
    || legacyQuery.isLoading
    || correctionsQuery.isLoading
    || (statusMissing && closedQuery.isLoading)
    || (Boolean(resolvedDriverId) && payoutQuery.isLoading);
  const failed = (!statusMissing && statusQuery.isError)
    || legacyQuery.isError
    || correctionsQuery.isError
    || (Boolean(resolvedDriverId) && payoutQuery.isError);

  useEffect(() => {
    if (!open || pickedStep || loading || failed) return;
    setStep(progress === 5 ? 4 : progress);
  }, [open, pickedStep, loading, failed, progress]);

  const outlookSource = keptSnapshot.length ? keptSnapshot : weeks;
  const actions = outlookSource.map((week) => choice[week.week] || 'carry');
  const writeOffSizes = outlookSource.map((week) => chosenWriteOffSize(week.amount, writeOffAmount[week.week]));
  const outlookWeeks = outlookSource;
  const lookedUpName = resolvedDriverId ? nameFor(resolvedDriverId) : '';
  const outlookName = lookedUpName || (driverName && driverName !== 'Driver' ? driverName : '') || 'Driver';
  const historyNet = Number(correctionsQuery.data?.net) || 0;
  const outlook = correctionsQuery.isSuccess && outlookWeeks.length > 0 ? (
    <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
      {outlookSentence({
        weeks: outlookWeeks,
        actions,
        writeOffAmounts: writeOffSizes,
        correctionHistoryNet: historyNet,
        driverName: outlookName,
      })}
    </p>
  ) : null;

  const refresh = async () => {
    await Promise.all([
      legacyQuery.refetch(),
      correctionsQuery.refetch(),
      statusQuery.refetch(),
      statusMissing ? closedQuery.refetch() : Promise.resolve(),
      resolvedDriverId ? payoutQuery.refetch() : Promise.resolve(),
      qc.invalidateQueries({ queryKey: STATUS_KEY }),
    ]);
  };

  const confirmOlder = async () => {
    if (!serverLive) return;
    setBusy(true);
    try {
      await settlementCommandsApi.legacyWeeks({
        confirm: true,
        choices: weeks.map((week) => ({
          week: week.week,
          action: choice[week.week] || 'carry',
          reason: reason[week.week],
          amount: (choice[week.week] || 'carry') === 'write_off'
            ? chosenWriteOffSize(week.amount, writeOffAmount[week.week])
            : undefined,
        })),
      });
      toast.success('Older weeks were posted onto the open week.');
      await refresh();
      setStep(2);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not post older weeks');
    } finally {
      setBusy(false);
    }
  };

  const confirmCorrections = async () => {
    if (!serverLive) return;
    setBusy(true);
    try {
      await settlementCommandsApi.fuelShareCorrections({ confirm: true, driverId: resolvedDriverId || undefined });
      toast.success('Corrections were posted onto the open week.');
      await refresh();
      setStep(4);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not post corrections');
    } finally {
      setBusy(false);
    }
  };

  const confirmPayouts = async () => {
    if (!resolvedDriverId || !serverLive) return;
    setBusy(true);
    try {
      await settlementCommandsApi.payoutBackfill({ confirm: true, driverId: resolvedDriverId });
      toast.success('Missing payments were recorded.');
      await refresh();
      setFinished(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not record payments');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-2xl">
        <ResponsiveDialogHeader className="space-y-3 border-b border-slate-100 px-4 py-4">
          <ResponsiveDialogTitle>Past-week clean-up for {outlookName}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription className="sr-only">
            Four steps. Nothing is posted until you confirm that step.
          </ResponsiveDialogDescription>
          <PastWeeksStepper
            step={step}
            progress={progress}
            onSelect={(next) => {
              setPickedStep(true);
              setFinished(false);
              setStep(next);
            }}
          />
        </ResponsiveDialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {!loading && !serverLive ? (
            <p className="mb-3 text-sm text-amber-900">This update isn't live yet. Nothing was posted.</p>
          ) : null}
          {loading ? <p className="text-sm text-slate-500">Loading…</p> : null}
          {failed ? (
            <p className="text-sm text-amber-900">Past-week clean-up couldn't load. Close this and try again.</p>
          ) : null}
          {!loading && !failed && finished ? <AllDoneStep driverName={outlookName} /> : null}
          {!loading && !failed && !finished && step === 1 ? (
            <OlderWeeksStep
              weeks={weeks}
              nameFor={(id) => nameFor(id) || outlookName}
              choice={choice}
              reason={reason}
              writeOffAmount={writeOffAmount}
              onChoice={(week, next) => {
                setChoice((prev) => ({ ...prev, [week]: next }));
                if (next === 'write_off' && !writeOffAmount[week]) {
                  const row = weeks.find((item) => item.week === week);
                  if (row) {
                    setWriteOffAmount((prev) => ({ ...prev, [week]: Math.abs(row.amount).toFixed(2) }));
                  }
                }
              }}
              onReason={(week, value) => setReason((prev) => ({ ...prev, [week]: value }))}
              onWriteOffAmount={(week, value) => setWriteOffAmount((prev) => ({ ...prev, [week]: value }))}
              busy={busy}
              footer={legacyFooter({
                weeks,
                actions: weeks.map((week) => choice[week.week] || 'carry'),
                writeOffAmounts: weeks.map((week) => chosenWriteOffSize(week.amount, writeOffAmount[week.week])),
                driverName: outlookName,
              })}
              outlook={outlook}
              postsEnabled={serverLive}
              onPost={() => void confirmOlder()}
            />
          ) : null}
          {!loading && !failed && !finished && step === 2 ? (
            <CloseWeeksStep
              openWeeks={openCloseWeeks}
              onCloseNext={(weekKey) => {
                onOpenChange(false);
                onOpenCloseWeek(weekKey);
              }}
            />
          ) : null}
          {!loading && !failed && !finished && step === 3 ? (
            <FuelCorrectionsStep
              lines={lines}
              oct12={oct12}
              driverName={outlookName}
              matchesAudit={Boolean(correctionsQuery.data?.matchesAudit)}
              reason={correctionsQuery.data?.reason || ''}
              landingWeek={correctionsQuery.data?.landingWeek}
              busy={busy}
              done={correctionsDone}
              outlook={outlook}
              postsEnabled={serverLive}
              onPost={() => void confirmCorrections()}
            />
          ) : null}
          {!loading && !failed && !finished && step === 4 ? (
            <MissingPaymentsStep
              payouts={payoutQuery.data?.payouts || []}
              june15={payoutQuery.data?.june15Payment || null}
              driverName={outlookName}
              ready={Boolean(payoutQuery.data?.ready)}
              alreadyPosted={payoutsPosted}
              stillOffWeek={payoutQuery.data?.stillOff?.[0]?.week || null}
              busy={busy}
              postsEnabled={serverLive}
              onPost={() => void confirmPayouts()}
            />
          ) : null}
          {!loading && !failed && !finished ? (
            <p className="sr-only">{PAST_WEEK_STEP_TITLES[step]}</p>
          ) : null}
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
