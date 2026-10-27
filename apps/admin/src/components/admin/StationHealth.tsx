// Stitch: dominion-redesign/4016415050784fcdbbaa4a9e516fa47b
import React, { useEffect, useState } from 'react';
import { Info } from 'lucide-react';
import { API_ENDPOINTS } from '../../services/apiConfig';
import { useAuth } from '../auth/AuthContext';

function showCount(value: number | null): string {
  return value == null || Number.isNaN(value) ? '—' : String(value);
}

export function StationHealth() {
  const { session } = useAuth();
  const [stationTotal, setStationTotal] = useState<number | null>(null);
  const [stationVerified, setStationVerified] = useState<number | null>(null);
  const [quality, setQuality] = useState<number | null>(null);

  useEffect(() => {
    const token = session?.access_token;
    if (!token) return;
    let cancelled = false;
    const headers = { Authorization: `Bearer ${token}` };
    void Promise.all([
      fetch(`${API_ENDPOINTS.catalog}/admin/quality`, { headers }),
      fetch(`${API_ENDPOINTS.admin}/admin-stats`, { headers }),
    ]).then(async ([qualityRes, statsRes]) => {
      if (cancelled) return;
      const qualityBody = qualityRes.ok ? await qualityRes.json() : { scores: [] };
      const stats = statsRes.ok ? await statsRes.json() : {};
      let score: number | null = null;
      for (const row of qualityBody.scores || []) {
        if (row?.dataset === 'stations' && typeof row.score === 'number') score = row.score;
      }
      setQuality(score);
      setStationTotal(typeof stats.fuelStationCount === 'number' ? stats.fuelStationCount : null);
      setStationVerified(typeof stats.stationVerified === 'number' ? stats.stationVerified : null);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [session?.access_token]);

  const unverified =
    stationTotal != null && stationVerified != null
      ? Math.max(0, stationTotal - stationVerified)
      : null;

  const cards = [
    { label: 'Stations', value: showCount(stationTotal) },
    { label: 'Verified', value: showCount(stationVerified) },
    { label: 'Not verified', value: showCount(unverified) },
    { label: 'Quality', value: showCount(quality) },
  ];

  return (
    <div className="w-full max-w-6xl p-8 text-slate-900">
      <div className="mb-4 flex items-center justify-between">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
          <span>Dominion</span>
          <span aria-hidden>&gt;</span>
          <span>Master data</span>
          <span aria-hidden>&gt;</span>
          <span>Fuel</span>
          <span aria-hidden>&gt;</span>
          <span className="font-semibold text-slate-900">Station analytics</span>
        </nav>
        <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 font-mono text-[10px] text-slate-600">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          REGION: JM-KGN
        </div>
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-bold leading-tight tracking-tight text-slate-900">Station analytics</h1>
        <p className="mt-1 text-xs leading-normal text-slate-500">
          How complete the station list is. Customer fuel spending stays in Fleet admin.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-[12px] border border-slate-200/90 bg-white p-5 shadow-sm"
          >
            <div className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {card.label}
            </div>
            <div className="font-mono text-2xl font-bold leading-none tracking-tight text-slate-900">
              {card.value}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500 shadow-sm">
        <div className="flex items-center gap-2 italic text-slate-500">
          <Info className="h-4 w-4 not-italic text-slate-400" aria-hidden />
          <span>The data is not in yet.</span>
        </div>
        <div className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
          LOC: KINGSTON / PARISH REGISTRY JMD
        </div>
      </div>
    </div>
  );
}
