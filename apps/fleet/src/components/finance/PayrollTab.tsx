import React, { useState, useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { FinancialTransaction } from "../../types/data";
import { PayoutConfig } from "./payroll/PayoutConfig";
import { PayoutCalculator } from "./payroll/PayoutCalculator";
import { PayoutProcessing, PendingPayout } from "./payroll/PayoutProcessing";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { format } from "date-fns";
import { Badge } from "../ui/badge";

interface PayrollTabProps {
  transactions: FinancialTransaction[];
  onAddTransaction: (txn: FinancialTransaction) => void;
  drivers: { id: string; name: string }[];
}

export function PayrollTab({ transactions, onAddTransaction, drivers }: PayrollTabProps) {
  const [configs, setConfigs] = useState<any[]>([]); // We rely on PayoutConfig to init state or passed in. 
  // Actually PayoutConfig has internal state, but PayoutCalculator needs it. 
  // I should hoist state or rely on default.
  // For now I'll use a callback to sync config up, or just let PayoutConfig be the source of truth if we use context.
  // I'll update PayoutConfig to take optional initialConfigs and lift state here.
  
  // Let's redefine state here
  const [driverConfigs, setDriverConfigs] = useState(
      drivers.map(d => ({
        driverId: d.id,
        driverName: d.name,
        type: 'Commission',
        rate: 70, 
        frequency: 'Weekly'
      }))
  );

  const [pendingPayouts, setPendingPayouts] = useState<PendingPayout[]>([]);

  const handleGeneratePayouts = (payouts: PendingPayout[]) => {
      setPendingPayouts(payouts);
      // Switch to processing tab?
      // const processingTrigger = document.querySelector('[value="processing"]') as HTMLElement;
      // if (processingTrigger) processingTrigger.click();
  };

  const handleProcessPayout = (id: string, action: 'approve' | 'reject') => {
      if (action === 'approve') {
          const payout = pendingPayouts.find(p => p.id === id);
          if (payout) {
              const txn: FinancialTransaction = {
                  id: `txn_payout_${Date.now()}`,
                  date: payout.date,
                  time: '12:00',
                  driverId: payout.driverId,
                  driverName: payout.driverName,
                  type: 'Payout',
                  category: 'Driver Payment', // Need to make sure this is valid category or just string
                  description: `Payout: ${payout.periodStart} - ${payout.periodEnd}`,
                  amount: -payout.amount, // Outflow
                  paymentMethod: 'Bank Transfer',
                  status: 'Completed',
                  isReconciled: false,
                  notes: payout.details
              };
              onAddTransaction(txn);
          }
      }
      setPendingPayouts(prev => prev.filter(p => p.id !== id));
  };

  const payoutHistory = useMemo(() => 
      transactions.filter(t => t.type === 'Payout').sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  , [transactions]);

  return (
    <div className="space-y-4">
        <Tabs defaultValue="calculator" className="w-full">
            <div className="flex overflow-x-auto pb-2">
                <TabsList>
                    <TabsTrigger value="config">Configuration</TabsTrigger>
                    <TabsTrigger value="calculator">Calculator</TabsTrigger>
                    <TabsTrigger value="processing">Processing {pendingPayouts.length > 0 && `(${pendingPayouts.length})`}</TabsTrigger>
                    <TabsTrigger value="history">History</TabsTrigger>
                </TabsList>
            </div>

            <TabsContent value="config" className="mt-4">
                <PayoutConfig drivers={drivers} onSaveConfig={(c) => setDriverConfigs(c as any)} />
            </TabsContent>

            <TabsContent value="calculator" className="mt-4">
                <PayoutCalculator transactions={transactions} configs={driverConfigs as any} onGenerate={handleGeneratePayouts} />
            </TabsContent>

            <TabsContent value="processing" className="mt-4">
                <PayoutProcessing payouts={pendingPayouts} onProcess={handleProcessPayout} />
            </TabsContent>

            <TabsContent value="history" className="mt-4">
                <Card>
                    <CardHeader>
                        <CardTitle>Payout History</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Driver</TableHead>
                                    <TableHead>Description</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                    <TableHead className="text-center">Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {payoutHistory.length > 0 ? (
                                    payoutHistory.map(t => (
                                        <TableRow key={t.id}>
                                            <TableCell>{format(new Date(t.date), 'MMM d, yyyy')}</TableCell>
                                            <TableCell className="font-medium">{t.driverName}</TableCell>
                                            <TableCell className="text-sm text-slate-500">{t.description}</TableCell>
                                            <TableCell className="text-right font-bold text-slate-900">${Math.abs(t.amount).toFixed(2)}</TableCell>
                                            <TableCell className="text-center">
                                                <Badge variant="outline" className="bg-slate-50">{t.status}</Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-24 text-center text-slate-500">No payout history found.</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </TabsContent>
        </Tabs>
    </div>
  );
}
