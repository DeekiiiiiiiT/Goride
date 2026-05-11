import React from 'react';
import { DriverGradientCard } from "../ui/DriverGradientCard";
import { portalTheme } from "../theme";
import { 
  Receipt, 
  Fuel, 
  FileText, 
  Clock, 
  Banknote,
  History,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { useCurrentDriver } from "../../../hooks/useCurrentDriver";
import { useWeeklyCheckIn } from "../../../hooks/useWeeklyCheckIn";
import { motion } from "motion/react";

interface PortalHomeProps {
  onNavigate: (view: string) => void;
}

export function PortalHome({ onNavigate }: PortalHomeProps) {
  const { driverRecord } = useCurrentDriver();
  const { needsCheckIn, lastCheckIn, isLoading } = useWeeklyCheckIn(driverRecord?.id);

  return (
    <div className="p-4 space-y-6">
      {/* Baseline Status Indicator */}
      {!isLoading && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`p-4 rounded-2xl border flex items-center justify-between shadow-sm ${
            needsCheckIn 
              ? "bg-amber-50 border-amber-200 text-amber-900" 
              : "bg-emerald-50 border-emerald-200 text-emerald-900"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${needsCheckIn ? "bg-amber-100" : "bg-emerald-100"}`}>
              {needsCheckIn ? <AlertCircle className="w-5 h-5 text-amber-600" /> : <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
            </div>
            <div>
              <h3 className="font-bold text-sm">Weekly Odometer Anchor</h3>
              <p className="text-xs opacity-80">
                {needsCheckIn ? "Baseline missing for this week" : `Verified on ${new Date(lastCheckIn?.timestamp || '').toLocaleDateString()}`}
              </p>
            </div>
          </div>
          <div className="text-right">
             <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">Status</span>
             <p className="text-xs font-bold">{needsCheckIn ? "PENDING" : "ESTABLISHED"}</p>
          </div>
        </motion.div>
      )}
      
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
