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
import { PersonalDrivingToggle } from '../fuel/PersonalDrivingToggle';

interface DriverDashboardProps {
  onNavigate: (page: string) => void;
}

export function DriverDashboard({ onNavigate }: DriverDashboardProps) {
  const { user } = useAuth();
  const { isFleetDriver, fleet, profile } = useDriver();

  const firstName = user?.user_metadata?.name?.split(' ')[0] || 
                    user?.email?.split('@')[0] || 
                    'Driver';

  const greeting = getGreeting();
  const driverId = profile?.id || user?.id || '';
  // Vehicle assignment may come from equipment later; sessions still keyed by driver
  const vehicleId =
    (typeof window !== 'undefined' && localStorage.getItem('roam_active_vehicle_id')) ||
    null;

  function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }

  return (
    <div className="space-y-6">
      <div className="text-center py-4">
        <p className="text-slate-600 dark:text-slate-300 text-sm font-semibold">{greeting},</p>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1 tracking-tight">{firstName}</h1>
        {isFleetDriver && fleet && (
          <div className="flex items-center justify-center gap-1.5 mt-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
            <Building2 className="w-4 h-4 shrink-0" />
            <span>{fleet.name}</span>
          </div>
        )}
      </div>

      {isFleetDriver && driverId && (
        <PersonalDrivingToggle driverId={driverId} vehicleId={vehicleId} />
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Today's Earnings"
          value="$0.00"
          icon={<DollarSign className="w-5 h-5" />}
          iconBg="bg-emerald-100 dark:bg-emerald-500/20"
          iconColor="text-emerald-700 dark:text-emerald-400"
          onClick={() => onNavigate('earnings')}
        />
        <StatCard
          label="Trips Today"
          value="0"
          icon={<Car className="w-5 h-5" />}
          iconBg="bg-blue-100 dark:bg-blue-500/20"
          iconColor="text-blue-700 dark:text-blue-400"
          onClick={() => onNavigate('trips')}
        />
        <StatCard
          label="Online Hours"
          value="0h 0m"
          icon={<Clock className="w-5 h-5" />}
          iconBg="bg-purple-100 dark:bg-purple-500/20"
          iconColor="text-purple-700 dark:text-purple-400"
        />
        <StatCard
          label="Rating"
          value="5.0"
          icon={<Star className="w-5 h-5" />}
          iconBg="bg-amber-100 dark:bg-amber-500/20"
          iconColor="text-amber-800 dark:text-amber-400"
        />
      </div>

      <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-2xl p-4 border border-emerald-200/80 dark:from-emerald-500/20 dark:to-teal-500/20 dark:border-emerald-500/30">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center dark:bg-emerald-500/20">
            <Zap className="w-6 h-6 text-emerald-700 dark:text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-slate-900 font-bold dark:text-white">Ready to Drive?</h3>
            <p className="text-slate-700 dark:text-emerald-100/90 text-sm font-medium mt-0.5">
              {isFleetDriver
                ? 'Connect with your fleet to start earning'
                : 'Connect your rideshare apps to track earnings'}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider px-1">
          Quick Actions
        </h2>
        <div className="bg-white/90 rounded-xl border border-slate-200 divide-y divide-slate-200 shadow-sm dark:bg-slate-800/50 dark:border-slate-700/50 dark:divide-slate-700/50">
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
      type="button"
      onClick={onClick}
      className="bg-white/90 rounded-xl p-4 border border-slate-200 text-left shadow-sm hover:bg-slate-50 transition-colors dark:bg-slate-800/50 dark:border-slate-700/50 dark:hover:bg-slate-800/80"
    >
      <div className={`w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center ${iconColor} mb-3`}>
        {icon}
      </div>
      <p className="text-xl font-bold text-slate-900 dark:text-white">{value}</p>
      <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 font-semibold">{label}</p>
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
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors dark:hover:bg-slate-700/30"
    >
      <div className="text-left min-w-0 pr-2">
        <p className="text-sm font-semibold text-slate-900 dark:text-white">{label}</p>
        <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">{description}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" />
    </button>
  );
}
