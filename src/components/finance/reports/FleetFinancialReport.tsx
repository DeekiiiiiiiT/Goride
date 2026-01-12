import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "../../ui/card";
import { Button } from "../../ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { Badge } from "../../ui/badge";
import { format } from "date-fns";
import { Download, FileText, CheckCircle2, AlertTriangle, Printer } from "lucide-react";
import { DriverMetrics, FinancialTransaction } from "../../../types/data";
import { cn } from "../../ui/utils";

interface FleetFinancialReportProps {
  transactions: FinancialTransaction[];
  driverMetrics: DriverMetrics[];
}

export function FleetFinancialReport({ transactions, driverMetrics }: FleetFinancialReportProps) {
  // 1. Calculate Fleet Totals
  // Calculate directly from transactions to ensure real-time accuracy (Cash Trips)
  const totalCashCollected = transactions
    .filter(t => t.paymentMethod === 'Cash' && t.category === 'Fare Earnings')
    .reduce((sum, t) => sum + t.amount, 0);
  
  // Sum of all "Cash Collection" transactions
  const totalCashReceived = transactions
    .filter(t => t.category === 'Cash Collection' && t.type === 'Revenue')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalOutstanding = totalCashCollected - totalCashReceived;
  const collectionRate = totalCashCollected > 0 ? (totalCashReceived / totalCashCollected) * 100 : 0;

  // 2. Per Driver Breakdown
  const driverFinancials = driverMetrics.map(driver => {
    const received = transactions
      .filter(t => 
        (t.driverId === driver.id || t.driverId === driver.uberDriverId || t.driverId === driver.inDriveDriverId) &&
        t.category === 'Cash Collection'
      )
      .reduce((sum, t) => sum + t.amount, 0);
    
    // Calculate owed from Cash Trips recorded
    const owed = transactions
      .filter(t => 
        (t.driverId === driver.id || t.driverId === driver.uberDriverId || t.driverId === driver.inDriveDriverId) &&
        t.paymentMethod === 'Cash' && 
        t.category === 'Fare Earnings'
      )
      .reduce((sum, t) => sum + t.amount, 0);
    const balance = owed - received;

    return {
      id: driver.id,
      name: driver.name,
      owed,
      received,
      balance,
      status: balance <= 50 ? 'Clear' : balance <= 200 ? 'Pending' : 'Overdue'
    };
  }).sort((a, b) => b.balance - a.balance); // Sort by highest outstanding balance

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* Executive Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-t-4 border-t-indigo-600">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500 uppercase tracking-wider">Total Cash Collected</CardTitle>
          </CardHeader>
          <CardContent>
             <div className="text-3xl font-bold text-slate-900">${totalCashCollected.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
             <p className="text-xs text-slate-500 mt-1">Total cash trips recorded by fleet</p>
          </CardContent>
        </Card>
        
        <Card className="border-t-4 border-t-emerald-600">
          <CardHeader className="pb-2">
             <CardTitle className="text-sm font-medium text-slate-500 uppercase tracking-wider">Cash Received</CardTitle>
          </CardHeader>
          <CardContent>
             <div className="text-3xl font-bold text-emerald-700">${totalCashReceived.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
             <p className="text-xs text-emerald-600 mt-1">{collectionRate.toFixed(1)}% Collection Rate</p>
          </CardContent>
        </Card>
        
        <Card className={cn("border-t-4", totalOutstanding > 1000 ? "border-t-rose-600" : "border-t-amber-500")}>
          <CardHeader className="pb-2">
             <CardTitle className="text-sm font-medium text-slate-500 uppercase tracking-wider">Outstanding Balance</CardTitle>
          </CardHeader>
          <CardContent>
             <div className={cn("text-3xl font-bold", totalOutstanding > 1000 ? "text-rose-600" : "text-amber-600")}>
                ${totalOutstanding.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
             </div>
             <p className="text-xs text-slate-500 mt-1">Cash held by drivers</p>
          </CardContent>
        </Card>
      </div>

      {/* Driver Ledger */}
      <Card className="print:shadow-none print:border-none">
         <CardHeader className="flex flex-row items-center justify-between">
             <div>
                <CardTitle>Driver Reconciliation Ledger</CardTitle>
                <CardDescription>Breakdown of cash balance per driver.</CardDescription>
             </div>
             <div className="flex gap-2 print:hidden">
                 <Button variant="outline" size="sm" onClick={handlePrint}>
                    <Printer className="h-4 w-4 mr-2" />
                    Print
                 </Button>
                 <Button variant="outline" size="sm">
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                 </Button>
             </div>
         </CardHeader>
         <CardContent>
             <Table>
                 <TableHeader>
                     <TableRow className="bg-slate-50">
                         <TableHead>Driver Name</TableHead>
                         <TableHead className="text-right">Total Owed (Cash Trips)</TableHead>
                         <TableHead className="text-right">Amount Received</TableHead>
                         <TableHead className="text-right">Outstanding Balance</TableHead>
                         <TableHead className="text-center">Status</TableHead>
                     </TableRow>
                 </TableHeader>
                 <TableBody>
                     {driverFinancials.map((driver) => (
                         <TableRow key={driver.id} className={cn(
                             driver.balance > 200 ? "bg-rose-50/30" : ""
                         )}>
                             <TableCell className="font-medium text-slate-900">{driver.name}</TableCell>
                             <TableCell className="text-right text-slate-600">
                                 ${driver.owed.toFixed(2)}
                             </TableCell>
                             <TableCell className="text-right text-emerald-600 font-medium">
                                 ${driver.received.toFixed(2)}
                             </TableCell>
                             <TableCell className={cn("text-right font-bold", 
                                 driver.balance > 200 ? "text-rose-600" : 
                                 driver.balance > 50 ? "text-amber-600" : "text-slate-600"
                             )}>
                                 ${driver.balance.toFixed(2)}
                             </TableCell>
                             <TableCell className="text-center">
                                 {driver.status === 'Clear' && (
                                     <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                                         <CheckCircle2 className="h-3 w-3 mr-1" /> Clear
                                     </Badge>
                                 )}
                                 {driver.status === 'Pending' && (
                                     <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                                         Pending
                                     </Badge>
                                 )}
                                 {driver.status === 'Overdue' && (
                                     <Badge variant="destructive" className="bg-rose-100 text-rose-700 border-rose-200 hover:bg-rose-200">
                                         <AlertTriangle className="h-3 w-3 mr-1" /> Overdue
                                     </Badge>
                                 )}
                             </TableCell>
                         </TableRow>
                     ))}
                     
                     {driverFinancials.length === 0 && (
                         <TableRow>
                             <TableCell colSpan={5} className="text-center h-24 text-slate-500">
                                 No driver data available.
                             </TableCell>
                         </TableRow>
                     )}
                 </TableBody>
             </Table>
         </CardContent>
         <CardFooter className="bg-slate-50 border-t p-4 flex justify-between items-center text-xs text-slate-500">
            <span>Generated on {format(new Date(), 'MMM d, yyyy h:mm a')}</span>
            <span>Confidential Financial Document</span>
         </CardFooter>
      </Card>
    </div>
  );
}
