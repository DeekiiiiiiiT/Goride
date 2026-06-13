import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  Circle,
  Loader2,
  MapPin,
  Star,
  UserSearch,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ActivityPipelineItem } from '@roam/types/rides';
import { formatMoneyMinor } from '@roam/types/rides';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@roam/ui';

import { formatScheduledWhen } from '@/lib/formatScheduledWhen';
import { ridesCancelScheduled } from '@/services/ridesEdge';

const PRIMARY = '#006d43';
const PRIMARY_CONTAINER = '#00a86b';
const ERROR = '#ba1a1a';
const SHEET_ANIMATION_MS = 500;

type Props = {
  item: ActivityPipelineItem;
  onClose: () => void;
  onCancelled?: () => void;
};

function parseEstimatedFare(line: string): string | null {
  const match = line.match(/^(JMD|USD)\s+([\d.]+)\s+estimated$/i);
  if (!match) return null;
  const minor = Math.round(Number(match[2]) * 100);
  if (!Number.isFinite(minor)) return null;
  return formatMoneyMinor(minor, match[1]);
}

function formatServiceLabel(raw: string | undefined): string {
  if (!raw?.trim()) return 'ROAM';
  return raw.trim().replace(/_/g, '-').toUpperCase();
}

function isExecutiveService(vehicle: string | undefined): boolean {
  if (!vehicle) return false;
  return /executive|premium|luxury/i.test(vehicle);
}

export function ScheduledRideActivitySheet({ item, onClose, onCancelled }: Props) {
  const [cancelling, setCancelling] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const dismiss = useCallback(() => {
    setOpen(false);
    window.setTimeout(onClose, SHEET_ANIMATION_MS);
  }, [onClose]);

  const canCancel = item.status === 'scheduled';
  const pickupTime = formatScheduledWhen(item.scheduled_at) ?? '—';

  const { serviceLabel, fareLabel, policyLines } = useMemo(() => {
    const lines = item.detail_lines;
    const vehicle = lines[0];
    const fareLine = lines.find((line) => /estimated$/i.test(line));
    const policies = lines.filter(
      (line) =>
        line !== vehicle &&
        line !== fareLine &&
        !/^(JMD|USD)\s+/i.test(line),
    );

    return {
      serviceLabel: formatServiceLabel(vehicle),
      fareLabel: fareLine ? parseEstimatedFare(fareLine) ?? fareLine : null,
      policyLines: policies.length > 0 ? policies : ['Driver assigned before pickup'],
    };
  }, [item.detail_lines]);

  const showExecutiveBadge = isExecutiveService(item.detail_lines[0]);

  const handleCancel = async () => {
    if (!canCancel) return;
    setCancelling(true);
    try {
      await ridesCancelScheduled(item.id);
      toast.success('Scheduled ride cancelled');
      setCancelDialogOpen(false);
      onCancelled?.();
      dismiss();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not cancel ride.');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <>
    <div
      className={`activity-scheduled-sheet-overlay fixed inset-0 z-[60] flex items-end justify-center bg-black/40 backdrop-blur-[2px] safe-x ${
        open ? 'activity-scheduled-sheet-overlay--open' : ''
      }`}
      role="presentation"
    >
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={dismiss} />
      <div
        className={`activity-scheduled-sheet activity-scheduled-sheet-panel relative w-full max-w-2xl rounded-t-[2.5rem] border-t border-[#006d43]/10 px-6 pb-8 pt-4 shadow-[0_-12px_40px_rgba(0,0,0,0.08)] safe-b ${
          open ? 'activity-scheduled-sheet-panel--open' : ''
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="scheduled-sheet-title"
      >
        <div className="mb-6 flex justify-center">
          <div className="h-1.5 w-12 rounded-full bg-[#bccabe]" aria-hidden />
        </div>

        <header className="mb-6 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              id="scheduled-sheet-title"
              className="mb-1 text-2xl font-semibold text-gray-900 md:text-[32px] md:leading-10"
            >
              {item.title}
            </h2>
            {showExecutiveBadge ? (
              <div className="flex items-center gap-2">
                <Star className="h-5 w-5 fill-[#00a86b]" style={{ color: PRIMARY_CONTAINER }} aria-hidden />
                <p className="text-sm font-semibold uppercase tracking-wide" style={{ color: PRIMARY }}>
                  Executive Service
                </p>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-full p-2 transition-transform active:scale-95 hover:bg-gray-100"
            aria-label="Close details"
          >
            <X className="h-6 w-6 text-gray-900" aria-hidden />
          </button>
        </header>

        <div className="relative mb-6 overflow-hidden rounded-[1.5rem] border border-[#bccabe]/30 bg-[#f5f3f3] p-5">
          <div className="relative z-10 flex gap-4">
            <div className="flex flex-col items-center pt-1.5">
              <Circle className="h-5 w-5 fill-[#006d43]" style={{ color: PRIMARY }} aria-hidden />
              <div className="activity-scheduled-route-line" aria-hidden />
              <MapPin className="h-5 w-5 text-[#6d7a70]" aria-hidden />
            </div>
            <div className="min-w-0 flex-1 space-y-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-tight text-[#5f5e5e]">Pickup</p>
                <p className="text-base font-semibold text-gray-900">
                  {item.pickup_address?.trim() || 'Pickup'}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-tight text-[#5f5e5e]">Drop-off</p>
                <p className="text-base font-semibold text-gray-900">
                  {item.dropoff_address?.trim() || 'Destination'}
                </p>
              </div>
            </div>
          </div>
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-[#006d43]/5 blur-3xl" aria-hidden />
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-[#bccabe]/20 bg-[#fbf9f8] p-4">
            <p className="mb-1 text-xs text-[#5f5e5e]">Status</p>
            <div className="flex items-center gap-1.5">
              <span
                className="activity-scheduled-status-pulse h-2 w-2 rounded-full"
                style={{ backgroundColor: PRIMARY_CONTAINER }}
                aria-hidden
              />
              <p className="text-base font-bold capitalize" style={{ color: PRIMARY }}>
                {item.status.replace(/_/g, ' ')}
              </p>
            </div>
          </div>
          <div className="rounded-xl border border-[#bccabe]/20 bg-[#fbf9f8] p-4">
            <p className="mb-1 text-xs text-[#5f5e5e]">Service</p>
            <p className="text-base font-bold uppercase tracking-wide text-gray-900">{serviceLabel}</p>
          </div>
          <div className="col-span-2 flex items-center justify-between rounded-xl border border-[#bccabe]/20 bg-[#fbf9f8] p-4">
            <div>
              <p className="mb-1 text-xs text-[#5f5e5e]">Estimated Fare</p>
              <p className="text-2xl font-semibold" style={{ color: PRIMARY }}>
                {fareLabel ?? '—'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-[#5f5e5e]">Pickup Time</p>
              <p className="text-base font-bold text-gray-900">{pickupTime}</p>
            </div>
          </div>
        </div>

        <div className="mb-8 space-y-3">
          {policyLines.map((line, index) => (
            <div key={line} className="flex items-start gap-3">
              {index === 0 ? (
                <UserSearch className="mt-0.5 h-5 w-5 shrink-0 text-[#5f5e5e]" aria-hidden />
              ) : (
                <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0" style={{ color: PRIMARY_CONTAINER }} aria-hidden />
              )}
              <p className="text-base leading-relaxed text-[#3d4a41]">{line}</p>
            </div>
          ))}
          <div className="flex items-start gap-3">
            <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0" style={{ color: PRIMARY_CONTAINER }} aria-hidden />
            <p className="text-base leading-relaxed text-[#3d4a41]">
              Free cancellation anytime before we start matching a driver.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4 pb-2">
          <button
            type="button"
            onClick={dismiss}
            className="flex h-14 w-full items-center justify-center rounded-xl border border-[#006d43]/10 text-sm font-semibold text-[#00331d] shadow-sm transition-transform active:scale-[0.98] hover:opacity-90"
            style={{ backgroundColor: PRIMARY_CONTAINER }}
          >
            Done
          </button>
          {canCancel ? (
            <button
              type="button"
              onClick={() => setCancelDialogOpen(true)}
              disabled={cancelling}
              className="flex h-14 w-full items-center justify-center rounded-xl border bg-white text-sm font-semibold transition-transform active:scale-[0.98] hover:bg-red-50 disabled:opacity-50"
              style={{ color: ERROR, borderColor: `${ERROR}33` }}
            >
              Cancel scheduled ride
            </button>
          ) : null}
        </div>
      </div>
    </div>

    <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
      <AlertDialogContent
        overlayClassName="z-[70] bg-zinc-900/80 backdrop-blur-md"
        className="z-[70] rounded-3xl border border-zinc-200 bg-white shadow-2xl max-w-[calc(100%-2rem)] sm:max-w-md p-6"
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="text-xl font-semibold text-zinc-900">
            Cancel scheduled ride?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-base text-zinc-600 leading-relaxed">
            You can book again anytime. We will not start matching a driver for this trip.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex flex-col gap-3 sm:flex-col">
          <AlertDialogCancel
            disabled={cancelling}
            className="btn-touch rounded-2xl mt-0 h-12 w-full border-2 border-zinc-200 bg-white text-base font-semibold text-zinc-900 hover:bg-zinc-50"
          >
            Keep ride
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={cancelling}
            onClick={(e) => {
              e.preventDefault();
              void handleCancel();
            }}
            className="btn-touch rounded-2xl h-12 w-full bg-red-600 text-base font-semibold text-white hover:bg-red-700 shadow-sm"
          >
            {cancelling ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Cancelling…
              </span>
            ) : (
              'Yes, cancel ride'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
