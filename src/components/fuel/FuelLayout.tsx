import React from 'react';
import { Fuel } from "lucide-react";
import { Button } from "../ui/button";

interface FuelLayoutProps {
  children: React.ReactNode;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  onAddTransaction?: () => void;
  title?: string;
  description?: string;
}

export function FuelLayout({ children, onAddTransaction, title = "Fuel Management", description = "Track consumption, reconcile expenses, and manage gas cards." }: FuelLayoutProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">{title}</h1>
          <p className="text-slate-500 mt-1">{description}</p>
        </div>
        <div className="flex items-center gap-2">
           <Button onClick={onAddTransaction}>
              <Fuel className="h-4 w-4 mr-2" />
              Add Transaction
           </Button>
        </div>
      </div>

      <div className="mt-6">
          {children}
      </div>
    </div>
  );
}
