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
import { RefreshCw, XCircle, Archive, ChevronDown, DollarSign } from "lucide-react";
import { Claim } from "../../types/data";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

interface DisputeLostListProps {
  claims: Claim[];
  isLoading?: boolean;
  onRetry: (claim: Claim) => void;
  onChargeDriver: (claim: Claim) => void;
  onWriteOff: (claim: Claim) => void;
  onBulkRetry?: (claims: Claim[]) => void;
  onBulkCharge?: (claims: Claim[]) => void;
  onBulkWriteOff?: (claims: Claim[]) => void;
  getDriverName?: (id: string) => string;
}

export function DisputeLostList({ 
  claims, 
  isLoading, 
  onRetry, 
  onChargeDriver, 
  onWriteOff, 
  onBulkRetry,
  onBulkCharge,
  onBulkWriteOff,
  getDriverName 
}: DisputeLostListProps) {
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

  const handleBulkRetry = () => {
    if (!onBulkRetry) return;
    const selectedItems = claims.filter(c => selectedIds.has(c.id));
    onBulkRetry(selectedItems);
    setSelectedIds(new Set());
  };

  const handleBulkCharge = () => {
    if (!onBulkCharge) return;
    const selectedItems = claims.filter(c => selectedIds.has(c.id));
    onBulkCharge(selectedItems);
    setSelectedIds(new Set());
  };

  const handleBulkWriteOff = () => {
    if (!onBulkWriteOff) return;
    const selectedItems = claims.filter(c => selectedIds.has(c.id));
    onBulkWriteOff(selectedItems);
    setSelectedIds(new Set());
  };

  if (isLoading) {
    return <div className="p-8 text-center text-slate-500">Loading rejected claims...</div>;
  }

  if (claims.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 border rounded-lg border-dashed bg-slate-50">
        <div className="bg-red-50 p-3 rounded-full mb-4">
          <XCircle className="h-6 w-6 text-red-400" />
        </div>
        <h3 className="text-lg font-medium text-slate-900">No rejected disputes</h3>
        <p className="text-slate-500 text-sm mt-1">Drivers haven't rejected any claims recently.</p>
      </div>
    );
  }

  return (
    <div className="border rounded-md bg-white shadow-sm">
      <div className="p-4 border-b bg-slate-50/50 flex justify-between items-center">
        <div>
            <h3 className="font-semibold text-slate-900">Dispute Lost / Rejected</h3>
            <p className="text-sm text-slate-500">Claims rejected by drivers or Uber. Action required.</p>
        </div>
        <div className="flex items-center gap-4">
            {selectedIds.size > 0 && (
                <div className="flex items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                    <span className="text-sm text-slate-500 font-medium">{selectedIds.size} selected</span>
                    <Button 
                        size="sm" 
                        variant="outline"
                        onClick={handleBulkRetry}
                        className="gap-2"
                    >
                        <RefreshCw className="h-3 w-3" />
                        Retry
                    </Button>
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="outline" className="gap-2">
                          Resolve All <ChevronDown className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Bulk Resolution</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={handleBulkCharge} className="text-red-600">
                          <DollarSign className="mr-2 h-4 w-4" />
                          Charge Drivers
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleBulkWriteOff}>
                          <Archive className="mr-2 h-4 w-4" />
                          Write Off All
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            )}
            <div className="text-sm font-medium text-slate-600">
                Lost Value: <span className="text-red-600 font-bold ml-1">
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
            <TableHead>Date Rejected</TableHead>
            <TableHead>Driver</TableHead>
            <TableHead>Location</TableHead>
            <TableHead className="text-right">Lost Amount</TableHead>
            <TableHead className="text-right">Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {claims.map((claim) => (
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
              </TableCell>
              <TableCell>
                  <div className="font-medium text-sm">
                    {getDriverName ? getDriverName(claim.driverId) : claim.driverId}
                  </div> 
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
                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                   {claim.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right flex justify-end gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-8"
                  onClick={() => onRetry(claim)}
                >
                  <RefreshCw className="mr-2 h-3 w-3" />
                  Retry
                </Button>
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 text-slate-600">
                      Resolve <ChevronDown className="ml-2 h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Resolution Options</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onChargeDriver(claim)} className="text-red-600">
                      <DollarSign className="mr-2 h-4 w-4" />
                      Charge Driver
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onWriteOff(claim)}>
                      <Archive className="mr-2 h-4 w-4" />
                      Write Off (Company Loss)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
