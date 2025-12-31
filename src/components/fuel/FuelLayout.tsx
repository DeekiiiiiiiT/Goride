import React from 'react';
import { 
  BarChart3, 
  CreditCard, 
  FileSpreadsheet, 
  Fuel,
  LayoutDashboard,
  FileText
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";

interface FuelLayoutProps {
  children: React.ReactNode;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  onAddTransaction?: () => void;
}

export function FuelLayout({ children, activeTab = "dashboard", onTabChange, onAddTransaction }: FuelLayoutProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Fuel Management</h1>
          <p className="text-slate-500 mt-1">Track consumption, reconcile expenses, and manage gas cards.</p>
        </div>
        <div className="flex items-center gap-2">
           <Button onClick={onAddTransaction}>
              <Fuel className="h-4 w-4 mr-2" />
              Add Transaction
           </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={onTabChange} className="w-full">
        <TabsList className="grid w-full md:w-[750px] grid-cols-5">
          <TabsTrigger value="dashboard">
             <LayoutDashboard className="h-4 w-4 mr-2" />
             Overview
          </TabsTrigger>
          <TabsTrigger value="reconciliation">
             <FileSpreadsheet className="h-4 w-4 mr-2" />
             Reconciliation
          </TabsTrigger>
          <TabsTrigger value="cards">
             <CreditCard className="h-4 w-4 mr-2" />
             Fuel Cards
          </TabsTrigger>
          <TabsTrigger value="logs">
             <BarChart3 className="h-4 w-4 mr-2" />
             Logs
          </TabsTrigger>
          <TabsTrigger value="reports">
             <FileText className="h-4 w-4 mr-2" />
             Reports
          </TabsTrigger>
        </TabsList>
        
        <div className="mt-6">
            {children}
        </div>
      </Tabs>
    </div>
  );
}
