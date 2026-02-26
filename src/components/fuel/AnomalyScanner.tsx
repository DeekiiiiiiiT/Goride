import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Badge } from '../ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { AlertTriangle, Search, ShieldCheck, Loader2, Wrench, AlertCircle } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { projectId, publicAnonKey } from '../../utils/supabase/info';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-37f42386`;

interface FlaggedEntry {
  key: string;
  id: string;
  date: string;
  time?: string;
  location: string;
  amount: number;
  liters?: number;
  odometer?: number;
  prevOdometer?: number | null;
  prevDate?: string | null;
  type: string;
  paymentSource: string;
  entryMode: string;
  driverId: string;
  vehicleId: string;
  integrityStatus: string;
  anomalyReason: string;
  auditStatus: string;
  isFlagged: boolean;
  cycleId?: string;
}

interface ScanResult {
  totalEntriesScanned: number;
  flaggedCount: number;
  flagged: FlaggedEntry[];
}

interface FixResultItem {
  id: string;
  status: 'fixed' | 'not_found' | 'error';
  oldStatus?: string;
  oldReason?: string;
  error?: string;
}

export function AnomalyScanner() {
  const [scanning, setScanning] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [fixResults, setFixResults] = useState<FixResultItem[] | null>(null);

  const runScan = async () => {
    setScanning(true);
    setScanResult(null);
    setSelectedIds(new Set());
    setFixResults(null);
    try {
      const res = await fetch(`${API_BASE}/admin/scan-anomaly-flags`, {
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data: ScanResult = await res.json();
      setScanResult(data);
      if (data.flaggedCount === 0) {
        toast.success('No anomaly-flagged entries found — integrity is clean!');
      } else {
        toast.warning(`Found ${data.flaggedCount} entries with anomaly flags — review below`);
      }
    } catch (err: any) {
      console.error('Anomaly scan error:', err);
      toast.error(`Scan failed: ${err.message}`);
    } finally {
      setScanning(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (!scanResult) return;
    if (selectedIds.size === scanResult.flagged.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(scanResult.flagged.map(f => f.id)));
    }
  };

  const applyFix = async () => {
    if (selectedIds.size === 0) {
      toast.error('Select at least one entry to clear');
      return;
    }
    setFixing(true);
    try {
      const res = await fetch(`${API_BASE}/admin/fix-anomaly-flags`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ entryIds: Array.from(selectedIds) })
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      setFixResults(data.results);

      const fixed = data.results.filter((r: FixResultItem) => r.status === 'fixed').length;
      const failed = data.results.filter((r: FixResultItem) => r.status !== 'fixed').length;

      if (fixed > 0) toast.success(`Cleared anomaly flags on ${fixed} entries`);
      if (failed > 0) toast.error(`${failed} entries could not be fixed — see details`);

      // Remove fixed entries from results
      if (scanResult) {
        const fixedIds = new Set(data.results.filter((r: FixResultItem) => r.status === 'fixed').map((r: FixResultItem) => r.id));
        setScanResult({
          ...scanResult,
          flaggedCount: scanResult.flagged.filter(f => !fixedIds.has(f.id)).length,
          flagged: scanResult.flagged.filter(f => !fixedIds.has(f.id))
        });
        setSelectedIds(new Set());
      }
    } catch (err: any) {
      console.error('Anomaly fix error:', err);
      toast.error(`Fix failed: ${err.message}`);
    } finally {
      setFixing(false);
    }
  };

  const severityBadge = (status: string) => {
    if (status === 'critical') return <Badge variant="destructive" className="text-[10px]">Critical</Badge>;
    return <Badge className="text-[10px] bg-amber-100 text-amber-800 border-amber-300">Warning</Badge>;
  };

  return (
    <Card className="border-rose-200 bg-rose-50/30">
      <CardHeader>
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-rose-600" />
          <CardTitle className="text-base">Anomaly Flag Scanner</CardTitle>
        </div>
        <CardDescription className="text-xs">
          Scans all fuel entries for records flagged with
          <Badge variant="destructive" className="mx-1 text-[10px] py-0">critical</Badge>
          or
          <Badge className="mx-1 text-[10px] py-0 bg-amber-100 text-amber-800 border-amber-300">warning</Badge>
          integrity status. Review the anomaly reason for each, then selectively clear false positives.
          Cleared entries get reset to <Badge variant="outline" className="mx-1 text-[10px] py-0">valid / Clear</Badge> with an audit trail.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Button onClick={runScan} disabled={scanning} size="sm" variant="outline" className="gap-2">
            {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            {scanning ? 'Scanning...' : 'Run Scan'}
          </Button>
          {scanResult && (
            <span className="text-xs text-slate-500">
              Scanned {scanResult.totalEntriesScanned} entries · {scanResult.flaggedCount} flagged
            </span>
          )}
        </div>

        {scanResult && scanResult.flagged.length > 0 && (
          <>
            <div className="rounded-md border border-rose-200 overflow-auto max-h-[450px]">
              <Table>
                <TableHeader>
                  <TableRow className="bg-rose-50">
                    <TableHead className="w-10">
                      <Checkbox
                        checked={selectedIds.size === scanResult.flagged.length}
                        onCheckedChange={selectAll}
                      />
                    </TableHead>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs">Station</TableHead>
                    <TableHead className="text-xs">Liters</TableHead>
                    <TableHead className="text-xs">Odo</TableHead>
                    <TableHead className="text-xs">Prev Odo</TableHead>
                    <TableHead className="text-xs">Severity</TableHead>
                    <TableHead className="text-xs">Anomaly Reason</TableHead>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs">Payment</TableHead>
                    <TableHead className="text-xs">Audit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scanResult.flagged.map(f => (
                    <TableRow key={f.id} className={selectedIds.has(f.id) ? 'bg-rose-100/50' : ''}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(f.id)}
                          onCheckedChange={() => toggleSelect(f.id)}
                        />
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {f.date}{f.time ? ` ${f.time}` : ''}
                      </TableCell>
                      <TableCell className="text-xs max-w-[150px] truncate">{f.location}</TableCell>
                      <TableCell className="text-xs">{f.liters?.toFixed(1) || '—'}</TableCell>
                      <TableCell className="text-xs">{f.odometer?.toLocaleString() || '—'}</TableCell>
                      <TableCell className="text-xs">
                        {f.prevOdometer != null ? (
                          <span className="flex flex-col">
                            <span>{f.prevOdometer.toLocaleString()}</span>
                            {f.odometer != null && f.prevOdometer != null && (
                              <span className={`text-[10px] font-medium ${f.odometer < f.prevOdometer ? 'text-red-600' : 'text-green-600'}`}>
                                {f.odometer < f.prevOdometer
                                  ? `▼ ${(f.prevOdometer - f.odometer).toLocaleString()} regression`
                                  : `▲ +${(f.odometer - f.prevOdometer).toLocaleString()} km`}
                              </span>
                            )}
                            {f.prevDate && <span className="text-[9px] text-slate-400">{f.prevDate}</span>}
                          </span>
                        ) : '—'}
                      </TableCell>
                      <TableCell>{severityBadge(f.integrityStatus)}</TableCell>
                      <TableCell className="text-[10px] text-rose-700 max-w-[220px] font-medium">
                        {f.anomalyReason}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">{f.type}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px]">{f.paymentSource || '—'}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">{f.auditStatus}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">
                {selectedIds.size} of {scanResult.flagged.length} selected
              </span>
              <Button
                onClick={applyFix}
                disabled={fixing || selectedIds.size === 0}
                size="sm"
                className="gap-2 bg-green-600 hover:bg-green-700"
              >
                {fixing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wrench className="h-3.5 w-3.5" />}
                {fixing ? 'Clearing...' : `Clear ${selectedIds.size} → Valid`}
              </Button>
            </div>
          </>
        )}

        {scanResult && scanResult.flagged.length === 0 && (
          <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-md px-4 py-3">
            <ShieldCheck className="h-4 w-4" />
            <span className="text-sm">All clear — no anomaly-flagged entries found.</span>
          </div>
        )}

        {fixResults && fixResults.length > 0 && (
          <div className="space-y-1 border rounded-md p-3 bg-white">
            <span className="text-xs font-medium text-slate-600">Clear Results:</span>
            {fixResults.map(r => (
              <div key={r.id} className="text-xs flex items-center gap-2">
                {r.status === 'fixed' ? (
                  <ShieldCheck className="h-3 w-3 text-green-600" />
                ) : (
                  <AlertTriangle className="h-3 w-3 text-red-500" />
                )}
                <span className="font-mono">{r.id.slice(0, 8)}...</span>
                {r.status === 'fixed' ? (
                  <span className="text-green-700">{r.oldStatus} → valid (was: {r.oldReason})</span>
                ) : (
                  <span className="text-red-600">{r.status}: {r.error}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}