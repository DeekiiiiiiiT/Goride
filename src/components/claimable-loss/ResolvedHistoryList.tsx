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
import { CheckCircle2, History } from "lucide-react";
import { Claim } from "../../types/data";

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
        badgeClass: "bg-red-50 text-red-700 border-red-200",
        textClass: "text-red-600"
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
}

export function ResolvedHistoryList({ claims, isLoading, getDriverName }: ResolvedHistoryListProps) {
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

  return (
    <div className="border rounded-md bg-white shadow-sm">
      <div className="p-4 border-b bg-slate-50/50 flex justify-between items-center">
        <div>
            <h3 className="font-semibold text-slate-900">Resolved History</h3>
            <p className="text-sm text-slate-500">History of closed claims and reimbursements.</p>
        </div>
        <div className="text-sm font-medium text-slate-600">
            Total Resolved: <span className="text-emerald-600 font-bold ml-1">
                ${claims.reduce((sum, c) => sum + c.amount, 0).toFixed(2)}
            </span>
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
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
              <TableRow key={claim.id}>
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
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant="outline" className={`${styles.badgeClass} gap-1`}>
                       <CheckCircle2 className="h-3 w-3" />
                       {claim.status}
                    </Badge>
                    {claim.resolutionReason && (
                        <span className={`text-xs font-medium ${styles.textClass}`}>
                            {claim.resolutionReason}
                        </span>
                    )}
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
