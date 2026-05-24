import React, { useEffect, useState } from 'react';
import { Building2, Users, UserCog, Loader2, ChevronRight } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { API_ENDPOINTS } from '../../../services/apiConfig';

interface AdminStatsPayload {
  enterprise?: { customerCount: number; teamMemberCount: number };
}

interface EnterpriseOverviewCardProps {
  onNavigate: (page: string) => void;
}

export function EnterpriseOverviewCard({ onNavigate }: EnterpriseOverviewCardProps) {
  const { session } = useAuth();
  const token = session?.access_token;
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState(0);
  const [team, setTeam] = useState(0);

  useEffect(() => {
    async function load() {
      if (!token) return;
      try {
        const res = await fetch(`${API_ENDPOINTS.admin}/admin-stats`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = (await res.json()) as AdminStatsPayload;
          setCustomers(data.enterprise?.customerCount ?? 0);
          setTeam(data.enterprise?.teamMemberCount ?? 0);
        }
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [token]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Building2 className="w-5 h-5 text-sky-400" />
            Roam Enterprise
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Enterprise customer orgs and their team memberships.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-sky-400" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => onNavigate('enterprise-customers')}
            className="text-left rounded-xl border border-slate-800 bg-slate-900/60 p-5 hover:border-slate-700 transition-colors group"
          >
            <div className="flex items-center justify-between mb-2">
              <Users className="w-5 h-5 text-sky-400" />
              <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400" />
            </div>
            <p className="text-3xl font-bold text-white">{customers}</p>
            <p className="text-sm text-slate-400 mt-1">Customer accounts</p>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('enterprise-team-members')}
            className="text-left rounded-xl border border-slate-800 bg-slate-900/60 p-5 hover:border-slate-700 transition-colors group"
          >
            <div className="flex items-center justify-between mb-2">
              <UserCog className="w-5 h-5 text-cyan-400" />
              <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400" />
            </div>
            <p className="text-3xl font-bold text-white">{team}</p>
            <p className="text-sm text-slate-400 mt-1">Team members</p>
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onNavigate('enterprise-customers')}
          className="px-4 py-2 text-sm rounded-lg bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-800"
        >
          Open customer accounts
        </button>
        <button
          type="button"
          onClick={() => onNavigate('enterprise-team-members')}
          className="px-4 py-2 text-sm rounded-lg bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-800"
        >
          Open team members
        </button>
      </div>
    </div>
  );
}
