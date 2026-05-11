import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { CalendarClock, CheckCircle2 } from "lucide-react";
import { FinancialTransaction } from "../../types/data";

interface RecurringExpensesProps {
  onAddTransaction: (txn: FinancialTransaction) => void;
}

const RECURRING_ITEMS = [
  { id: 'rec_1', name: 'Commercial Auto Insurance', amount: 80, frequency: 'Monthly', nextDue: '2025-12-15', category: 'Insurance' },
  { id: 'rec_2', name: 'Vehicle Financing', amount: 450, frequency: 'Monthly', nextDue: '2025-12-01', category: 'Vehicle Payment' },
  { id: 'rec_3', name: 'Fleet Management Software', amount: 120, frequency: 'Monthly', nextDue: '2025-12-01', category: 'Software/Subscription' },
  { id: 'rec_4', name: 'Office Rent', amount: 800, frequency: 'Monthly', nextDue: '2025-12-05', category: 'Office Expenses' },
  { id: 'rec_5', name: 'Internet & Utilities', amount: 150, frequency: 'Monthly', nextDue: '2025-12-10', category: 'Office Expenses' },
];

export function RecurringExpenses({ onAddTransaction }: RecurringExpensesProps) {
  
  const handlePay = (item: typeof RECURRING_ITEMS[0]) => {
    const txn: FinancialTransaction = {
        id: `txn_rec_${Date.now()}`,
        date: new Date().toISOString().split('T')[0],
        time: '12:00',
        type: 'Expense',
        category: item.category as any,
        description: `Recurring: ${item.name}`,
        amount: -item.amount,
        paymentMethod: 'Bank Transfer',
        status: 'Completed',
        isReconciled: false,
        notes: `Scheduled payment for ${item.nextDue}`
    };
    onAddTransaction(txn);
  };

  const totalMonthly = RECURRING_ITEMS.reduce((acc, item) => acc + item.amount, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
              <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-500">Total Monthly Fixed</CardTitle>
              </CardHeader>
              <CardContent>
                  <div className="text-2xl font-bold">${totalMonthly.toFixed(2)}</div>
                  <p className="text-xs text-slate-400 mt-1">Projected outflow</p>
              </CardContent>
          </Card>
          <Card>
              <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-500">Upcoming (30 Days)</CardTitle>
              </CardHeader>
              <CardContent>
                  <div className="text-2xl font-bold text-amber-600">${totalMonthly.toFixed(2)}</div>
                  <p className="text-xs text-slate-400 mt-1">5 payments due</p>
              </CardContent>
          </Card>
      </div>

      <Card>
          <CardHeader>
              <CardTitle>Recurring Expenses</CardTitle>
              <CardDescription>Manage automated and scheduled payments.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
              <Table>
                  <TableHeader>
                      <TableRow>
                          <TableHead>Expense Name</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Frequency</TableHead>
                          <TableHead>Next Due</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="w-[100px]"></TableHead>
                      </TableRow>
                  </TableHeader>
                  <TableBody>
                      {RECURRING_ITEMS.map(item => (
                          <TableRow key={item.id}>
                              <TableCell className="font-medium">{item.name}</TableCell>
                              <TableCell>
                                  <Badge variant="secondary" className="font-normal text-xs">{item.category}</Badge>
                              </TableCell>
                              <TableCell>{item.frequency}</TableCell>
                              <TableCell>
                                  <div className="flex items-center gap-1 text-slate-600">
                                      <CalendarClock className="h-3 w-3" />
                                      {item.nextDue}
                                  </div>
                              </TableCell>
                              <TableCell className="text-right font-bold text-slate-900">${item.amount.toFixed(2)}</TableCell>
                              <TableCell>
                                  <Button size="sm" variant="ghost" onClick={() => handlePay(item)} className="h-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50">
                                      <CheckCircle2 className="h-4 w-4 mr-1" /> Pay
                                  </Button>
                              </TableCell>
                          </TableRow>
                      ))}
                  </TableBody>
              </Table>
          </CardContent>
      </Card>
    </div>
  );
}
