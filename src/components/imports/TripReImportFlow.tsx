import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Progress } from '../ui/progress';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import {
  UploadCloud, ArrowLeft, CheckCircle, AlertCircle, AlertTriangle,
  FileText, Loader2, Info,
} from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { validateImportFile, ValidationError } from '../../services/import-validator';
import { importExecutor } from '../../services/data-import-executor';
import { Trip } from '../../types/data';

// ═══════════════════════════════════════════════════════════════════════════
// Types & Steps
// ═══════════════════════════════════════════════════════════════════════════

type FlowStep = 'upload' | 'validating' | 'preview' | 'importing' | 'success' | 'error';

interface TripReImportFlowProps {
  onBack: () => void;
  /** If set, only import trips matching this platform (e.g. 'Uber', 'InDrive', 'Roam') */
  platformFilter?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

export function TripReImportFlow({ onBack, platformFilter }: TripReImportFlowProps) {
  const [flowStep, setFlowStep] = useState<FlowStep>('upload');
  const [fileName, setFileName] = useState('');
  const [validRecords, setValidRecords] = useState<Partial<Trip>[]>([]);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [totalParsed, setTotalParsed] = useState(0);
  const [progress, setProgress] = useState(0);
  const [importResult, setImportResult] = useState<{
    success: number;
    failed: number;
    batchId: string;
    weeks: number;
    errors: Array<{ row: number; error: string }>;
  } | null>(null);

  // ─── File Upload ───────────────────────────────────────────────────────

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    const file = acceptedFiles[0];

    if (!file.name.endsWith('.csv')) {
      toast.error('Please upload a .csv file.');
      return;
    }

    setFileName(file.name);
    setFlowStep('validating');

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (!content) {
        toast.error('File is empty.');
        setFlowStep('upload');
        return;
      }

      // Validate
      const result = validateImportFile(content, 'trip');

      // Apply platform filter if specified
      let filtered = result.validRecords;
      if (platformFilter) {
        const pf = platformFilter.toLowerCase();
        filtered = result.validRecords.filter(
          (r: any) => (r.platform || '').toLowerCase() === pf
        );
      }

      setValidRecords(filtered);
      setErrors(result.errors);
      setTotalParsed(result.totalProcessed);

      if (filtered.length === 0) {
        if (platformFilter && result.validRecords.length > 0) {
          toast.error(`No ${platformFilter} trips found in the file. The file contains ${result.validRecords.length} trip(s) from other platforms.`);
        } else {
          toast.error('No valid trip records found in the file.');
        }
        setFlowStep('upload');
        return;
      }

      if (platformFilter && filtered.length < result.validRecords.length) {
        toast.info(`Filtered to ${filtered.length} ${platformFilter} trips out of ${result.validRecords.length} total valid trips.`);
      }

      setFlowStep('preview');
    };
    reader.onerror = () => {
      toast.error('Failed to read the file.');
      setFlowStep('upload');
    };
    reader.readAsText(file);
  }, [platformFilter]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'] },
    maxFiles: 1,
    multiple: false,
  });

  // ─── Import Execution ──────────────────────────────────────────────────

  const handleImport = useCallback(async () => {
    setFlowStep('importing');
    setProgress(0);

    try {
      const result = await importExecutor.processTripBatch(
        validRecords,
        (pct) => setProgress(pct),
      );

      setImportResult({
        success: result.successCount,
        failed: result.failureCount,
        batchId: result.batchId,
        weeks: result.weeksCovered.size,
        errors: result.errors.map(e => ({ row: e.row, error: e.error })),
      });

      setFlowStep('success');
      toast.success(`Imported ${result.successCount.toLocaleString()} trips successfully.`);
    } catch (err: any) {
      console.error('Trip import failed:', err);
      toast.error(`Import failed: ${err.message || 'Unknown error'}`);
      setFlowStep('error');
    }
  }, [validRecords]);

  // ─── Helpers ───────────────────────────────────────────────────────────

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    } catch { return iso; }
  };

  const previewTrips = validRecords.slice(0, 20);

  // Count trips with existing IDs (for dedup warning)
  const tripsWithIds = validRecords.filter(r => r.id && r.id.trim() !== '').length;

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header with back button */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="h-8 px-2">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            {platformFilter ? `${platformFilter} Trip Import` : 'Trip Re-Import'}
          </h3>
          <p className="text-sm text-slate-500">
            {platformFilter
              ? `Import only ${platformFilter} trips from a CSV file. Non-${platformFilter} rows are automatically excluded.`
              : 'Import trip data from a CSV file. The ledger is automatically updated.'}
          </p>
        </div>
      </div>

      {/* ═══ STEP: UPLOAD ═══ */}
      {flowStep === 'upload' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {platformFilter ? `Upload ${platformFilter} Trip CSV` : 'Upload Trip CSV'}
            </CardTitle>
            <CardDescription>
              {platformFilter ? (
                <>Upload a CSV containing {platformFilter} trip data. Only rows where <strong>platform</strong> = "{platformFilter}" will be imported; other platforms are filtered out automatically.</>
              ) : (
                <>Upload a CSV file exported from the Trip Data export, or any CSV with at least:
                <strong> date</strong>, <strong>driverId</strong> (or driverName), and <strong>amount</strong> columns.</>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${
                isDragActive ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <input {...getInputProps()} />
              <UploadCloud className="h-10 w-10 mx-auto text-slate-400 mb-3" />
              <p className="text-sm text-slate-600 font-medium">
                {isDragActive ? 'Drop the CSV file here...' : 'Drag & drop a CSV file, or click to select'}
              </p>
              <p className="text-xs text-slate-400 mt-1">Only .csv files are accepted</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══ STEP: VALIDATING ═══ */}
      {flowStep === 'validating' && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
            <p className="text-sm text-slate-600">Validating {fileName}...</p>
          </CardContent>
        </Card>
      )}

      {/* ═══ STEP: PREVIEW ═══ */}
      {flowStep === 'preview' && (
        <div className="space-y-4">
          {/* Validation Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-emerald-600">{validRecords.length.toLocaleString()}</p>
                <p className="text-xs text-slate-500 mt-1">Valid Trips</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-red-500">{errors.filter(e => e.row > 0).length}</p>
                <p className="text-xs text-slate-500 mt-1">Row Errors</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-slate-700">{totalParsed}</p>
                <p className="text-xs text-slate-500 mt-1">Total Rows Parsed</p>
              </CardContent>
            </Card>
          </div>

          {/* Deduplication Warning */}
          {tripsWithIds > 0 && (
            <Alert className="border-amber-200 bg-amber-50">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-amber-800 text-sm">Deduplication Notice</AlertTitle>
              <AlertDescription className="text-amber-700 text-xs">
                {tripsWithIds.toLocaleString()} trip(s) have existing IDs.
                If these IDs match trips already in the system, they will be <strong>updated</strong> (not duplicated).
                Trips without IDs will get new unique IDs.
              </AlertDescription>
            </Alert>
          )}

          {/* Validation Errors */}
          {errors.length > 0 && (
            <Alert variant="destructive" className="border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle className="text-sm">Validation Issues ({errors.length})</AlertTitle>
              <AlertDescription className="text-xs mt-2 max-h-32 overflow-y-auto">
                <ul className="space-y-1">
                  {errors.slice(0, 10).map((err, i) => (
                    <li key={i}>
                      {err.row > 0 ? `Row ${err.row}: ` : ''}{err.message}
                    </li>
                  ))}
                  {errors.length > 10 && (
                    <li className="text-red-400 italic">...and {errors.length - 10} more</li>
                  )}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Preview Table */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Preview (first 20 records)</CardTitle>
                <Badge variant="outline" className="text-xs">
                  <FileText className="h-3 w-3 mr-1" />
                  {fileName}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Driver</TableHead>
                      <TableHead>Platform</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Distance</TableHead>
                      <TableHead>Pickup</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewTrips.map((trip, i) => (
                      <TableRow key={i} className="text-xs">
                        <TableCell className="text-slate-400">{i + 1}</TableCell>
                        <TableCell>{trip.date ? formatDate(trip.date) : '—'}</TableCell>
                        <TableCell className="max-w-[120px] truncate">
                          {trip.driverName || trip.driverId || '—'}
                        </TableCell>
                        <TableCell>
                          {trip.platform ? (
                            <Badge variant="outline" className="text-[10px]">{trip.platform}</Badge>
                          ) : '—'}
                        </TableCell>
                        <TableCell>{trip.status || '—'}</TableCell>
                        <TableCell className="text-right font-mono">
                          {trip.amount != null ? trip.amount.toFixed(2) : '—'}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {trip.distance != null ? `${trip.distance.toFixed(1)} km` : '—'}
                        </TableCell>
                        <TableCell className="max-w-[150px] truncate text-slate-500">
                          {trip.pickupLocation || trip.pickupArea || '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {validRecords.length > 20 && (
                <div className="text-center py-2 text-xs text-slate-400 border-t">
                  ...and {(validRecords.length - 20).toLocaleString()} more records
                </div>
              )}
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={() => { setFlowStep('upload'); setValidRecords([]); setErrors([]); }}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Upload Different File
            </Button>
            <Button
              onClick={handleImport}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Import {validRecords.length.toLocaleString()} Trips
            </Button>
          </div>
        </div>
      )}

      {/* ═══ STEP: IMPORTING ═══ */}
      {flowStep === 'importing' && (
        <Card>
          <CardContent className="py-12">
            <div className="max-w-md mx-auto space-y-4 text-center">
              <Loader2 className="h-10 w-10 text-indigo-500 animate-spin mx-auto" />
              <div>
                <p className="text-sm font-medium text-slate-700">Importing trips...</p>
                <p className="text-xs text-slate-500 mt-1">
                  The server writes ledger entries automatically for each batch.
                </p>
              </div>
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-slate-400">{progress}% complete</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══ STEP: SUCCESS ═══ */}
      {flowStep === 'success' && importResult && (
        <div className="space-y-4">
          <Card className="border-emerald-200 bg-emerald-50/50">
            <CardContent className="py-8 text-center">
              <CheckCircle className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-emerald-800">
                Import Complete
              </h3>
              <p className="text-sm text-emerald-700 mt-2">
                Successfully imported <strong>{importResult.success.toLocaleString()}</strong> trips.
              </p>
              {importResult.weeks > 0 && (
                <p className="text-xs text-emerald-600 mt-1">
                  Ledger entries were automatically created/updated for <strong>{importResult.weeks}</strong> week(s).
                </p>
              )}
              {importResult.failed > 0 && (
                <p className="text-xs text-red-600 mt-2">
                  {importResult.failed} record(s) failed to import.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Summary details */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-xl font-bold text-emerald-600">{importResult.success.toLocaleString()}</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-wide">Imported</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-xl font-bold text-red-500">{importResult.failed}</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-wide">Failed</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-xl font-bold text-indigo-600">{importResult.weeks}</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-wide">Weeks Covered</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-xl font-bold text-slate-700 text-[11px] font-mono break-all">
                  {importResult.batchId.slice(0, 20)}
                </p>
                <p className="text-[10px] text-slate-500 uppercase tracking-wide">Batch ID</p>
              </CardContent>
            </Card>
          </div>

          {/* Import errors detail */}
          {importResult.errors.length > 0 && (
            <Alert variant="destructive" className="border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle className="text-sm">Import Errors</AlertTitle>
              <AlertDescription className="text-xs mt-2 max-h-32 overflow-y-auto">
                <ul className="space-y-1">
                  {importResult.errors.slice(0, 10).map((err, i) => (
                    <li key={i}>Record {err.row}: {err.error}</li>
                  ))}
                  {importResult.errors.length > 10 && (
                    <li className="italic">...and {importResult.errors.length - 10} more</li>
                  )}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={onBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Import Center
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setFlowStep('upload');
                setValidRecords([]);
                setErrors([]);
                setImportResult(null);
                setProgress(0);
              }}
            >
              Import Another File
            </Button>
          </div>
        </div>
      )}

      {/* ═══ STEP: ERROR ═══ */}
      {flowStep === 'error' && (
        <Card className="border-red-200">
          <CardContent className="py-8 text-center">
            <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-red-800">Import Failed</h3>
            <p className="text-sm text-red-600 mt-2">
              An unexpected error occurred during the import. Check the console for details.
            </p>
            <div className="flex justify-center gap-3 mt-6">
              <Button variant="outline" onClick={onBack}>
                Back to Import Center
              </Button>
              <Button onClick={() => setFlowStep('preview')}>
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info box */}
      {(flowStep === 'upload' || flowStep === 'preview') && (
        <Alert className="border-blue-200 bg-blue-50/50">
          <Info className="h-4 w-4 text-blue-500" />
          <AlertTitle className="text-blue-800 text-xs font-medium">How Trip Re-Import Works</AlertTitle>
          <AlertDescription className="text-blue-700 text-xs mt-1 space-y-1">
            <p>1. Upload a CSV with trip data (exported from this system or manually prepared).</p>
            <p>2. Required columns: <strong>date</strong>, <strong>driverId</strong> or <strong>driverName</strong>, <strong>amount</strong>.</p>
            <p>3. Dates accept DD/MM/YYYY, YYYY-MM-DD, or ISO formats. Amounts accept $ and commas.</p>
            <p>4. Trips with existing IDs will be updated; new trips get auto-generated IDs.</p>
            <p>5. The write-time ledger is <strong>automatically updated</strong> — no manual ledger backfill needed.</p>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}