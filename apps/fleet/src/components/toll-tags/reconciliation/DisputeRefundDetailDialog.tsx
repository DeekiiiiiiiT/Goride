import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../ui/dialog';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Loader2, ArrowDown, MapPin, Unlink } from 'lucide-react';
import { DisputeRefund } from '../../../types/data';
import { formatInFleetTz, formatStoredDateInFleetTz, useFleetTimezone } from '../../../utils/timezoneDisplay';
import { api } from '../../../services/api';
import { PlatformSourceBadge } from './PlatformSourceBadge';

export interface DisputeRefundMatchDetail {
  refund: {
    id: string;
    amount: number;
    date: string;
    status: string;
    platform: string;
    supportCaseId: string;
    resolvedAt: string | null;
    resolvedBy: string | null;
  };
  toll: {
    id: string;
    amount: number;
    date: string;
    time: string | null;
    location: string | null;
    driverName: string | null;
    tripId: string | null;
  } | null;
  claim: {
    id: string;
    amount: number;
    expectedAmount: number;
    status: string;
    resolutionReason: string | null;
    tripId: string | null;
  } | null;
  trip: {
    id: string;
    pickup: string | null;
    dropoff: string | null;
    platform: string | null;
    requestTime: string | null;
    dropoffTime: string | null;
    tollCharges: number;
    tripRefund: number | null;
  } | null;
}

interface DisputeRefundDetailDialogProps {
  refund: DisputeRefund | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUnmatch?: (refundId: string) => void;
  unmatching?: boolean;
}

function fmtMoney(n?: number | null): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return `$${Math.abs(n).toFixed(2)}`;
}

function resolvedByLabel(resolvedBy: string | null | undefined): string {
  if (!resolvedBy) return 'Unknown';
  if (resolvedBy === 'system-auto') return 'Automation';
  if (resolvedBy === 'admin') return 'Admin';
  return resolvedBy;
}

export function DisputeRefundDetailDialog({
  refund,
  open,
  onOpenChange,
  onUnmatch,
  unmatching,
}: DisputeRefundDetailDialogProps) {
  const fleetTz = useFleetTimezone();
  const [detail, setDetail] = useState<DisputeRefundMatchDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !refund) {
      setDetail(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    api.getDisputeRefundMatchDetail(refund.id)
      .then((res) => setDetail(res))
      .catch((e: Error) => {
        setDetail(null);
        setError(e.message || 'Failed to load match details');
      })
      .finally(() => setLoading(false));
  }, [open, refund?.id]);

  const statusLabel =
    refund?.status === 'auto_resolved'
      ? 'Auto-Resolved'
      : refund?.status === 'matched'
        ? 'Matched'
        : 'Unmatched';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Dispute refund match
            {refund && (
              <Badge
                className={
                  refund.status === 'auto_resolved'
                    ? 'bg-blue-100 text-blue-700 border-blue-200'
                    : 'bg-emerald-100 text-emerald-700 border-emerald-200'
                }
              >
                {statusLabel}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Review which toll and trip this Uber support refund was linked to.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : error ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : detail ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Uber support refund
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-lg font-semibold text-emerald-700">+{fmtMoney(detail.refund.amount)}</span>
                <PlatformSourceBadge platform={detail.refund.platform} />
              </div>
              <div className="text-xs text-slate-600">
                {formatInFleetTz(detail.refund.date, fleetTz, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true,
                })}
              </div>
              <div className="text-[10px] text-slate-500">
                Resolved by {resolvedByLabel(detail.refund.resolvedBy)}
                {detail.refund.resolvedAt && (
                  <> · {formatInFleetTz(detail.refund.resolvedAt, fleetTz, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}</>
                )}
              </div>
            </div>

            <div className="flex justify-center">
              <ArrowDown className="h-4 w-4 text-slate-400" />
            </div>

            {detail.toll ? (
              <div className="rounded-lg border border-slate-200 p-3 space-y-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Linked toll
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-800">
                    {detail.toll.location || 'Toll charge'}
                  </span>
                  <span className="text-sm font-semibold text-red-600">-{fmtMoney(detail.toll.amount)}</span>
                </div>
                <div className="text-xs text-slate-600">
                  {formatInFleetTz(detail.toll.date, fleetTz, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                  })}
                  {detail.toll.time ? ` · toll time ${detail.toll.time}` : ''}
                </div>
                {detail.toll.driverName && (
                  <div className="text-xs text-slate-500">Driver: {detail.toll.driverName}</div>
                )}
                {detail.claim && (
                  <div className="text-xs text-slate-600 pt-1 border-t border-slate-100">
                    Underpaid claim: {fmtMoney(detail.claim.amount)} shortfall
                    {detail.claim.resolutionReason && (
                      <span className="text-slate-500"> · {detail.claim.resolutionReason}</span>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                Toll record not found — the link may be stale.
              </div>
            )}

            {detail.trip ? (
              <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-3 space-y-1.5">
                <div className="flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 text-indigo-600" />
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-indigo-700">
                    Matched trip
                  </div>
                  {detail.trip.platform && <PlatformSourceBadge platform={detail.trip.platform} />}
                </div>
                {detail.trip.pickup && (
                  <div className="text-xs text-slate-700">
                    <span className="font-medium">Pickup:</span> {detail.trip.pickup}
                  </div>
                )}
                {detail.trip.dropoff && (
                  <div className="text-xs text-slate-700">
                    <span className="font-medium">Dropoff:</span> {detail.trip.dropoff}
                  </div>
                )}
                {detail.trip.requestTime && (
                  <div className="text-xs text-slate-600">
                    Trip time:{' '}
                    {formatStoredDateInFleetTz(detail.trip.requestTime, fleetTz, {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true,
                    })}
                  </div>
                )}
                <div className="text-xs text-slate-600 pt-1 border-t border-indigo-100">
                  Trip toll credit: {fmtMoney(detail.trip.tripRefund ?? detail.trip.tollCharges)}
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                No trip linked to this toll yet.
              </div>
            )}

            {onUnmatch && refund && (
              <div className="flex justify-end pt-2 border-t border-slate-100">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  disabled={unmatching}
                  onClick={() => onUnmatch(refund.id)}
                >
                  {unmatching ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                  ) : (
                    <Unlink className="h-3.5 w-3.5 mr-1" />
                  )}
                  Unlink match
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
