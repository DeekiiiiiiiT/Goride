import React, { useCallback, useRef, useState } from 'react';
import { AlertCircle, Bell, CheckCircle2, Info, Loader2, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';
import { roamFuelExternalCopy, weekDayKeys } from '@roam/finance-core';
import { ReconApiError, type ReconRunPayload, type ReconRunSource } from '../../../services/reconApi';
import { RECON_WEEK_CHANGED_EVENT } from '../../../services/reconWeekContext';

type RefreshRun = (payload?: ReconRunPayload) => void | Promise<void>;
import { usePermissions } from '../../../hooks/usePermissions';
import { Button } from '../../ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../../ui/dialog';
import { Textarea } from '../../ui/textarea';
import { Label } from '../../ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/tooltip';
import { CloseWeekUberReimportDialog } from '../CloseWeekUberReimportDialog';
import { FuelCardSelfUploader } from './FuelCardSelfUploader';
import { IndriveUploadDialog } from './IndriveUploadDialog';
import { cn } from '../../ui/utils';
import { api } from '../../../services/api';
import { useTollV2ImportReports } from './tolls-v2/step1/useTollV2ImportReports';
import { ReconTollV2SourceEnhancement } from './tolls-v2/step1/ReconTollV2SourceEnhancement';
import { readProblemRows, tollFilesSummary } from './tolls-v2/step1/tollV2ImportReportFormat';
import type { TollV2ImportReport, TollV2ImportReportRow } from './tolls-v2/step1/tollV2ImportTypes';
import { TollV2FixDriverDialog } from './tolls-v2/step1/dialogs/TollV2FixDriverDialog';
import { TollV2WhichCarDialog } from './tolls-v2/step1/dialogs/TollV2WhichCarDialog';
import { TollV2WhatWasReadDialog } from './tolls-v2/step1/dialogs/TollV2WhatWasReadDialog';
import {
  countRowsFromV2ImportResponse,
  registerTollV2WithRecon,
  type TollV2ReconSourceId,
} from '../../../utils/registerTollV2WithRecon';

function addBusyId(prev: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(prev);
  next.add(id);
  return next;
}

function removeBusyId(prev: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(prev);
  next.delete(id);
  return next;
}

function toastReconSourceError(err: unknown, onRefresh: RefreshRun, fallback: string) {
  if (err instanceof ReconApiError && err.status === 409) {
    // Done-test 9: nothing is saved; the week page shows "This week changed — Reload week".
    window.dispatchEvent(
      new CustomEvent(RECON_WEEK_CHANGED_EVENT, { detail: { code: /closed/i.test(err.message) ? 'WEEK_CLOSED' : 'WEEK_CHANGED' } }),
    );
    return;
  }
  const msg = err instanceof Error ? err.message : fallback;
  toast.error(msg);
}

function ActionTip({
  label,
  children,
}: {
  label: string;
  children: React.ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs text-left leading-relaxed">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

const BLOCKING = new Set(['missing', 'partial', 'waiting_external']);

const FLEET_UPLOAD_SOURCES = new Set([
  'toll_usage',
  'toll_topup',
  'fuel_card_self',
  'uber_bundle',
  'indrive_trips',
]);

function statusTone(status: string): string {
  if (status === 'received' || status === 'not_applicable' || status === 'attested_none') {
    return 'border-emerald-200 bg-emerald-50/80';
  }
  if (status === 'waived') return 'border-amber-200 bg-amber-50/80';
  if (BLOCKING.has(status)) return 'border-rose-200 bg-rose-50/60';
  return 'border-slate-200 bg-white';
}

/** Days still empty (gray) — only these should get attest_none. */
export function uncoveredDaysForSource(
  weekKey: string,
  coverage: Record<string, string> | undefined,
): string[] {
  return weekDayKeys(weekKey).filter((d) => {
    const v = coverage?.[d] ?? 'missing';
    return v !== 'covered' && v !== 'zero_attested';
  });
}

/** Short weekday labels (Mon, Tue…) for UTC YMD keys. */
export function formatUncoveredDayLabels(days: string[]): string {
  return days
    .map((ymd) => {
      const [y, m, d] = ymd.split('-').map(Number);
      if (!y || !m || !d) return ymd;
      return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', {
        weekday: 'short',
        timeZone: 'UTC',
      });
    })
    .join(', ');
}

export function attestNoneButtonLabel(uncoveredDays: string[]): string {
  if (uncoveredDays.length === 0) return 'No empty days';
  if (uncoveredDays.length === 7) return 'No activity on empty days (all 7)';
  const labels = formatUncoveredDayLabels(uncoveredDays);
  if (uncoveredDays.length <= 3) return `No activity on ${labels}`;
  return `No activity on ${uncoveredDays.length} empty days`;
}

function CoverageMini({
  weekKey,
  coverage,
}: {
  weekKey: string;
  coverage: Record<string, string>;
}) {
  const keys = weekDayKeys(weekKey);
  return (
    <div className="space-y-0.5" aria-hidden>
      <div className="flex gap-0.5">
        {keys.map((d) => {
          const [y, m, day] = d.split('-').map(Number);
          const label =
            y && m && day
              ? new Date(Date.UTC(y, m - 1, day, 12)).toLocaleDateString('en-US', {
                  weekday: 'narrow',
                  timeZone: 'UTC',
                })
              : '·';
          return (
            <span key={`l-${d}`} className="w-2.5 text-center text-[9px] leading-none text-slate-400">
              {label}
            </span>
          );
        })}
      </div>
      <div className="flex gap-0.5">
        {keys.map((d) => {
          const v = coverage[d] ?? 'missing';
          const ok = v === 'covered' || v === 'zero_attested';
          return (
            <span
              key={d}
              title={`${d}: ${ok ? 'has activity' : 'empty'}`}
              className={cn(
                'h-2.5 w-2.5 rounded-sm border',
                ok ? 'bg-emerald-400 border-emerald-500' : 'bg-slate-100 border-slate-200',
              )}
            />
          );
        })}
      </div>
    </div>
  );
}

function isRoamFuelWaiting(source: ReconRunSource): boolean {
  if (source.id === 'fuel_card_roam' && source.status === 'waiting_external') return true;
  return (
    source.kind === 'external_dependency'
    && source.status === 'missing'
    && source.requirement === 'required'
  );
}

function canShowUpload(
  source: ReconRunSource,
  canUploadExternalSources: boolean,
): boolean {
  if (FLEET_UPLOAD_SOURCES.has(source.id)) return true;
  // R2-28: Roam gas card upload is staff-only (recon.external_sources).
  if (source.id === 'fuel_card_roam') return canUploadExternalSources;
  return false;
}

export function ReconSourceCard({
  source,
  weekKey,
  onUpload,
  onAttestNone,
  onWaive,
  onRemindRoam,
  remindBusy,
  attestBusy,
  canUploadExternalSources = false,
  canWaive = false,
  children,
}: {
  /** Extra content shown inside the card (toll v2 file results). */
  children?: React.ReactNode;
  source: ReconRunSource;
  weekKey: string;
  onUpload?: (sourceId: string) => void;
  onAttestNone?: (sourceId: string, days: string[]) => void;
  onWaive?: (sourceId: string) => void;
  onRemindRoam?: (sourceId: string) => void;
  remindBusy?: boolean;
  attestBusy?: boolean;
  canUploadExternalSources?: boolean;
  /** R3-09: waive is approver-only. */
  canWaive?: boolean;
}) {
  const needsAction = BLOCKING.has(source.status) || isRoamFuelWaiting(source);
  const roamWait = isRoamFuelWaiting(source);
  const roamCopy = roamWait ? roamFuelExternalCopy(weekKey) : null;
  const showUpload = needsAction && onUpload && canShowUpload(source, canUploadExternalSources);
  const showWaive =
    canWaive &&
    needsAction &&
    onWaive &&
    source.requirement === 'required' &&
    !roamWait &&
    BLOCKING.has(source.status);
  const uploadLabel =
    source.id === 'uber_bundle' || source.id === 'indrive_trips' ? 'Upload' : 'Upload statement';
  const uncoveredDays = uncoveredDaysForSource(weekKey, source.coverage);
  const attestLabel = attestNoneButtonLabel(uncoveredDays);
  const attestTip =
    uncoveredDays.length === 0
      ? 'Every day already has activity or was marked empty.'
      : `Marks only the empty (gray) days as no activity: ${formatUncoveredDayLabels(uncoveredDays)}. Green days with data are left alone.`;

  return (
    <article
      className={cn('rounded-xl border p-4 shadow-sm', statusTone(source.status))}
      data-testid={`recon-source-${source.id}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="text-sm font-semibold text-slate-900">{source.label}</h3>
          {roamCopy ? (
            <p className={cn('text-xs font-medium', roamCopy.isOverdue ? 'text-amber-800' : 'text-slate-700')}>
              {roamCopy.statusLine}
            </p>
          ) : (
            <p className="text-xs capitalize text-slate-600">{source.status.replace(/_/g, ' ')}</p>
          )}
          <CoverageMini weekKey={weekKey} coverage={source.coverage ?? {}} />
        </div>
        {needsAction ? (
          <AlertCircle className="h-5 w-5 shrink-0 text-rose-600" aria-hidden />
        ) : (
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
        )}
      </div>
      {needsAction ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {roamWait && onRemindRoam ? (
            <ActionTip label="Sends a reminder that this week’s Roam Fuels / Gas Card statement is still outstanding.">
              <Button
                type="button"
                size="sm"
                variant="default"
                disabled={remindBusy}
                onClick={() => onRemindRoam(source.id)}
              >
                {remindBusy ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Bell className="mr-1.5 h-4 w-4" />
                )}
                Remind Roam
              </Button>
            </ActionTip>
          ) : null}
          {showUpload ? (
            <ActionTip label={`Upload the ${source.label} file for this Monday–Sunday week so the source can be marked received.`}>
              <Button type="button" size="sm" variant="default" onClick={() => onUpload!(source.id)}>
                <UploadCloud className="mr-1.5 h-4 w-4" />
                {uploadLabel}
              </Button>
            </ActionTip>
          ) : null}
          {source.requirement !== 'not_applicable'
            && onAttestNone
            // Roam fuel card: only Roam staff (who hold the statement) can say the week had none.
            && (!roamWait || canUploadExternalSources)
            && uncoveredDays.length > 0 ? (
            <ActionTip label={attestTip}>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={attestBusy}
                onClick={() => onAttestNone(source.id, uncoveredDays)}
              >
                {attestBusy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                {attestLabel}
              </Button>
            </ActionTip>
          ) : null}
          {showWaive ? (
            <ActionTip label="Approver-only: skip this required source for the week with a written reason. Unlocks later steps without an upload; leave an audit trail as waived.">
              <Button type="button" size="sm" variant="outline" onClick={() => onWaive!(source.id)}>
                Waive (approver)
              </Button>
            </ActionTip>
          ) : null}
        </div>
      ) : null}
      {children}
    </article>
  );
}

export function ReconSourcesStep({
  run,
  onRefresh,
}: {
  run: ReconRunPayload;
  onRefresh: RefreshRun;
}) {
  const { can } = usePermissions();
  const canUploadExternalSources = can('recon.external_sources');
  const canWaive = can('recon.approve');
  const weekKey = run.run.weekKey;
  // Toll files go through the new toll upload only (the old toll import is removed).
  const importReportsQuery = useTollV2ImportReports(weekKey, true);
  const importReports = importReportsQuery.data ?? [];
  const [fuelModalOpen, setFuelModalOpen] = useState(false);
  const [fuelSourceId, setFuelSourceId] = useState<'fuel_card_self' | 'fuel_card_roam'>('fuel_card_self');
  const [uberOpen, setUberOpen] = useState(false);
  const [indriveOpen, setIndriveOpen] = useState(false);
  const [attestBusyIds, setAttestBusyIds] = useState<ReadonlySet<string>>(() => new Set());
  const [waiveSourceId, setWaiveSourceId] = useState<string | null>(null);
  const [waiveReason, setWaiveReason] = useState('');
  const [waiveBusy, setWaiveBusy] = useState(false);
  const [remindSourceId, setRemindSourceId] = useState<string | null>(null);
  const tollFileInputRef = useRef<HTMLInputElement>(null);
  const pendingTollSourceRef = useRef<TollV2ReconSourceId | null>(null);
  const [tollUploadBusy, setTollUploadBusy] = useState(false);
  const [uberTollError, setUberTollError] = useState<string | null>(null);
  const [uberTollFiles, setUberTollFiles] = useState<{
    paymentsTransaction?: File;
    tripActivity?: File;
  } | null>(null);
  const [fixedProblemKeys, setFixedProblemKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [whatReadReport, setWhatReadReport] = useState<TollV2ImportReport | null>(null);
  const [fixDriverRow, setFixDriverRow] = useState<TollV2ImportReportRow | null>(null);
  const [whichCarRow, setWhichCarRow] = useState<TollV2ImportReportRow | null>(null);
  // The reader's unknown driver / car rows from each file's latest upload (never saved: the file isn't kept).
  const readProblemsKey = `toll-v2-read-problems:${weekKey}`;
  const [readProblems, setReadProblemsState] = useState<Partial<Record<string, TollV2ImportReportRow[]>>>(() => {
    try {
      const raw = sessionStorage.getItem(readProblemsKey);
      return raw ? (JSON.parse(raw) as Partial<Record<string, TollV2ImportReportRow[]>>) : {};
    } catch {
      return {};
    }
  });
  // Kept for this browser session only (the file itself isn't kept), so a reload doesn't hide rows still to fix.
  const setReadProblems = useCallback(
    (
      update: (
        prev: Partial<Record<string, TollV2ImportReportRow[]>>,
      ) => Partial<Record<string, TollV2ImportReportRow[]>>,
    ) => {
      setReadProblemsState((prev) => {
        const next = update(prev);
        try {
          sessionStorage.setItem(readProblemsKey, JSON.stringify(next));
        } catch {
          /* storage unavailable: rows still show until the page is left */
        }
        return next;
      });
    },
    [readProblemsKey],
  );

  const applicable = run.sources.filter((s) => s.requirement !== 'not_applicable');
  const tollSummary = tollFilesSummary(applicable, importReports, readProblems);

  const runTollV2Import = useCallback(
    async (opts: {
      kind: 'tag_statement' | 'topups' | 'uber';
      sourceId: TollV2ReconSourceId;
      file: File;
      paymentsTransaction?: File;
      tripActivity?: File;
    }) => {
      const commandId = crypto.randomUUID();
      setTollUploadBusy(true);
      try {
        const res = await api.importTollFileV2({
          kind: opts.kind,
          commandId,
          file: opts.file,
          paymentsTransaction: opts.paymentsTransaction,
          tripActivity: opts.tripActivity,
        });
        const rawProblems = (res as { problems?: Parameters<typeof readProblemRows>[0] }).problems ?? [];
        const problems = readProblemRows(rawProblems);
        setReadProblems((prev) => ({ ...prev, [opts.sourceId]: problems }));
        const rowsCommitted = countRowsFromV2ImportResponse(
          res as { imports?: Array<{ rows?: number; counts?: Record<string, number> }> },
        );
        const importedSomething = ((res as { imports?: unknown[] }).imports?.length ?? 0) > 0;
        // Every row refused: the week must not count this file as received.
        // (rawProblems: the list shown on screen keeps only the fixable driver / plate rows.)
        if (!importedSomething && rawProblems.length > 0) {
          const first = rawProblems[0]?.reason ? ` First: row ${rawProblems[0].row ?? '?'} — ${rawProblems[0].reason}.` : '';
          throw new Error(
            `No rows read from ${opts.file.name} — all ${rawProblems.length} were refused.${first}`,
          );
        }
        await registerTollV2WithRecon({
          batchId: commandId,
          sourceId: opts.sourceId,
          weekKey,
          rowsCommitted,
          fileName: opts.file.name,
        });
        await importReportsQuery.refetch();
        await onRefresh();
        // The file was read again: rows fixed before this read are now in (or listed again if still wrong).
        setFixedProblemKeys(new Set());
        toast.success('Toll file read');
        setUberTollError(null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Toll import failed';
        if (opts.sourceId === 'uber_bundle') setUberTollError(msg);
        else toast.error(msg);
        throw err;
      } finally {
        setTollUploadBusy(false);
      }
    },
    [importReportsQuery, onRefresh, setReadProblems, weekKey],
  );

  const triggerTollFilePicker = (sourceId: TollV2ReconSourceId) => {
    pendingTollSourceRef.current = sourceId;
    tollFileInputRef.current?.click();
  };

  const onTollFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const sourceId = pendingTollSourceRef.current;
    e.target.value = '';
    pendingTollSourceRef.current = null;
    if (!file || !sourceId || sourceId === 'uber_bundle') return;
    const kind = sourceId === 'toll_topup' ? 'topups' : 'tag_statement';
    try {
      await runTollV2Import({ kind, sourceId, file });
    } catch {
      /* toast handled */
    }
  };

  const runUberTollFollowUp = useCallback(
    async (files: { paymentsTransaction?: File; tripActivity?: File }) => {
      setUberTollFiles(files);
      const main = files.tripActivity ?? files.paymentsTransaction;
      if (!main) return;
      try {
        await runTollV2Import({
          kind: 'uber',
          sourceId: 'uber_bundle',
          file: main,
          paymentsTransaction: files.paymentsTransaction,
          tripActivity: files.tripActivity,
        });
      } catch {
        /* uberTollError set */
      }
    },
    [runTollV2Import],
  );

  const remindRoam = async (sourceId: string) => {
    if (remindSourceId === sourceId) return;
    setRemindSourceId(sourceId);
    try {
      const { requestExternalSource } = await import('../../../services/reconApi');
      const payload = await requestExternalSource(
        run.run.serviceLine as 'rideshare',
        weekKey,
        sourceId,
        { expectedVersion: run.run.version },
      );
      setRemindSourceId(null);
      void onRefresh(payload);
    } catch (err) {
      setRemindSourceId(null);
      toastReconSourceError(err, onRefresh, 'Could not send reminder');
    }
  };

  const openUpload = (sourceId: string) => {
    if (sourceId === 'toll_usage' || sourceId === 'toll_topup') {
      triggerTollFilePicker(sourceId);
      return;
    }
    if (sourceId === 'fuel_card_self') {
      setFuelSourceId('fuel_card_self');
      setFuelModalOpen(true);
      return;
    }
    if (sourceId === 'fuel_card_roam' && canUploadExternalSources) {
      setFuelSourceId('fuel_card_roam');
      setFuelModalOpen(true);
      return;
    }
    if (sourceId === 'uber_bundle') {
      setUberOpen(true);
      return;
    }
    if (sourceId === 'indrive_trips') {
      setIndriveOpen(true);
    }
  };

  const submitAttestNone = async (sourceId: string, days: string[]) => {
    if (attestBusyIds.has(sourceId) || !days.length) return;
    setAttestBusyIds((prev) => addBusyId(prev, sourceId));
    try {
      const { attestSourceNone } = await import('../../../services/reconApi');
      const payload = await attestSourceNone(
        run.run.serviceLine as 'rideshare',
        weekKey,
        sourceId,
        {
          // Only empty (gray) days — never overwrite days that already have activity.
          days,
          reason:
            days.length === 7
              ? 'No activity this week'
              : `No activity on ${formatUncoveredDayLabels(days)}`,
          expectedVersion: run.run.version,
        },
      );
      // Clear busy as soon as POST returns; refetch only re-confirms setQueryData.
      setAttestBusyIds((prev) => removeBusyId(prev, sourceId));
      void onRefresh(payload);
    } catch (err) {
      setAttestBusyIds((prev) => removeBusyId(prev, sourceId));
      toastReconSourceError(err, onRefresh, 'Could not attest no activity');
    }
  };

  const submitWaive = async () => {
    if (!waiveSourceId || !waiveReason.trim() || waiveBusy) return;
    setWaiveBusy(true);
    try {
      const { waiveSource } = await import('../../../services/reconApi');
      const payload = await waiveSource(run.run.serviceLine as 'rideshare', weekKey, waiveSourceId, {
        reason: waiveReason.trim(),
        expectedVersion: run.run.version,
      });
      setWaiveSourceId(null);
      setWaiveReason('');
      setWaiveBusy(false);
      void onRefresh(payload);
    } catch (err) {
      setWaiveBusy(false);
      toastReconSourceError(err, onRefresh, 'Could not waive source');
    }
  };

  const uberPanel = uberOpen ? (
    <CloseWeekUberReimportDialog
      open={uberOpen}
      onOpenChange={setUberOpen}
      weekLabel={weekKey}
      weekKey={weekKey}
      onImported={async () => {
        await onRefresh();
      }}
      onUberFilesForToll={(files) => runUberTollFollowUp(files)}
    />
  ) : null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Upload or confirm each input for week of {weekKey}. Required items must be complete before
        toll and fuel review unlocks.
      </p>
      <div className={'grid gap-3 lg:grid-cols-3'}>
        <div className="flex flex-col gap-3 lg:col-span-2">
          {applicable.map((source) => (
            <div key={source.id} className="min-w-0">
              <ReconSourceCard
                source={source}
                weekKey={weekKey}
                onUpload={openUpload}
                onAttestNone={(id, days) => void submitAttestNone(id, days)}
                onWaive={(id) => setWaiveSourceId(id)}
                onRemindRoam={(id) => void remindRoam(id)}
                remindBusy={remindSourceId === source.id}
                attestBusy={attestBusyIds.has(source.id)}
                canUploadExternalSources={canUploadExternalSources}
                canWaive={canWaive}
              >
              {(
                <ReconTollV2SourceEnhancement
                  source={source}
                  reports={importReports}
                  uberTollError={source.id === 'uber_bundle' ? uberTollError : null}
                  fixedKeys={fixedProblemKeys}
                  readProblems={readProblems[source.id] ?? []}
                  onReplace={() => {
                    if (source.id === 'uber_bundle') {
                      setUberOpen(true);
                      return;
                    }
                    triggerTollFilePicker(source.id === 'toll_topup' ? 'toll_topup' : 'toll_usage');
                  }}
                  onSeeRead={(r) => setWhatReadReport(r)}
                  onFixDriver={(row) => setFixDriverRow(row)}
                  onWhichCar={(row) => setWhichCarRow(row)}
                  onRetryUberToll={
                    source.id === 'uber_bundle' && uberTollFiles
                      ? () => void runUberTollFollowUp(uberTollFiles)
                      : undefined
                  }
                  onUploadAgain={() => {
                    if (source.id === 'uber_bundle') {
                      setUberOpen(true);
                      return;
                    }
                    triggerTollFilePicker(source.id === 'toll_topup' ? 'toll_topup' : 'toll_usage');
                  }}
                />
              )}
              {source.id === 'uber_bundle' ? uberPanel : null}
              </ReconSourceCard>
            </div>
          ))}
          <p className="flex items-start gap-2 pt-1 text-xs text-[#47464c]">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Uploading the same file twice changes nothing.
          </p>
        </div>
        {tollSummary ? (
          <aside className="self-start rounded-xl border border-[#e5eeff] bg-white p-4 shadow-sm lg:col-span-1">
            <h3 className="text-sm font-semibold text-[#0b1c30]">This week&apos;s files</h3>
            <p className="mt-2 text-sm text-[#47464c]">
              {tollSummary.received} of {tollSummary.total} toll files received
            </p>
            {tollSummary.problems > 0 ? (
              <p className="mt-1 text-sm font-medium text-amber-800">
                {tollSummary.problems} {tollSummary.problems === 1 ? 'row needs' : 'rows need'} a fix
              </p>
            ) : (
              <p className="mt-1 text-sm text-emerald-800">No problems in the last read</p>
            )}
            {tollUploadBusy ? (
              <p className="mt-3 flex items-center gap-2 text-xs text-[#47464c]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Reading file…
              </p>
            ) : null}
          </aside>
        ) : null}
      </div>

      <input
        ref={tollFileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => void onTollFilePicked(e)}
      />

      {/* The Uber panel opens inside the Uber card, next to its Upload button. */}
      {(
        <>
          <TollV2WhatWasReadDialog
            open={!!whatReadReport}
            onOpenChange={(o) => !o && setWhatReadReport(null)}
            report={whatReadReport}
            onFixDriver={(row) => {
              setWhatReadReport(null);
              setFixDriverRow(row);
            }}
            onWhichCar={(row) => {
              setWhatReadReport(null);
              setWhichCarRow(row);
            }}
          />
          <TollV2FixDriverDialog
            open={!!fixDriverRow}
            onOpenChange={(o) => !o && setFixDriverRow(null)}
            problemRow={fixDriverRow}
            onSaved={() => {
              if (fixDriverRow) {
                setFixedProblemKeys((prev) => new Set(prev).add(problemKey(fixDriverRow)));
              }
              void importReportsQuery.refetch();
            }}
          />
          <TollV2WhichCarDialog
            open={!!whichCarRow}
            onOpenChange={(o) => !o && setWhichCarRow(null)}
            problemRow={whichCarRow}
            onSaved={() => {
              if (whichCarRow) {
                setFixedProblemKeys((prev) => new Set(prev).add(problemKey(whichCarRow)));
              }
              void importReportsQuery.refetch();
            }}
          />
        </>
      )}

      {indriveOpen ? (
        <IndriveUploadDialog
          open={indriveOpen}
          onOpenChange={setIndriveOpen}
          weekLabel={weekKey}
          weekKey={weekKey}
          onImported={async () => {
            await onRefresh();
          }}
        />
      ) : null}

      <FuelCardSelfUploader
        isOpen={fuelModalOpen}
        onClose={() => setFuelModalOpen(false)}
        weekKey={weekKey}
        sourceId={fuelSourceId}
        onSuccess={() => {
          setFuelModalOpen(false);
          void onRefresh();
        }}
      />

      <Dialog open={!!waiveSourceId} onOpenChange={(o) => !o && setWaiveSourceId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Waive required source</DialogTitle>
            <DialogDescription>
              Approver-only. Skips this required source for the week — record why so close can audit it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="recon-waive-reason">Reason</Label>
            <Textarea
              id="recon-waive-reason"
              value={waiveReason}
              onChange={(e) => setWaiveReason(e.target.value)}
              placeholder="e.g. Provider export delayed; using attested zero-activity days"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setWaiveSourceId(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={waiveBusy || !waiveReason.trim()}
              onClick={() => void submitWaive()}
            >
              Waive source
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function problemKey(row: TollV2ImportReportRow): string {
  return `${row.row ?? ''}:${row.ref ?? ''}:${row.status ?? ''}`;
}
