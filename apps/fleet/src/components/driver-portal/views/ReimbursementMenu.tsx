import React from 'react';
import { DriverGradientCard } from "../ui/DriverGradientCard";
import { portalTheme } from "../theme";
import { 
  Ticket,
  Clock,
  Sparkles,
  FileText
} from "lucide-react";

interface ReimbursementMenuProps {
  onNavigate: (view: string) => void;
}

export function ReimbursementMenu({ onNavigate }: ReimbursementMenuProps) {
  return (
    <div className="p-4 space-y-4">
      <div className="space-y-1 mb-6 px-1">
        <p className="text-slate-500 text-sm">
          Select a category to submit a claim to Uber.
        </p>
      </div>

      <div className="space-y-3">
        <DriverGradientCard 
          variant="list"
          title="Toll Refunds"
          subtitle="Missing toll payments"
          icon={Ticket}
          gradient={portalTheme.cards.reimbursements.gradient}
          onClick={() => onNavigate('claim-tolls')}
        />

        <DriverGradientCard 
          variant="list"
          title="Wait Time"
          subtitle="Long pickup waits"
          icon={Clock}
          gradient={portalTheme.cards.fuel.gradient} // Using amber/orange for time
          onClick={() => onNavigate('claim-wait')}
        />

        <DriverGradientCard 
          variant="list"
          title="Cleaning Fee"
          subtitle="Mess made by rider"
          icon={Sparkles}
          gradient={portalTheme.cards.expenses.gradient} // Using blue/cyan for cleaning
          onClick={() => onNavigate('claim-cleaning')}
        />
      </div>
    </div>
  );
}
