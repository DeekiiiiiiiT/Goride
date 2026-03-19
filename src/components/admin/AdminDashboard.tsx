import React, { useEffect, useState } from 'react';
import { Users, Fuel, MapPin, Settings, ArrowRight, Loader2, Activity, Car, UserCog, Shield } from 'lucide-react';
import { API_ENDPOINTS } from '../../services/apiConfig';
import { useAuth } from '../auth/AuthContext';

interface DashboardCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtitle: string;
  color: string;
  onClick?: () => void;
}

function DashboardCard({ icon, label, value, subtitle, color, onClick }: DashboardCardProps) {
  return (
    <button
      onClick={onClick}
      className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-left hover:border-slate-700 transition-colors group w-full"
    >
      <div className="flex items-start justify-between mb-4">
        <div className={`p-2.5 rounded-lg ${color}`}>
          {icon}
        </div>
        <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors" />
      </div>
      <p className="text-2xl font-bold text-white mb-1">{value}</p>
      <p className="text-sm font-medium text-slate-300">{label}</p>
      <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
    </button>
  );
}

interface AdminDashboardProps {
  onNavigate: (page: string) => void;
}

export function AdminDashboard({ onNavigate }: AdminDashboardProps) {
  const { session } = useAuth();
  const accessToken = session?.access_token;
  const [stats, setStats] = useState({
    customerCount: 0,
    fuelStationCount: 0,
    tollStationCount: 0,
    driverCount: 0,
    linkedDriverCount: 0,
    unlinkedDriverCount: 0,
    teamMemberCount: 0,
    platformStaffCount: 0,
    loading: true,
  });
  const [platformName, setPlatformName] = useState('Roam Fleet');
  const [platformVersion, setPlatformVersion] = useState('1.0.0');

  useEffect(() => {
    loadStats();
    loadPlatformSettings();
  }, []);

  const loadStats = async () => {
    try {
      // Load counts from KV using the admin-check pattern
      // These will be wired to real data in later phases
      // For now, we'll attempt to read from KV and fall back to 0
      const res = await fetch(`${API_ENDPOINTS.admin}/admin-stats`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStats({
          customerCount: data.customerCount || 0,
          fuelStationCount: data.fuelStationCount || 0,
          tollStationCount: data.tollStationCount || 0,
          driverCount: data.driverCount || 0,
          linkedDriverCount: data.linkedDriverCount || 0,
          unlinkedDriverCount: data.unlinkedDriverCount || 0,
          teamMemberCount: data.teamMemberCount || 0,
          platformStaffCount: data.platformStaffCount || 0,
          loading: false,
        });
      } else {
        // Endpoint might not exist yet — that's fine, show zeros
        setStats(s => ({ ...s, loading: false }));
      }
    } catch {
      setStats(s => ({ ...s, loading: false }));
    }
  };

  const loadPlatformSettings = async () => {
    try {
      const res = await fetch(`${API_ENDPOINTS.admin}/admin/platform-settings`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.settings) {
          setPlatformName(data.settings.platformName || 'Roam Fleet');
          setPlatformVersion(data.settings.platformVersion || '1.0.0');
        }
      }
    } catch {
      // Ignore — defaults are fine
    }
  };

  if (stats.loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-slate-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="text-xl font-bold text-white mb-1">Platform Overview</h1>
        <p className="text-sm text-slate-400">
          Manage customer accounts, databases, and platform settings.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <DashboardCard
          icon={<Users className="w-5 h-5 text-blue-400" />}
          color="bg-blue-500/15"
          label="Customer Accounts"
          value={stats.customerCount}
          subtitle="Fleet manager organizations"
          onClick={() => onNavigate('customers')}
        />
        <DashboardCard
          icon={<Car className="w-5 h-5 text-amber-400" />}
          color="bg-amber-500/15"
          label="Total Drivers"
          value={stats.driverCount}
          subtitle={`${stats.linkedDriverCount} linked, ${stats.unlinkedDriverCount} unlinked`}
          onClick={() => onNavigate('drivers')}
        />
        <DashboardCard
          icon={<UserCog className="w-5 h-5 text-cyan-400" />}
          color="bg-cyan-500/15"
          label="Team Members"
          value={stats.teamMemberCount}
          subtitle="Across all fleets"
          onClick={() => onNavigate('team-members')}
        />
        <DashboardCard
          icon={<Shield className="w-5 h-5 text-rose-400" />}
          color="bg-rose-500/15"
          label="Platform Staff"
          value={stats.platformStaffCount}
          subtitle="Support & Analyst accounts"
          onClick={() => onNavigate('platform-team')}
        />
        <DashboardCard
          icon={<Fuel className="w-5 h-5 text-emerald-400" />}
          color="bg-emerald-500/15"
          label="Gas Stations"
          value={stats.fuelStationCount}
          subtitle="Verified gas stations"
          onClick={() => onNavigate('fuel-stations')}
        />
        <DashboardCard
          icon={<MapPin className="w-5 h-5 text-purple-400" />}
          color="bg-purple-500/15"
          label="Toll Stations"
          value={stats.tollStationCount}
          subtitle="Toll booth locations"
          onClick={() => onNavigate('toll-stations')}
        />
        <DashboardCard
          icon={<Activity className="w-5 h-5 text-slate-400" />}
          color="bg-slate-500/15"
          label="Platform Settings"
          value={platformName}
          subtitle={`Version ${platformVersion}`}
          onClick={() => onNavigate('settings')}
        />
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <QuickAction
            label="View Customer Accounts"
            description="Browse and manage fleet organizations"
            onClick={() => onNavigate('customers')}
          />
          <QuickAction
            label="Station Database"
            description="Manage verified stations, spatial audit, and learnt locations"
            onClick={() => onNavigate('fuel-stations')}
          />
          <QuickAction
            label="Fuel Analytics"
            description="Refueling trends, station pricing, and fleet analytics"
            onClick={() => onNavigate('fuel-analytics')}
          />
          <QuickAction
            label="Toll Database"
            description="Manage toll plazas, spatial audit, and verified records"
            onClick={() => onNavigate('toll-stations')}
          />
          <QuickAction
            label="Toll Info"
            description="Manage toll rates, vehicle classes, and operator details"
            onClick={() => onNavigate('toll-info')}
          />
          <QuickAction
            label="Platform Settings"
            description="Configure global platform options"
            onClick={() => onNavigate('settings')}
          />
        </div>
      </div>
    </div>
  );
}

function QuickAction({ label, description, onClick }: { label: string; description: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 bg-slate-900/50 border border-slate-800 rounded-lg px-4 py-3 hover:border-slate-700 hover:bg-slate-900 transition-colors text-left group"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-200 group-hover:text-white transition-colors">{label}</p>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
      <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors shrink-0" />
    </button>
  );
}