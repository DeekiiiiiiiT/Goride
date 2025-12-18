import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { FinancialTransaction } from "../../types/data";
import { ExpensesOverview } from "./ExpensesOverview";
import { FuelTracker } from "./FuelTracker";
import { MaintenanceTracker } from "./MaintenanceTracker";
import { RecurringExpenses } from "./RecurringExpenses";

interface ExpensesTabProps {
  transactions: FinancialTransaction[];
  onAddTransaction: (txn: FinancialTransaction) => void;
  vehicles: { id: string; plate: string }[];
}

export function ExpensesTab({ transactions, onAddTransaction, vehicles }: ExpensesTabProps) {
  return (
    <div className="space-y-4">
        <Tabs defaultValue="overview" className="w-full">
             <div className="flex overflow-x-auto pb-2">
                <TabsList>
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="fuel">Fuel Tracker</TabsTrigger>
                    <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
                    <TabsTrigger value="recurring">Recurring</TabsTrigger>
                </TabsList>
             </div>

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
