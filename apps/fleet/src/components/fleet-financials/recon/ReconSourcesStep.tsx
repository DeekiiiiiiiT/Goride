import React, { useState } from 'react';
import { AlertCircle, Bell, CheckCircle2, Loader2, UploadCloud } from 'lucide-react';
import { roamFuelExternalCopy, weekDayKeys } from '@roam/finance-core';
import type { ReconRunPayload, ReconRunSource } from '../../../services/reconApi';
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
import { BulkImportTollTransactionsModal } from '../../vehicles/BulkImportTollTransactionsModal';
import { CloseWeekUberReimportDialog } from '../CloseWeekUberReimportDialog';
import { FuelCardSelfUploader } from './FuelCardSelfUploader';
import { IndriveUploadDialog } from './IndriveUploadDialog';
import { cn } from '../../ui/utils';

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

function CoverageMini({
  weekKey,
  coverage,
}: {
  weekKey: string;
  coverage: Record<string, string>;
}) {
  const keys = weekDayKeys(weekKey);
  return (
    <div className="flex gap-0.5" aria-hidden>
      {keys.map((d) => {
        const v = coverage[d] ?? 'missing';
        const ok = v === 'covered' || v === 'zero_attested';
        return (
          <span
            key={d}
            className={cn('h-2.5 w-2.5 rounded-sm border', ok ? 'bg-emerald-400 border-emerald-500' : 'bg-slate-100')}
          />
        );
      })}
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
  canUploadExternalSources = false,
  canWaive = false,
}: {
  source: ReconRunSource;
  weekKey: string;
  onUpload?: (sourceId: string) => void;
  onAttestNone?: (sourceId: string) => void;
  onWaive?: (sourceId: string) => void;
  onRemindRoam?: (sourceId: string) => void;
  remindBusy?: boolean;
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
          ) : null}
          {showUpload ? (
            <Button type="button" size="sm" variant="default" onClick={() => onUpload!(source.id)}>
              <UploadCloud className="mr-1.5 h-4 w-4" />
              {uploadLabel}
            </Button>
          ) : null}
          {source.requirement !== 'not_applicable' && onAttestNone && !roamWait ? (
            <Button type="button" size="sm" variant="outline" onClick={() => onAttestNone(source.id)}>
              No activity this week
            </Button>
          ) : null}
          {showWaive ? (
            <Button type="button" size="sm" variant="outline" onClick={() => onWaive!(source.id)}>
              Waive (approver)
            </Button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function ReconSourcesStep({
  run,
  onRefresh,
}: {
  run: ReconRunPayload;
  onRefresh: () => void;
}) {
  const { can } = usePermissions();
  const canUploadExternalSources = can('recon.external_sources');
  const canWaive = can('recon.approve');
  const weekKey = run.run.weekKey;
  const [tollModalOpen, setTollModalOpen] = useState(false);
  const [tollMode, setTollMode] = useState<'usage' | 'topup'>('usage');
  const [fuelModalOpen, setFuelModalOpen] = useState(false);
  const [fuelSourceId, setFuelSourceId] = useState<'fuel_card_self' | 'fuel_card_roam'>('fuel_card_self');
  const [uberOpen, setUberOpen] = useState(false);
  const [indriveOpen, setIndriveOpen] = useState(false);
  const [attestSourceId, setAttestSourceId] = useState<string | null>(null);
  const [attestReason, setAttestReason] = useState('');
  const [attestBusy, setAttestBusy] = useState(false);
  const [waiveSourceId, setWaiveSourceId] = useState<string | null>(null);
  const [waiveReason, setWaiveReason] = useState('');
  const [waiveBusy, setWaiveBusy] = useState(false);
  const [remindSourceId, setRemindSourceId] = useState<string | null>(null);

  const applicable = run.sources.filter((s) => s.requirement !== 'not_applicable');

  const remindRoam = async (sourceId: string) => {
    setRemindSourceId(sourceId);
    try {
      const { requestExternalSource } = await import('../../../services/reconApi');
      await requestExternalSource(run.run.serviceLine as 'rideshare', weekKey, sourceId, {
        expectedVersion: run.run.version,
      });
      onRefresh();
    } finally {
      setRemindSourceId(null);
    }
  };

  const openUpload = (sourceId: string) => {
    if (sourceId === 'toll_usage' || sourceId === 'toll_topup') {
      setTollMode(sourceId === 'toll_topup' ? 'topup' : 'usage');
      setTollModalOpen(true);
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

  const submitAttest = async () => {
    if (!attestSourceId || !attestReason.trim()) return;
    setAttestBusy(true);
    try {
      const { attestSourceNone } = await import('../../../services/reconApi');
      await attestSourceNone(run.run.serviceLine as 'rideshare', weekKey, attestSourceId, {
        days: weekDayKeys(weekKey),
        reason: attestReason.trim(),
        expectedVersion: run.run.version,
      });
      setAttestSourceId(null);
      setAttestReason('');
      onRefresh();
    } finally {
      setAttestBusy(false);
    }
  };

  const submitWaive = async () => {
    if (!waiveSourceId || !waiveReason.trim()) return;
    setWaiveBusy(true);
    try {
      const { waiveSource } = await import('../../../services/reconApi');
      await waiveSource(run.run.serviceLine as 'rideshare', weekKey, waiveSourceId, {
        reason: waiveReason.trim(),
        expectedVersion: run.run.version,
      });
      setWaiveSourceId(null);
      setWaiveReason('');
      onRefresh();
    } finally {
      setWaiveBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Upload or confirm each input for week of {weekKey}. Required items must be complete before
        toll and fuel review unlocks.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {applicable.map((source) => (
          <ReconSourceCard
            key={source.id}
            source={source}
            weekKey={weekKey}
            onUpload={openUpload}
            onAttestNone={(id) => setAttestSourceId(id)}
            onWaive={(id) => setWaiveSourceId(id)}
            onRemindRoam={(id) => void remindRoam(id)}
            remindBusy={remindSourceId === source.id}
            canUploadExternalSources={canUploadExternalSources}
            canWaive={canWaive}
          />
        ))}
      </div>

      {uberOpen ? (
        <CloseWeekUberReimportDialog
          open={uberOpen}
          onOpenChange={setUberOpen}
          weekLabel={weekKey}
          weekKey={weekKey}
          onImported={async () => {
            onRefresh();
          }}
        />
      ) : null}

      {indriveOpen ? (
        <IndriveUploadDialog
          open={indriveOpen}
          onOpenChange={setIndriveOpen}
          weekLabel={weekKey}
          weekKey={weekKey}
          onImported={async () => {
            onRefresh();
          }}
        />
      ) : null}

      <BulkImportTollTransactionsModal
        isOpen={tollModalOpen}
        onClose={() => setTollModalOpen(false)}
        mode={tollMode}
        weekKey={weekKey}
        onSuccess={() => {
          setTollModalOpen(false);
          onRefresh();
        }}
      />

      <FuelCardSelfUploader
        isOpen={fuelModalOpen}
        onClose={() => setFuelModalOpen(false)}
        weekKey={weekKey}
        sourceId={fuelSourceId}
        onSuccess={() => {
          setFuelModalOpen(false);
          onRefresh();
        }}
      />

      <Dialog open={!!attestSourceId} onOpenChange={(o) => !o && setAttestSourceId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>No activity attestation</DialogTitle>
            <DialogDescription>
              Confirm there was no activity for this source on any day this week. Approvers see this
              at close.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="recon-attest-reason">Reason</Label>
            <Textarea
              id="recon-attest-reason"
              value={attestReason}
              onChange={(e) => setAttestReason(e.target.value)}
              placeholder="e.g. Fleet parked for maintenance all week"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAttestSourceId(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={attestBusy || !attestReason.trim()}
              onClick={() => void submitAttest()}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
