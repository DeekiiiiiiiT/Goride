import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { FinancialTransaction } from "../../types/data";
import { ExpensesOverview } from "./ExpensesOverview";
import { FuelTracker } from "./FuelTracker";
import { MaintenanceTracker } from "./MaintenanceTracker";
import { RecurringExpenses } from "./RecurringExpenses";
import { ExpenseApprovals } from "./ExpenseApprovals";
import { Badge } from "../ui/badge";

interface ExpensesTabProps {
  transactions: FinancialTransaction[];
  onAddTransaction: (txn: FinancialTransaction) => void;
  vehicles: { id: string; plate: string }[];
}

export function ExpensesTab({ transactions, onAddTransaction, vehicles }: ExpensesTabProps) {
  const pendingCount = transactions.filter(t => t.type === 'Expense' && t.status === 'Pending').length;

  return (
    <div className="space-y-4">
        <Tabs defaultValue="approvals" className="w-full">
             <div className="flex overflow-x-auto pb-2">
                <TabsList>
                    <TabsTrigger value="approvals" className="relative">
                        Approvals
                        {pendingCount > 0 && (
                            <Badge variant="destructive" className="ml-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px]">
                                {pendingCount}
                            </Badge>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="fuel">Fuel Tracker</TabsTrigger>
                    <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
                    <TabsTrigger value="recurring">Recurring</TabsTrigger>
                </TabsList>
             </div>

             <TabsContent value="approvals" className="mt-4">
                 <ExpenseApprovals transactions={transactions} onUpdate={() => window.location.reload()} />
             </TabsContent>

             <TabsContent value="overview" className="mt-4">
                 <ExpensesOverview transactions={transactions} />
             </TabsContent>

             <TabsContent value="fuel" className="mt-4">
                 <FuelTracker transactions={transactions} onAddTransaction={onAddTransaction} vehicles={vehicles} />
             </TabsContent>

             <TabsContent value="maintenance" className="mt-4">
                 <MaintenanceTracker transactions={transactions} onAddTransaction={onAddTransaction} vehicles={vehicles} />
             </TabsContent>

             <TabsContent value="recurring" className="mt-4">
                 <RecurringExpenses onAddTransaction={onAddTransaction} />
             </TabsContent>
        </Tabs>
    </div>
  );
}
