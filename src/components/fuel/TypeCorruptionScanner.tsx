import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Badge } from '../ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { AlertTriangle, Search, ShieldCheck, Loader2, Wrench } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { projectId, publicAnonKey } from '../../utils/supabase/info';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-37f42386`;

interface Suspect {
  key: string;
  id: string;
  date: string;
  time?: string;
  location: string;
  amount: number;
  odometer?: number;
  currentType: string;
  paymentSource: string;
  entryMode: string;
  driverId: string;
  vehicleId: string;
  signals: string[];
}

interface ScanResult {
  totalEntriesScanned: number;
  suspectsFound: number;
  suspects: Suspect[];
}

interface FixResultItem {
  id: string;
  status: 'fixed' | 'not_found' | 'error';
  oldType?: string;
  newType?: string;
  error?: string;
}

export function TypeCorruptionScanner() {
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
      const res = await fetch(`${API_BASE}/admin/scan-corrupted-types`, {
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data: ScanResult = await res.json();
      setScanResult(data);
      if (data.suspectsFound === 0) {
        toast.success('No corrupted entries found — your data is clean!');
      } else {
        toast.warning(`Found ${data.suspectsFound} suspect entries — review below`);
      }
    } catch (err: any) {
      console.error('Scan error:', err);
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
    if (selectedIds.size === scanResult.suspects.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(scanResult.suspects.map(s => s.id)));
    }
  };

  const applyFix = async () => {
    if (selectedIds.size === 0) {
      toast.error('Select at least one entry to fix');
      return;
    }
    setFixing(true);
    try {
      const res = await fetch(`${API_BASE}/admin/fix-corrupted-types`, {
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

      if (fixed > 0) toast.success(`Fixed ${fixed} entries → type restored to Reimbursement`);
      if (failed > 0) toast.error(`${failed} entries could not be fixed — see details`);

      // Remove fixed entries from the scan results
      if (scanResult) {
        const fixedIds = new Set(data.results.filter((r: FixResultItem) => r.status === 'fixed').map((r: FixResultItem) => r.id));
        setScanResult({
          ...scanResult,
          suspectsFound: scanResult.suspects.filter(s => !fixedIds.has(s.id)).length,
          suspects: scanResult.suspects.filter(s => !fixedIds.has(s.id))
        });
        setSelectedIds(new Set());
      }
    } catch (err: any) {
      console.error('Fix error:', err);
      toast.error(`Fix failed: ${err.message}`);
    } finally {
      setFixing(false);
    }
  };

  return (
    <Card className="border-amber-200 bg-amber-50/30">
      <CardHeader>
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          <CardTitle className="text-base">Type Corruption Scanner</CardTitle>
        </div>
        <CardDescription className="text-xs">
          Scans all fuel entries for records corrupted by the type-overwrite bug — entries that should be 
          <Badge variant="outline" className="mx-1 text-[10px] py-0">Reimbursement</Badge>
          but were accidentally saved as
          <Badge variant="outline" className="mx-1 text-[10px] py-0">Fuel_Manual_Entry</Badge>
          when you edited them. Select confirmed suspects and click Fix to restore their type.
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
              Scanned {scanResult.totalEntriesScanned} entries · {scanResult.suspectsFound} suspects
            </span>
          )}
        </div>

        {scanResult && scanResult.suspects.length > 0 && (
          <>
            <div className="rounded-md border border-amber-200 overflow-auto max-h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow className="bg-amber-50">
                    <TableHead className="w-10">
                      <Checkbox
                        checked={selectedIds.size === scanResult.suspects.length}
                        onCheckedChange={selectAll}
                      />
                    </TableHead>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs">Station</TableHead>
                    <TableHead className="text-xs">Amount</TableHead>
                    <TableHead className="text-xs">Odo</TableHead>
                    <TableHead className="text-xs">Current Type</TableHead>
                    <TableHead className="text-xs">Payment</TableHead>
                    <TableHead className="text-xs">Mode</TableHead>
                    <TableHead className="text-xs">Why Suspect</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scanResult.suspects.map(s => (
                    <TableRow key={s.id} className={selectedIds.has(s.id) ? 'bg-amber-100/50' : ''}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(s.id)}
                          onCheckedChange={() => toggleSelect(s.id)}
                        />
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {s.date}{s.time ? ` ${s.time}` : ''}
                      </TableCell>
                      <TableCell className="text-xs max-w-[180px] truncate">{s.location}</TableCell>
                      <TableCell className="text-xs">${s.amount?.toFixed(2)}</TableCell>
                      <TableCell className="text-xs">{s.odometer?.toLocaleString() || '—'}</TableCell>
                      <TableCell>
                        <Badge variant="destructive" className="text-[10px]">{s.currentType}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">{s.paymentSource}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px]">{s.entryMode}</Badge>
                      </TableCell>
                      <TableCell className="text-[10px] text-amber-700 max-w-[250px]">
                        {s.signals.join(' · ')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">
                {selectedIds.size} of {scanResult.suspects.length} selected
              </span>
              <Button
                onClick={applyFix}
                disabled={fixing || selectedIds.size === 0}
                size="sm"
                className="gap-2 bg-green-600 hover:bg-green-700"
              >
                {fixing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wrench className="h-3.5 w-3.5" />}
                {fixing ? 'Fixing...' : `Fix ${selectedIds.size} → Reimbursement`}
              </Button>
            </div>
          </>
        )}

        {scanResult && scanResult.suspects.length === 0 && (
          <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-md px-4 py-3">
            <ShieldCheck className="h-4 w-4" />
            <span className="text-sm">All clear — no type-corrupted entries found.</span>
          </div>
        )}

        {fixResults && fixResults.length > 0 && (
          <div className="space-y-1 border rounded-md p-3 bg-white">
            <span className="text-xs font-medium text-slate-600">Fix Results:</span>
            {fixResults.map(r => (
              <div key={r.id} className="text-xs flex items-center gap-2">
                {r.status === 'fixed' ? (
                  <ShieldCheck className="h-3 w-3 text-green-600" />
                ) : (
                  <AlertTriangle className="h-3 w-3 text-red-500" />
                )}
                <span className="font-mono">{r.id.slice(0, 8)}…</span>
                {r.status === 'fixed' ? (
                  <span className="text-green-700">{r.oldType} → {r.newType}</span>
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
