import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../ui/card";
import { Button } from "../../ui/button";
import { Badge } from "../../ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { CheckCircle2, XCircle, Clock } from "lucide-react";
import { FinancialTransaction } from "../../types/data";

export interface PendingPayout {
  id: string;
  driverId: string;
  driverName: string;
  amount: number;
  date: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  periodStart: string;
  periodEnd: string;
  details: string;
}

interface PayoutProcessingProps {
  payouts: PendingPayout[];
  onProcess: (id: string, action: 'approve' | 'reject') => void;
}

export function PayoutProcessing({ payouts, onProcess }: PayoutProcessingProps) {
  
  return (
    <Card>
      <CardHeader>
          <CardTitle>Pending Payouts</CardTitle>
          <CardDescription>Review and approve driver payments.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
          <Table>
              <TableHeader>
                  <TableRow>
                      <TableHead>Driver</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
              </TableHeader>
              <TableBody>
                  {payouts.length > 0 ? (
                      payouts.map(p => (
                          <TableRow key={p.id}>
                              <TableCell className="font-medium">{p.driverName}</TableCell>
                              <TableCell className="text-xs text-slate-500">
                                  {p.periodStart} - {p.periodEnd}
                              </TableCell>
                              <TableCell className="text-xs text-slate-500">{p.details}</TableCell>
                              <TableCell className="text-right font-bold text-slate-900">${p.amount.toFixed(2)}</TableCell>
                              <TableCell className="text-center">
                                  <Badge variant="secondary" className="bg-amber-50 text-amber-700 border-amber-200">
                                      <Clock className="h-3 w-3 mr-1" /> Pending
                                  </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                  <div className="flex justify-end gap-2">
                                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 hover:bg-rose-50 hover:text-rose-600" onClick={() => onProcess(p.id, 'reject')}>
                                          <XCircle className="h-4 w-4" />
                                      </Button>
                                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 hover:bg-emerald-50 hover:text-emerald-600" onClick={() => onProcess(p.id, 'approve')}>
                                          <CheckCircle2 className="h-4 w-4" />
                                      </Button>
                                  </div>
                              </TableCell>
                          </TableRow>
                      ))
                  ) : (
                      <TableRow>
                          <TableCell colSpan={6} className="h-32 text-center text-slate-500">
                              No pending payouts. Generate payouts from the Calculator tab.
                          </TableCell>
                      </TableRow>
                  )}
              </TableBody>
          </Table>
      </CardContent>
    </Card>
  );
}
