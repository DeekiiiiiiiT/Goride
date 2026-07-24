/**
 * Evidence Bridge Analytics — Dominion (platform staff only).
 * Port of fleet IntegrityGapDashboard with fabricated metrics removed (Phase 3/4).
 */
import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import {
  ShieldCheck,
  MapPin,
  Activity,
  Lock,
  ShieldAlert,
  ChevronRight,
  Filter,
  ArrowUpRight,
  Fingerprint,
  Database,
  History,
  BarChart3,
} from 'lucide-react';
import { api } from '../../../services/api';
import { fuelService } from '../../../services/fuelService';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '../../ui/tooltip';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from 'recharts';
import { SafeResponsiveContainer as ResponsiveContainer } from '../../ui/SafeResponsiveContainer';

export function EvidenceBridgeAnalytics() {
  const [entries, setEntries] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'overview' | 'spatial' | 'forensic' | 'cryptographic'>('overview');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [entriesData, metricsData] = await Promise.all([
        fuelService.getFuelEntries(),
        api.getIntegrityMetrics(),
      ]);
      setEntries(entriesData || []);
      setMetrics(metricsData);
    } catch (err) {
      console.error('Evidence Bridge Analytics Error:', err);
      toast.error('Failed to load integrity analytics');
    } finally {
      setLoading(false);
    }
  };

  const verifyRecord = async (recordId: string) => {
    try {
      const result = await api.verifyRecordForensics(recordId);
      if (result.verified) {
        toast.success('Cryptographic signature validated. Physical data is plausible.');
      } else {
        toast.error(`Verification Failed: ${result.auditTrail?.cryptographic}`, {
          description: 'This record may have been tampered with or contains physical anomalies.',
        });
      }
    } catch {
      toast.error('Forensic verification failed');
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const spatialDistribution = useMemo(() => {
    const dist: Record<string, number> = {
      'Perfect (<20m)': 0,
      'Standard (20-100m)': 0,
      'Drift (100-500m)': 0,
      'Anomaly (>500m)': 0,
      'No Data': 0,
    };
    entries.forEach((e) => {
      const d = e.metadata?.serverSideDistance;
      if (d === undefined || d === null) dist['No Data']++;
      else if (d < 20) dist['Perfect (<20m)']++;
      else if (d <= 100) dist['Standard (20-100m)']++;
      else if (d <= 500) dist['Drift (100-500m)']++;
      else dist['Anomaly (>500m)']++;
    });
    return Object.entries(dist).map(([name, value]) => ({ name, value }));
  }, [entries]);

  const deadZones = useMemo(() => {
    const stationDrift: Record<
      string,
      { name: string; driftCount: number; totalCount: number; avgDrift: number }
    > = {};
    entries.forEach((e) => {
      if (!e.matchedStationId) return;
      const d = e.metadata?.serverSideDistance || 0;
      const isDrift = d > (e.metadata?.radiusUsed || 100);
      if (!stationDrift[e.matchedStationId]) {
        stationDrift[e.matchedStationId] = {
          name: e.vendor || 'Unknown',
          driftCount: 0,
          totalCount: 0,
          avgDrift: 0,
        };
      }
      stationDrift[e.matchedStationId].totalCount++;
      if (isDrift) stationDrift[e.matchedStationId].driftCount++;
      stationDrift[e.matchedStationId].avgDrift += d;
    });
    return Object.values(stationDrift)
      .map((s) => ({
        ...s,
        avgDrift: Math.round(s.avgDrift / s.totalCount),
        driftRate: Math.round((s.driftCount / s.totalCount) * 100),
      }))
      .filter((s) => s.driftCount > 0)
      .sort((a, b) => b.driftRate - a.driftRate)
      .slice(0, 5);
  }, [entries]);

  // Honest crypto pie: signed vs unsigned only (isTampered is never set by backend)
  const cryptoHealth = useMemo(() => {
    const signed = entries.filter((e) => !!e.signature).length;
    const unsigned = entries.length - signed;
    return [
      { name: 'Signed', value: signed, color: '#10b981' },
      { name: 'Unsigned', value: unsigned, color: '#94a3b8' },
    ];
  }, [entries]);

  const overrides = useMemo(() => {
    return entries
      .filter((e) => e.metadata?.isManualOverride || e.metadata?.deviationReason)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10);
  }, [entries]);

  const driftSeries = useMemo(
    () =>
      entries.slice(-20).map((e, i) => ({
        val: Number(e.metadata?.serverSideDistance) || 0,
        name: `point-${i}`,
      })),
    [entries],
  );

  const avgDriftMeters = useMemo(() => {
    const withDist = entries
      .map((e) => e.metadata?.serverSideDistance)
      .filter((d): d is number => typeof d === 'number' && !Number.isNaN(d));
    if (withDist.length === 0) return null;
    return Math.round(withDist.reduce((a, b) => a + b, 0) / withDist.length);
  }, [entries]);

  const driftTrendLabel = useMemo(() => {
    if (driftSeries.length < 4) return null;
    const mid = Math.floor(driftSeries.length / 2);
    const first = driftSeries.slice(0, mid);
    const second = driftSeries.slice(mid);
    const avg = (arr: { val: number }[]) =>
      arr.reduce((s, p) => s + p.val, 0) / (arr.length || 1);
    const a = avg(first);
    const b = avg(second);
    const delta = b - a;
    if (Math.abs(delta) < 15) return 'Stable';
    if (delta > 0) return 'Degrading';
    return 'Improving';
  }, [driftSeries]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4 flex-wrap">
          <Button
            variant={view === 'overview' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setView('overview')}
            className="gap-2"
          >
            <Activity className="w-4 h-4" />
            Overview
          </Button>
          <Button
            variant={view === 'spatial' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setView('spatial')}
            className="gap-2"
          >
            <MapPin className="w-4 h-4" />
            Spatial Analysis
          </Button>
          <Button
            variant={view === 'cryptographic' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setView('cryptographic')}
            className="gap-2"
          >
            <Fingerprint className="w-4 h-4" />
            HMAC Hardening
          </Button>
          <Button
            variant={view === 'forensic' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setView('forensic')}
            className="gap-2"
          >
            <History className="w-4 h-4" />
            Forensic Log
          </Button>
        </div>
        <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">
          Evidence Bridge Analytics
        </Badge>
      </div>

      {view === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 overflow-hidden border-none shadow-lg bg-slate-900 text-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                Evidence Bridge Health
              </CardTitle>
              <CardDescription className="text-slate-400">
                Platform-wide verification coverage (all organizations)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 py-4">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    Integrity Gap
                  </p>
                  <p className="text-4xl font-black text-emerald-400">
                    {metrics?.integrityGapPercentage?.toFixed(1) || '0.0'}%
                  </p>
                  <p className="text-xs text-slate-400">Unverified Spend Exposure</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    Crypto Binding
                  </p>
                  <p className="text-4xl font-black text-indigo-400">
                    {Math.round(
                      (entries.filter((e) => !!e.signature).length / (entries.length || 1)) * 100,
                    )}
                    %
                  </p>
                  <p className="text-xs text-slate-400">Signed Audit Proofs</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    Spatial drift
                  </p>
                  <p className="text-4xl font-black text-amber-400">
                    {Math.round(
                      (entries.filter((e) => (e.metadata?.serverSideDistance || 0) > 100).length /
                        (entries.length || 1)) *
                        100,
                    )}
                    %
                  </p>
                  <p className="text-xs text-slate-400">
                    {avgDriftMeters != null
                      ? `Avg. ${avgDriftMeters}m per transaction`
                      : 'No distance data yet'}
                  </p>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-500">SYSTEM DRIFT TREND</span>
                  {driftTrendLabel && (
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${
                        driftTrendLabel === 'Stable'
                          ? 'border-emerald-500/30 text-emerald-400'
                          : driftTrendLabel === 'Improving'
                            ? 'border-sky-500/30 text-sky-400'
                            : 'border-amber-500/30 text-amber-400'
                      }`}
                    >
                      {driftTrendLabel}
                    </Badge>
                  )}
                </div>
                <div className="h-[120px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={driftSeries}>
                      <defs>
                        <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area
                        type="monotone"
                        dataKey="val"
                        stroke="#10b981"
                        fillOpacity={1}
                        fill="url(#colorVal)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Fingerprint className="w-4 h-4 text-indigo-600" />
                HMAC Binding Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={cryptoHealth}
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {cryptoHealth.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <RechartsTooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 mt-4">
                {cryptoHealth.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-slate-500">{item.name}</span>
                    </div>
                    <span className="font-bold">{item.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {view === 'spatial' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="shadow-sm border-slate-200">
            <CardHeader>
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-slate-500" />
                Accuracy Distribution
              </CardTitle>
              <CardDescription className="text-xs">
                Distance from odometer scan to master pin
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={spatialDistribution} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" hide />
                    <YAxis
                      dataKey="name"
                      type="category"
                      width={120}
                      axisLine={false}
                      tickLine={false}
                      style={{ fontSize: '10px', fontWeight: 'bold' }}
                    />
                    <RechartsTooltip cursor={{ fill: '#f8fafc' }} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {spatialDistribution.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={
                            entry.name.includes('Perfect')
                              ? '#10b981'
                              : entry.name.includes('Standard')
                                ? '#6366f1'
                                : entry.name.includes('Drift')
                                  ? '#f59e0b'
                                  : '#ef4444'
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-slate-200">
            <CardHeader>
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-600" />
                Systemic Dead Zones
              </CardTitle>
              <CardDescription className="text-xs">
                High-drift stations requiring radius adjustment
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {deadZones.map((zone, i) => (
                  <div
                    key={i}
                    className="p-3 bg-slate-50 rounded-lg border border-slate-100 flex items-center justify-between"
                  >
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-slate-900">{zone.name}</p>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className="text-[9px] h-4 bg-white text-rose-600 border-rose-100"
                        >
                          {zone.driftRate}% Drift Rate
                        </Badge>
                        <span className="text-[10px] text-slate-400">Avg: {zone.avgDrift}m</span>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <ArrowUpRight className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                {deadZones.length === 0 && (
                  <div className="py-8 text-center text-slate-400 text-xs italic">
                    No systemic dead zones detected.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {view === 'forensic' && (
        <Card className="shadow-sm border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Database className="w-4 h-4 text-indigo-600" />
                Manual Override Ledger
              </CardTitle>
              <CardDescription className="text-xs">
                Spatial forensic justifications on fuel records
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" className="text-xs gap-2" disabled>
              <Filter className="w-3 h-3" />
              Filter Results
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-y border-slate-200">
                  <tr>
                    <th className="px-4 py-2 text-left font-bold text-slate-500 uppercase tracking-tighter">
                      Date
                    </th>
                    <th className="px-4 py-2 text-left font-bold text-slate-500 uppercase tracking-tighter">
                      Vendor
                    </th>
                    <th className="px-4 py-2 text-right font-bold text-slate-500 uppercase tracking-tighter">
                      Drift
                    </th>
                    <th className="px-4 py-2 text-left font-bold text-slate-500 uppercase tracking-tighter">
                      Forensic Justification
                    </th>
                    <th className="px-4 py-2 text-right font-bold text-slate-500 uppercase tracking-tighter">
                      Proof
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {overrides.map((tx, i) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium whitespace-nowrap">
                        {new Date(tx.date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 font-bold">{tx.vendor}</td>
                      <td className="px-4 py-3 text-right">
                        <Badge
                          variant="outline"
                          className="bg-amber-50 text-amber-700 border-amber-100 text-[10px]"
                        >
                          {tx.metadata?.serverSideDistance || 'N/A'}m
                        </Badge>
                      </td>
                      <td className="px-4 py-3 max-w-xs truncate italic text-slate-500">
                        &quot;
                        {tx.metadata?.deviationReason ||
                          'Odometer scan outside fence - manual override.'}
                        &quot;
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1 items-center">
                          {tx.metadata?.isHighlyTrusted && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="p-1 bg-emerald-50 rounded-full border border-emerald-100">
                                    <Lock className="w-3 h-3 text-emerald-600" />
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-[10px]">Record Immutable & Auto-Locked</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[10px] gap-1 hover:bg-emerald-50 hover:text-emerald-700"
                            onClick={() => verifyRecord(tx.id)}
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                            Verify
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                            <ChevronRight className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {overrides.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-slate-400 italic">
                        No manual overrides recorded in the forensic ledger.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {view === 'cryptographic' && (
        <div className="space-y-6">
          <Card className="bg-indigo-900 text-white border-none overflow-hidden relative shadow-xl">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Fingerprint className="w-32 h-32" />
            </div>
            <CardContent className="p-8 relative">
              <h2 className="text-2xl font-black mb-2 flex items-center gap-3">
                <Lock className="w-6 h-6 text-indigo-400" />
                Cryptographic Ledger Hardening
              </h2>
              <p className="text-indigo-200 text-sm max-w-2xl mb-6">
                Records are bound with HMAC-SHA256 (server-side AUDIT_HMAC_SECRET) over a forensic
                bundle of GPS, efficiency, and financial fields. Once signed, retroactive tampering
                is detectable via Verify.
              </p>
              <div className="flex flex-wrap gap-4">
                <div className="bg-white/10 px-4 py-2 rounded-lg border border-white/10">
                  <p className="text-[10px] font-bold text-indigo-300 uppercase">Signed Records</p>
                  <p className="text-xl font-bold">
                    {entries.filter((e) => !!e.signature).length}
                  </p>
                </div>
                <div className="bg-white/10 px-4 py-2 rounded-lg border border-white/10">
                  <p className="text-[10px] font-bold text-indigo-300 uppercase">
                    Immutability Ratio
                  </p>
                  <p className="text-xl font-bold">
                    {Math.round(
                      (entries.filter((e) => !!e.signature).length / (entries.length || 1)) * 100,
                    )}
                    %
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-slate-200">
            <CardHeader>
              <CardTitle className="text-sm font-bold">Proof of Verification Chain</CardTitle>
              <CardDescription className="text-xs">
                Recent immutable hashes on the audit trail
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100">
                {entries
                  .filter((e) => !!e.signature)
                  .slice(0, 5)
                  .map((e, i) => (
                    <div key={i} className="p-4 flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-bold text-slate-900">{e.vendor}</p>
                          <Badge
                            variant="outline"
                            className="text-[8px] h-3.5 bg-slate-50 font-mono"
                          >
                            {String(e.id || '').slice(0, 8)}
                          </Badge>
                        </div>
                        <p className="text-[10px] text-slate-400 font-mono truncate max-w-[400px]">
                          Hash: {e.signature}
                        </p>
                      </div>
                      <ShieldCheck className="w-5 h-5 text-emerald-500" />
                    </div>
                  ))}
                {entries.filter((e) => !!e.signature).length === 0 && (
                  <div className="p-8 text-center text-slate-400 text-xs italic">
                    No signed records yet.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
