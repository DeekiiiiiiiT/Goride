import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { DollarSign, FileText, Send, UserMinus } from 'lucide-react';
import { Claim, Trip } from '../../types/data';
import { PlatformSourceBadge } from '../toll-tags/reconciliation/PlatformSourceBadge';
import { dedupeClaimsForDisplay } from '../../utils/claimByToll';
import { refundSourceLabel } from './LossList';

interface PartiallyCoveredListProps {
  /** Pre-filtered partial shortfall claims from UnderpaidClaimsStep. */
  claims: Claim[];
  trips: Trip[];
  isLoading?: boolean;
  getDriverName?: (id: string) => string;
  onChargeDriver: (claim: Claim) => void;
  onWriteOff: (claim: Claim) => void;
  onSendToDriver: (claim: Claim) => void;
  onSelectClaim?: (claim: Claim) => void;
}

export function PartiallyCoveredList({
  claims,
  trips,
  isLoading,
  getDriverName,
  onChargeDriver,
  onWriteOff,
  onSendToDriver,
  onSelectClaim,
}: PartiallyCoveredListProps) {
  const tripById = new Map(trips.filter((t) => t?.id).map((t) => [t.id, t]));
  const partialClaims = dedupeClaimsForDisplay(claims).displayClaims;

  if (isLoading) {
    return <div className="p-8 text-center text-slate-500">Loading partially covered claims...</div>;
  }

  if (partialClaims.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 border rounded-lg border-dashed bg-slate-50">
        <div className="bg-amber-100 p-3 rounded-full mb-4">
          <DollarSign className="h-6 w-6 text-amber-600" />
        </div>
        <h3 className="text-lg font-medium text-slate-900">No partially covered tolls</h3>
        <p className="text-slate-500 text-sm mt-1 text-center max-w-md">
          When an unlinked or dispute credit covers part of a toll, the remaining shortfall appears here.
        </p>
      </div>
    );
  }

  const remainingTotal = partialClaims.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

  return (
    <div className="border rounded-md bg-white shadow-sm">
      <div className="p-4 border-b bg-slate-50/50 flex justify-between items-center">
        <div>
          <h3 className="font-semibold text-slate-900">
            Partially Covered{' '}
            <span className="ml-2 bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full text-xs">
              {partialClaims.length}
            </span>
          </h3>
          <p className="text-sm text-slate-500">
            Credits already applied — resolve the remaining shortfall below.
          </p>
        </div>
        <div className="text-sm font-medium text-slate-600">
          Remaining:{' '}
          <span className="text-amber-700 font-bold ml-1">${remainingTotal.toFixed(2)}</span>
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Driver</TableHead>
            <TableHead>Platform</TableHead>
            <TableHead>Source</TableHead>
            <TableHead className="text-right">Paid so far</TableHead>
            <TableHead className="text-right">Remaining</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {partialClaims.map((claim) => {
            const trip = claim.tripId ? tripById.get(claim.tripId) : undefined;
            const sourceKind = claim.unlinkedTripId
              ? 'unlinked_refund'
              : claim.disputeRefundId
                ? 'dispute_refund'
                : 'trip_match';
            const paid = Number(claim.paidAmount) || 0;
            const remaining = Number(claim.amount) || 0;

            return (
              <TableRow key={claim.id}>
                <TableCell className="font-medium text-slate-700">
                  {claim.date ? new Date(claim.date).toLocaleDateString() : '—'}
                </TableCell>
                <TableCell>{getDriverName ? getDriverName(claim.driverId) : claim.driverId}</TableCell>
                <TableCell>
                  <PlatformSourceBadge
                    platform={trip?.platform || claim.unlinkedSourcePlatform}
                    refundPlatform={claim.unlinkedSourcePlatform}
                    size="sm"
                  />
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 text-[10px]">
                    {refundSourceLabel(sourceKind)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right text-emerald-600 font-medium">${paid.toFixed(2)}</TableCell>
                <TableCell className="text-right">
                  <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200 font-bold">
                    ${remaining.toFixed(2)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1 flex-wrap">
                    {onSelectClaim && (
                      <Button size="sm" variant="ghost" className="h-8" onClick={() => onSelectClaim(claim)}>
                        <FileText className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-orange-700 border-orange-200"
                      onClick={() => onChargeDriver(claim)}
                    >
                      <UserMinus className="mr-1 h-3 w-3" />
                      Charge
                    </Button>
                    <Button size="sm" variant="outline" className="h-8" onClick={() => onWriteOff(claim)}>
                      Write off
                    </Button>
                    <Button
                      size="sm"
                      className="h-8 bg-indigo-600 hover:bg-indigo-700"
                      onClick={() => onSendToDriver(claim)}
                    >
                      <Send className="mr-1 h-3 w-3" />
                      Send
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
