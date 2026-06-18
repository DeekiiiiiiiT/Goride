import React, { useEffect, useState } from 'react';
import { ExternalLink, Navigation, CircleDollarSign, TrendingUp, Loader2 } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { listFareRules, listSurgeCells } from '../../../services/ridesAdminService';

interface RidesOverviewCardProps {
  onOpenAdmin?: () => void;
}

export function RidesOverviewCard({ onOpenAdmin }: RidesOverviewCardProps) {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalFareRules: 0,
    activeFareRules: 0,
    totalSurgeCells: 0,
    elevatedSurge: 0,
  });

  useEffect(() => {
    async function loadStats() {
      if (!session?.access_token) return;
      try {
        const [fareData, surgeData] = await Promise.all([
          listFareRules(session.access_token),
          listSurgeCells(session.access_token, { limit: 500 }),
        ]);

        const activeRules = fareData.rules.filter((r) => r.is_active).length;
        const elevated = surgeData.cells.filter((c) => c.surge_multiplier > 1.0).length;

        setStats({
          totalFareRules: fareData.rules.length,
          activeFareRules: activeRules,
          totalSurgeCells: surgeData.total,
          elevatedSurge: elevated,
        });
      } catch (e) {
        console.error('Failed to load Rides stats:', e);
      } finally {
        setLoading(false);
      }
    }
    void loadStats();
  }, [session?.access_token]);

  const handleOpenAdmin = () => {
    if (onOpenAdmin) {
      onOpenAdmin();
    } else {
      window.open('https://roam-s.co/admin', '_blank');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Navigation className="w-5 h-5 text-emerald-400" />
            Roam Rides Overview
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Read-only summary. Full pricing control at roam-s.co/admin.
          </p>
        </div>
        <button
          onClick={handleOpenAdmin}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white"
        >
          Open Rides Admin
          <ExternalLink className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Fare Rules"
            value={stats.totalFareRules}
            icon={<CircleDollarSign className="w-5 h-5 text-slate-400" />}
          />
          <StatCard
            title="Active Rules"
            value={stats.activeFareRules}
            icon={<CircleDollarSign className="w-5 h-5 text-emerald-400" />}
          />
          <StatCard
            title="Surge Cells"
            value={stats.totalSurgeCells}
            icon={<TrendingUp className="w-5 h-5 text-slate-400" />}
          />
          <StatCard
            title="Elevated Surge"
            value={stats.elevatedSurge}
            icon={<TrendingUp className="w-5 h-5 text-amber-400" />}
            highlight={stats.elevatedSurge > 0}
          />
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/30 p-4">
        <h3 className="text-sm font-medium text-slate-900 dark:text-white mb-2">Quick Actions</h3>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          To modify fare rules, adjust surge multipliers, or monitor rides, open the full Rides Admin portal.
        </p>
        <button
          onClick={handleOpenAdmin}
          className="mt-3 text-sm text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
        >
          Go to Rides Admin <ExternalLink className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  highlight = false,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        highlight
          ? 'border-amber-500/50 bg-amber-500/10'
          : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/30'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-slate-500 uppercase tracking-wide">{title}</p>
        {icon}
      </div>
      <p className={`text-2xl font-semibold ${highlight ? 'text-amber-300' : 'text-slate-900 dark:text-white'}`}>
        {value}
      </p>
    </div>
  );
}
