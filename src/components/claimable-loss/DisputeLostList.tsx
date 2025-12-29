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
import { RefreshCw, XCircle, Archive } from "lucide-react";
import { Claim } from "../../types/data";

interface DisputeLostListProps {
  claims: Claim[];
  isLoading?: boolean;
  onRetry: (claim: Claim) => void;
  onArchive: (claim: Claim) => void;
}

export function DisputeLostList({ claims, isLoading, onRetry, onArchive }: DisputeLostListProps) {
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
            <p className="text-sm text-slate-500">Claims rejected by drivers or Uber. Action required to close.</p>
        </div>
        <div className="text-sm font-medium text-slate-600">
            Lost Value: <span className="text-red-600 font-bold ml-1">
                ${claims.reduce((sum, c) => sum + c.amount, 0).toFixed(2)}
            </span>
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
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
            <TableRow key={claim.id}>
              <TableCell className="font-medium text-slate-700">
                {new Date(claim.updatedAt || claim.createdAt).toLocaleDateString()}
                <div className="text-xs text-slate-400">
                    {new Date(claim.updatedAt || claim.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </div>
              </TableCell>
              <TableCell>
                  <div className="font-medium text-sm">{claim.driverId}</div> 
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
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-8 text-slate-600"
                  onClick={() => onArchive(claim)}
                >
                  <Archive className="mr-2 h-3 w-3" />
                  Write Off
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
