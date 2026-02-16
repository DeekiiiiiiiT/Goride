import React, { useMemo } from 'react';
import { ShieldCheck, AlertCircle, MapPin, Activity } from 'lucide-react';
import { MapFeature } from '../../../utils/spatialNormalization';

interface ForensicSummaryPanelProps {
  features: MapFeature[];
}

export function ForensicSummaryPanel({ features }: ForensicSummaryPanelProps) {
  const stats = useMemo(() => {
    const stations = features.filter(f => f.type === 'station');
    const snapshots = features.filter(f => f.type === 'fueling');
    
    const verifiedStations = stations.filter(s => s.properties.status === 'verified').length;
    const flaggedSnapshots = snapshots.filter(s => !s.properties.isInside || s.properties.status === 'Flagged').length;
    
    let totalDrift = 0;
    snapshots.forEach(s => totalDrift += s.properties.distanceMeters || 0);
    const avgDrift = snapshots.length > 0 ? totalDrift / snapshots.length : 0;

    return {
      totalStations: stations.length,
      verifiedStations,
      totalSnapshots: snapshots.length,
      flaggedSnapshots,
      avgDrift,
      integrityScore: snapshots.length > 0 ? ((snapshots.length - flaggedSnapshots) / snapshots.length) * 100 : 100
    };
  }, [features]);

  return (
    <div className="absolute top-24 right-6 z-[500] pointer-events-none">
      <div className="bg-white/95 backdrop-blur-md p-4 rounded-xl border border-slate-200 shadow-2xl pointer-events-auto w-64 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Forensic Summary</h4>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${stats.integrityScore > 90 ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
            {stats.integrityScore.toFixed(1)}% Health
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <span className="text-[10px] text-slate-500 block">Verified Nodes</span>
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-sm font-bold text-slate-800">{stats.verifiedStations} / {stats.totalStations}</span>
            </div>
          </div>
          
          <div className="space-y-1">
            <span className="text-[10px] text-slate-500 block">Flagged Events</span>
            <div className="flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 text-red-500" />
              <span className="text-sm font-bold text-slate-800">{stats.flaggedSnapshots}</span>
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] text-slate-500 block">Mean Drift</span>
            <div className="flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-indigo-500" />
              <span className="text-sm font-bold text-slate-800">{stats.avgDrift.toFixed(1)}m</span>
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] text-slate-500 block">Total Audits</span>
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-sm font-bold text-slate-800">{stats.totalSnapshots}</span>
            </div>
          </div>
        </div>
        
        {stats.flaggedSnapshots > 0 && (
          <div className="bg-red-50 p-2 rounded-lg border border-red-100">
            <p className="text-[10px] text-red-700 leading-tight">
              <b>CRITICAL:</b> {stats.flaggedSnapshots} transactions detected outside integrity guardrails. Forensic review required.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
