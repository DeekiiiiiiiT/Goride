import React from 'react';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "../ui/table";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { CheckCircle, AlertTriangle, ArrowRight, Clock } from "lucide-react";
import { Claim } from "../../types/data";
import { calculateDaysRemaining } from "../../utils/timeUtils";

interface PendingReimbursementListProps {
  claims: Claim[];
  isLoading?: boolean;
  onResolve: (claim: Claim) => void;
  onRevert: (claim: Claim) => void;
  onBulkResolve?: (claims: Claim[]) => void;
  onBulkRevert?: (claims: Claim[]) => void;
  title?: string;
  description?: string;
  getDriverName?: (id: string) => string;
}

export function PendingReimbursementList({ 
  claims, 
  isLoading, 
  onResolve, 
  onRevert,
  onBulkResolve,
  onBulkRevert,
  title = "Reimbursement Pending",
  description = "Claims submitted by drivers, waiting for Uber refund.",
  getDriverName
}: PendingReimbursementListProps) {
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());

  // Reset selection when claims change
  React.useEffect(() => {
    setSelectedIds(new Set());
  }, [claims]);

  const toggleSelectAll = () => {
    if (selectedIds.size === claims.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(claims.map(c => c.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleBulkResolve = () => {
    if (!onBulkResolve) return;
    const selectedItems = claims.filter(c => selectedIds.has(c.id));
    onBulkResolve(selectedItems);
    setSelectedIds(new Set());
  };

  const handleBulkRevert = () => {
    if (!onBulkRevert) return;
    const selectedItems = claims.filter(c => selectedIds.has(c.id));
    onBulkRevert(selectedItems);
    setSelectedIds(new Set());
  };

  if (isLoading) {
    return <div className="p-8 text-center text-slate-500">Loading pending claims...</div>;
  }

  if (claims.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 border rounded-lg border-dashed bg-slate-50">
        <div className="bg-blue-100 p-3 rounded-full mb-4">
          <Clock className="h-6 w-6 text-blue-400" />
        </div>
        <h3 className="text-lg font-medium text-slate-900">No pending reimbursements</h3>
        <p className="text-slate-500 text-sm mt-1">Drivers have not submitted any new claims yet.</p>
      </div>
    );
  }

  return (
    <div className="border rounded-md bg-white shadow-sm">
      <div className="p-4 border-b bg-slate-50/50 flex justify-between items-center">
        <div>
            <h3 className="font-semibold text-slate-900">{title}</h3>
            <p className="text-sm text-slate-500">{description}</p>
        </div>
        <div className="flex items-center gap-4">
            {selectedIds.size > 0 && (
                <div className="flex items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                    <span className="text-sm text-slate-500 font-medium">{selectedIds.size} selected</span>
                    <Button 
                        size="sm" 
                        variant="outline"
                        onClick={handleBulkRevert}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                    >
                        Reject
                    </Button>
                    <Button 
                        size="sm" 
                        onClick={handleBulkResolve}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                        <CheckCircle className="mr-2 h-3 w-3" />
                        Verify Refund
                    </Button>
                </div>
            )}
            <div className="text-sm font-medium text-slate-600">
                Pending Value: <span className="text-blue-600 font-bold ml-1">
                    ${claims.reduce((sum, c) => sum + c.amount, 0).toFixed(2)}
                </span>
            </div>
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40px]">
                <Checkbox 
                    checked={claims.length > 0 && selectedIds.size === claims.length}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all"
                />
            </TableHead>
            <TableHead>Date Sent</TableHead>
            <TableHead>Driver</TableHead>
            <TableHead>Location</TableHead>
            <TableHead className="text-right">Missing Amount</TableHead>
            <TableHead className="text-right">Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {claims.map((claim) => {
            // Calculate urgency based on trip date if available
            const urgency = claim.tripDate 
                ? calculateDaysRemaining(claim.tripDate)
                : { daysRemaining: 10, status: 'active', isUrgent: false };

            return (
            <TableRow key={claim.id} data-state={selectedIds.has(claim.id) ? "selected" : undefined}>
              <TableCell>
                  <Checkbox 
                      checked={selectedIds.has(claim.id)}
                      onCheckedChange={() => toggleSelect(claim.id)}
                      aria-label="Select row"
                  />
              </TableCell>
              <TableCell className="font-medium text-slate-700">
                {new Date(claim.updatedAt || claim.createdAt).toLocaleDateString()}
                <div className="text-xs text-slate-400">
                    {new Date(claim.updatedAt || claim.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </div>

                {/* Show Deadline Warning for Claims waiting for driver */}
                {claim.status === 'Sent_to_Driver' && urgency.status === 'warning' && (
                    <div className="mt-1 text-xs font-bold text-orange-600 flex items-center gap-1 animate-pulse">
                        <Clock className="h-3 w-3" />
                        {urgency.daysRemaining} days left
                    </div>
                )}
                {claim.status === 'Sent_to_Driver' && urgency.status === 'expired' && (
                    <div className="mt-1 text-xs font-bold text-red-600 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Expired
                    </div>
                )}
              </TableCell>
              <TableCell>
                  <div className="font-medium text-sm">
                    {getDriverName ? getDriverName(claim.driverId) : claim.driverId}
                  </div> 
                  {/* Ideally fetch driver name, but ID is fine for now */}
              </TableCell>
              <TableCell>
                  <div className="text-sm truncate max-w-[200px]" title={claim.pickup}>
                      {claim.pickup || 'Unknown Location'}
                  </div>
              </TableCell>
              <TableCell className="text-right font-bold text-slate-700">
                ${claim.amount.toFixed(2)}
              </TableCell>
              <TableCell className="text-right">
                {claim.status === 'Sent_to_Driver' ? (
                  <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 border-orange-200">
                     Awaiting Driver
                  </Badge>
                ) : (
                  <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-blue-200">
                     Pending Uber
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-right flex justify-end gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-8 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                  onClick={() => onRevert(claim)}
                >
                  Reject
                </Button>
                <Button 
                  variant="default" 
                  size="sm" 
                  className="h-8 bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => onResolve(claim)}
                >
                  <CheckCircle className="mr-2 h-3 w-3" />
                  Verify Refund
                </Button>
              </TableCell>
            </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
