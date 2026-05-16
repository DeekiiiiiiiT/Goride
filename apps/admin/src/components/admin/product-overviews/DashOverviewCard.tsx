import React, { useEffect, useState } from 'react';
import { ExternalLink, Utensils, Store, Clock, CheckCircle2, Loader2 } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { getMerchantStats } from '../../../services/dashMerchantVerificationService';

interface DashOverviewCardProps {
  onOpenAdmin?: () => void;
}

export function DashOverviewCard({ onOpenAdmin }: DashOverviewCardProps) {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    pending: 0,
    in_review: 0,
    approved: 0,
    total: 0,
  });

  useEffect(() => {
    async function loadStats() {
      if (!session?.access_token) return;
      try {
        const data = await getMerchantStats(session.access_token);
        setStats({
          pending: data.counts.pending,
          in_review: data.counts.in_review,
          approved: data.counts.approved,
          total: data.total,
        });
      } catch (e) {
        console.error('Failed to load Dash stats:', e);
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
      window.open('https://roamdash.co/admin', '_blank');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Utensils className="w-5 h-5 text-amber-400" />
            Roam Dash Overview
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Read-only summary. Full merchant management at roamdash.co/admin.
          </p>
        </div>
        <button
          onClick={handleOpenAdmin}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-amber-600 hover:bg-amber-500 text-white"
        >
          Open Dash Admin
          <ExternalLink className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Merchants"
            value={stats.total}
            icon={<Store className="w-5 h-5 text-slate-400" />}
          />
          <StatCard
            title="Pending Review"
            value={stats.pending}
            icon={<Clock className="w-5 h-5 text-amber-400" />}
            highlight={stats.pending > 0}
          />
          <StatCard
            title="In Review"
            value={stats.in_review}
            icon={<Clock className="w-5 h-5 text-blue-400" />}
          />
          <StatCard
            title="Approved"
            value={stats.approved}
            icon={<CheckCircle2 className="w-5 h-5 text-emerald-400" />}
          />
        </div>
      )}

      <div className="rounded-lg border border-slate-700 bg-slate-800/30 p-4">
        <h3 className="text-sm font-medium text-white mb-2">Quick Actions</h3>
        <p className="text-sm text-slate-400">
          To review merchants, approve applications, or manage orders, open the full Dash Admin portal.
        </p>
        <button
          onClick={handleOpenAdmin}
          className="mt-3 text-sm text-amber-400 hover:text-amber-300 flex items-center gap-1"
        >
          Go to Dash Admin <ExternalLink className="w-3 h-3" />
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
          : 'border-slate-700 bg-slate-800/30'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-slate-500 uppercase tracking-wide">{title}</p>
        {icon}
      </div>
      <p className={`text-2xl font-semibold ${highlight ? 'text-amber-300' : 'text-white'}`}>
        {value}
      </p>
    </div>
  );
}
