import React from 'react';
import { useDriver } from '../../contexts/DriverContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  DollarSign,
  Car,
  Clock,
  TrendingUp,
  ChevronRight,
  Star,
  Zap,
  Building2,
} from 'lucide-react';

interface DriverDashboardProps {
  onNavigate: (page: string) => void;
}

export function DriverDashboard({ onNavigate }: DriverDashboardProps) {
  const { user } = useAuth();
  const { mode, isFleetDriver, fleet, profile } = useDriver();

  const firstName = user?.user_metadata?.name?.split(' ')[0] || 
                    user?.email?.split('@')[0] || 
                    'Driver';

  const greeting = getGreeting();

  function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }

  return (
    <div className="space-y-6">
      <div className="text-center py-4">
        <p className="text-slate-400 text-sm">{greeting},</p>
        <h1 className="text-2xl font-bold text-white mt-1">{firstName}</h1>
        {isFleetDriver && fleet && (
          <div className="flex items-center justify-center gap-1.5 mt-2 text-sm text-emerald-400">
            <Building2 className="w-4 h-4" />
            <span>{fleet.name}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Today's Earnings"
          value="$0.00"
          icon={<DollarSign className="w-5 h-5" />}
          iconBg="bg-emerald-500/20"
          iconColor="text-emerald-400"
          onClick={() => onNavigate('earnings')}
        />
        <StatCard
          label="Trips Today"
          value="0"
          icon={<Car className="w-5 h-5" />}
          iconBg="bg-blue-500/20"
          iconColor="text-blue-400"
          onClick={() => onNavigate('trips')}
        />
        <StatCard
          label="Online Hours"
          value="0h 0m"
          icon={<Clock className="w-5 h-5" />}
          iconBg="bg-purple-500/20"
          iconColor="text-purple-400"
        />
        <StatCard
          label="Rating"
          value="5.0"
          icon={<Star className="w-5 h-5" />}
          iconBg="bg-amber-500/20"
          iconColor="text-amber-400"
        />
      </div>

      <div className="bg-gradient-to-r from-emerald-500/20 to-teal-500/20 rounded-2xl p-4 border border-emerald-500/30">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
            <Zap className="w-6 h-6 text-emerald-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-white font-semibold">Ready to Drive?</h3>
            <p className="text-emerald-300/70 text-sm">
              {isFleetDriver
                ? 'Connect with your fleet to start earning'
                : 'Connect your rideshare apps to track earnings'}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider px-1">
          Quick Actions
        </h2>
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 divide-y divide-slate-700/50">
          <QuickAction
            label="View Earnings"
            description="See your earnings breakdown"
            onClick={() => onNavigate('earnings')}
          />
          <QuickAction
            label="Trip History"
            description="Review your past trips"
            onClick={() => onNavigate('trips')}
          />
          {isFleetDriver && (
            <QuickAction
              label="Equipment Status"
              description="Check your assigned equipment"
              onClick={() => onNavigate('equipment')}
            />
          )}
          {!isFleetDriver && (
            <QuickAction
              label="My Vehicle"
              description="Manage your vehicle info"
              onClick={() => onNavigate('vehicle')}
            />
          )}
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  onClick?: () => void;
}

function StatCard({ label, value, icon, iconBg, iconColor, onClick }: StatCardProps) {
  return (
    <button
      onClick={onClick}
      className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 text-left hover:bg-slate-800/70 transition-colors"
    >
      <div className={`w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center ${iconColor} mb-3`}>
        {icon}
      </div>
      <p className="text-xl font-bold text-white">{value}</p>
      <p className="text-xs text-slate-400 mt-0.5">{label}</p>
    </button>
  );
}

interface QuickActionProps {
  label: string;
  description: string;
  onClick: () => void;
}

function QuickAction({ label, description, onClick }: QuickActionProps) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-700/30 transition-colors"
    >
      <div>
        <p className="text-sm font-medium text-white">{label}</p>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-slate-500" />
    </button>
  );
}
