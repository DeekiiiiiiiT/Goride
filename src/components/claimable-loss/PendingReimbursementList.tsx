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
import { CheckCircle, AlertTriangle, ArrowRight, Clock } from "lucide-react";
import { Claim } from "../../types/data";

interface PendingReimbursementListProps {
  claims: Claim[];
  isLoading?: boolean;
  onResolve: (claim: Claim) => void;
  onRevert: (claim: Claim) => void;
}

export function PendingReimbursementList({ claims, isLoading, onResolve, onRevert }: PendingReimbursementListProps) {
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
            <h3 className="font-semibold text-slate-900">Reimbursement Pending</h3>
            <p className="text-sm text-slate-500">Claims submitted by drivers, waiting for Uber refund.</p>
        </div>
        <div className="text-sm font-medium text-slate-600">
            Pending Value: <span className="text-blue-600 font-bold ml-1">
                ${claims.reduce((sum, c) => sum + c.amount, 0).toFixed(2)}
            </span>
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date Sent</TableHead>
            <TableHead>Driver</TableHead>
            <TableHead>Location</TableHead>
            <TableHead className="text-right">Missing Amount</TableHead>
            <TableHead className="text-right">Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {claims.map((claim) => (
            <TableRow key={claim.id}>
              <TableCell className="font-medium text-slate-700">
                {new Date(claim.updatedAt || claim.createdAt).toLocaleDateString()}
                <div className="text-xs text-slate-400">
                    {new Date(claim.updatedAt || claim.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </div>
              </TableCell>
              <TableCell>
                  <div className="font-medium text-sm">{claim.driverId}</div> 
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
                <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-blue-200">
                   Pending Uber
                </Badge>
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
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
