import React from 'react';
import { DriverGradientCard } from "../ui/DriverGradientCard";
import { portalTheme } from "../theme";
import { 
  Receipt, 
  Fuel, 
  FileText, 
  Clock, 
  Banknote,
  History
} from "lucide-react";

interface PortalHomeProps {
  onNavigate: (view: string) => void;
}

export function PortalHome({ onNavigate }: PortalHomeProps) {
  return (
    <div className="p-4 space-y-6">
      
      {/* Main Action Grid */}
      <div className="grid grid-cols-2 gap-4">
        
        <DriverGradientCard 
          title="Refunds" 
          subtitle="Tolls & Fees"
          icon={Banknote}
          gradient={portalTheme.cards.reimbursements.gradient}
          onClick={() => onNavigate('menu-reimbursements')}
        />

        <DriverGradientCard 
          title="My Expenses" 
          subtitle="Log Receipts"
          icon={Receipt}
          gradient={portalTheme.cards.expenses.gradient}
          onClick={() => onNavigate('feature-expenses')}
        />

        <DriverGradientCard 
          title="Fuel & MPG" 
          subtitle="Track Efficiency"
          icon={Fuel}
          gradient={portalTheme.cards.fuel.gradient}
          onClick={() => onNavigate('feature-fuel')}
        />

        <DriverGradientCard 
          title="History" 
          subtitle="Past Claims"
          icon={History}
          gradient={portalTheme.cards.history.gradient}
          onClick={() => onNavigate('menu-history')}
        />

      </div>

    </div>
  );
}
