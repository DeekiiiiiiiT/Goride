import React, { useState } from 'react';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "../ui/table";
import { Badge } from "../ui/badge";
import { CheckCircle2, History, Trash2, MoreHorizontal, FileText, UserMinus } from "lucide-react";
import { Claim } from "../../types/data";
import { Checkbox } from "../ui/checkbox";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

interface ResolutionStyle {
  badgeClass: string;
  textClass: string;
}

const getResolutionStyle = (reason?: string): ResolutionStyle => {
  switch (reason) {
    case 'Reimbursed':
      return {
        badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
        textClass: "text-emerald-600"
      };
    case 'Charge Driver':
      return {
        badgeClass: "bg-orange-50 text-orange-700 border-orange-200",
        textClass: "text-orange-600"
      };
    case 'Write Off':
      return {
        badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
        textClass: "text-blue-600"
      };
    default:
      return {
        badgeClass: "bg-slate-50 text-slate-700 border-slate-200",
        textClass: "text-slate-500"
      };
  }
};

interface ResolvedHistoryListProps {
  claims: Claim[];
  isLoading?: boolean;
  getDriverName?: (id: string) => string;
  onDelete?: (ids: string[]) => void;
  onUpdateStatus?: (claim: Claim, newReason: 'Charge Driver' | 'Write Off' | 'Reimbursed') => void;
}

export function ResolvedHistoryList({ claims, isLoading, getDriverName, onDelete, onUpdateStatus }: ResolvedHistoryListProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  if (isLoading) {
    return <div className="p-8 text-center text-slate-500">Loading history...</div>;
  }

  if (claims.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 border rounded-lg border-dashed bg-slate-50">
        <div className="bg-emerald-50 p-3 rounded-full mb-4">
          <History className="h-6 w-6 text-emerald-400" />
        </div>
        <h3 className="text-lg font-medium text-slate-900">No resolved claims</h3>
        <p className="text-slate-500 text-sm mt-1">Claims that are successfully reimbursed or written off will appear here.</p>
      </div>
    );
  }

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

  return (
    <div className="border rounded-md bg-white shadow-sm">
      <div className="p-4 border-b bg-slate-50/50 flex justify-between items-center min-h-[72px]">
        <div>
            <h3 className="font-semibold text-slate-900">Resolved History</h3>
            <p className="text-sm text-slate-500">History of closed claims and reimbursements.</p>
        </div>
        
        {selectedIds.size > 0 ? (
            <div className="flex items-center gap-2 animate-in fade-in zoom-in-95 duration-200">
                 <span className="text-sm text-slate-500 mr-2">{selectedIds.size} selected</span>
                 <Button 
                    variant="destructive" 
                    size="sm" 
                    onClick={() => {
                        onDelete?.(Array.from(selectedIds));
                        setSelectedIds(new Set());
                    }}
                    className="gap-2 h-8"
                 >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete Selected
                 </Button>
            </div>
        ) : (
            <div className="text-sm font-medium text-slate-600">
                Total Resolved: <span className="text-emerald-600 font-bold ml-1">
                    ${claims.reduce((sum, c) => sum + c.amount, 0).toFixed(2)}
                </span>
            </div>
        )}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50px]">
                <Checkbox 
                    checked={claims.length > 0 && selectedIds.size === claims.length}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all"
                />
            </TableHead>
            <TableHead>Date Resolved</TableHead>
            <TableHead>Driver</TableHead>
            <TableHead>Location</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="text-right">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {claims.map((claim) => {
            const styles = getResolutionStyle(claim.resolutionReason);
            return (
              <TableRow key={claim.id} className={selectedIds.has(claim.id) ? "bg-slate-50/50" : ""}>
                <TableCell>
                    <Checkbox 
                        checked={selectedIds.has(claim.id)}
                        onCheckedChange={() => toggleSelect(claim.id)}
                        aria-label={`Select claim`}
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
                  <div className="flex flex-col items-end gap-1 group relative">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <div className="cursor-pointer hover:opacity-80 transition-opacity">
                            <Badge variant="outline" className={`${styles.badgeClass} gap-1`}>
                               <CheckCircle2 className="h-3 w-3" />
                               {claim.status}
                            </Badge>
                            {claim.resolutionReason && (
                                <div className={`flex items-center justify-end gap-1 mt-1 text-xs font-medium ${styles.textClass}`}>
                                    {claim.resolutionReason}
                                    <MoreHorizontal className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                            )}
                        </div>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Change Resolution</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                            onClick={() => onUpdateStatus?.(claim, 'Reimbursed')}
                            disabled={claim.resolutionReason === 'Reimbursed'}
                        >
                            <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-600" />
                            Mark Reimbursed
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                            onClick={() => onUpdateStatus?.(claim, 'Charge Driver')}
                            disabled={claim.resolutionReason === 'Charge Driver'}
                        >
                            <UserMinus className="mr-2 h-4 w-4 text-orange-600" />
                            Charge Driver
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                            onClick={() => onUpdateStatus?.(claim, 'Write Off')}
                            disabled={claim.resolutionReason === 'Write Off'}
                        >
                            <FileText className="mr-2 h-4 w-4 text-blue-600" />
                            Write Off (Fleet)
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
