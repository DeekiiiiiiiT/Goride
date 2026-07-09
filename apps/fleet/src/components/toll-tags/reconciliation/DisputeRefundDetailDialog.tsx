import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../ui/dialog';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Loader2, ArrowDown, MapPin, Unlink, CheckCircle2, AlertTriangle } from 'lucide-react';
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
  financials: {
    tollCost: number;
    tripRefund: number | null;
    shortfall: number;
    disputeRefund: number;
    variance: number;
    coversShortfallFully: boolean;
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
    tripLinkSource: 'claim' | 'toll' | 'inferred' | 'persisted' | null;
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

function MoneyRow({
  label,
  amount,
  tone = 'neutral',
}: {
  label: string;
  amount: number | null;
  tone?: 'neutral' | 'cost' | 'credit' | 'warn';
}) {
  const toneClass =
    tone === 'cost'
      ? 'text-red-600'
      : tone === 'credit'
        ? 'text-emerald-600'
        : tone === 'warn'
          ? 'text-amber-600'
          : 'text-slate-800';
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className={`font-semibold tabular-nums ${toneClass}`}>
        {amount == null
          ? '—'
          : tone === 'cost'
            ? `-$${Math.abs(amount).toFixed(2)}`
            : fmtMoney(amount)}
      </span>
    </div>
  );
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

  const fin = detail?.financials;
  const matchOk = fin?.coversShortfallFully;
  const tripInferred = detail?.trip?.tripLinkSource === 'inferred';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
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
            How this Uber support refund ties to the toll shortfall.
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
        ) : detail && fin ? (
          <div className="space-y-3">
            {/* Money story */}
            <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Shortfall breakdown
              </div>
              <MoneyRow label="Toll cost" amount={fin.tollCost} tone="cost" />
              <MoneyRow
                label="Paid on trip"
                amount={fin.tripRefund}
                tone="credit"
              />
              <div className="border-t border-slate-100 pt-2">
                <MoneyRow label="Shortfall (underpaid)" amount={fin.shortfall} tone="warn" />
              </div>
              <div className="flex justify-center py-0.5">
                <ArrowDown className="h-3.5 w-3.5 text-slate-400" />
              </div>
              <MoneyRow label="Uber dispute refund" amount={fin.disputeRefund} tone="credit" />
              <div
                className={`flex items-center gap-1.5 text-xs font-medium rounded-md px-2 py-1.5 ${
                  matchOk
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                }`}
              >
                {matchOk ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                )}
                {matchOk
                  ? 'Dispute refund covers the full shortfall'
                  : `${fmtMoney(Math.abs(fin.variance))} ${fin.variance > 0 ? 'still owed' : 'over-applied'}`}
              </div>
            </div>

            {/* Toll */}
            {detail.toll ? (
              <div className="rounded-lg border border-slate-200 p-3 space-y-1">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Linked toll
                </div>
                <div className="text-sm font-medium text-slate-800">
                  {detail.toll.location || 'Toll charge'}
                </div>
                <div className="text-xs text-slate-500">
                  {formatInFleetTz(detail.toll.date, fleetTz, {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                  })}
                  {detail.toll.driverName ? ` · ${detail.toll.driverName}` : ''}
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                Toll record not found.
              </div>
            )}

            {/* Trip */}
            {detail.trip ? (
              <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-indigo-600" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-700">
                      Trip
                    </span>
                  </div>
                  {detail.trip.platform && <PlatformSourceBadge platform={detail.trip.platform} />}
                </div>
                {tripInferred && (
                  <p className="text-[10px] text-indigo-600/90">
                    Suggested match — toll not formally linked yet
                  </p>
                )}
                {detail.trip.pickup && (
                  <div className="text-xs text-slate-700">
                    <span className="text-slate-500">From</span> {detail.trip.pickup}
                  </div>
                )}
                {detail.trip.dropoff && (
                  <div className="text-xs text-slate-700">
                    <span className="text-slate-500">To</span> {detail.trip.dropoff}
                  </div>
                )}
                {detail.trip.requestTime && (
                  <div className="text-xs text-slate-600">
                    {formatStoredDateInFleetTz(detail.trip.requestTime, fleetTz, {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true,
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                No trip found for this toll — verify the match manually.
              </div>
            )}

            <div className="text-[10px] text-slate-400 pt-1">
              Uber refund {formatInFleetTz(detail.refund.date, fleetTz, { month: 'short', day: 'numeric' })}
              {' · '}
              Resolved by {resolvedByLabel(detail.refund.resolvedBy)}
            </div>

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
