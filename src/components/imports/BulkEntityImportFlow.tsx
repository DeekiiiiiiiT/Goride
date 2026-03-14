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
  UploadCloud, ArrowLeft, CheckCircle, AlertCircle,
  FileText, Loader2, Info, Download,
} from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { validateImportFile, ImportType, ValidationError } from '../../services/import-validator';
import { importExecutor, RestoreResult } from '../../services/data-import-executor';
import { downloadImportTemplate } from '../../services/data-export';
import { fetchFleetTimezone } from '../../services/api';

// ═══════════════════════════════════════════════════════════════════════════
// Config per entity type
// ═══════════════════════════════════════════════════════════════════════════

interface EntityConfig {
  label: string;
  importType: ImportType;
  description: string;
  requiredFields: string;
  previewColumns: { key: string; label: string }[];
}

const ENTITY_CONFIGS: Record<string, EntityConfig> = {
  driver: {
    label: 'Driver',
    importType: 'driver',
    description: 'Import driver profiles with contact details, license information, and hire dates.',
    requiredFields: 'name',
    previewColumns: [
      { key: 'name', label: 'Name' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' },
      { key: 'licenseNumber', label: 'License #' },
      { key: 'status', label: 'Status' },
    ],
  },
  vehicle: {
    label: 'Vehicle',
    importType: 'vehicle',
    description: 'Import vehicle profiles with plate numbers, make/model, and document expiries.',
    requiredFields: 'licensePlate',
    previewColumns: [
      { key: 'licensePlate', label: 'Plate' },
      { key: 'make', label: 'Make' },
      { key: 'model', label: 'Model' },
      { key: 'year', label: 'Year' },
      { key: 'status', label: 'Status' },
    ],
  },
  transaction: {
    label: 'Financial Transaction',
    importType: 'transaction',
    description: 'Import financial transactions: fuel charges, toll fees, maintenance costs, and payouts.',
    requiredFields: 'date, amount, category',
    previewColumns: [
      { key: 'date', label: 'Date' },
      { key: 'category', label: 'Category' },
      { key: 'amount', label: 'Amount' },
      { key: 'driverName', label: 'Driver' },
      { key: 'status', label: 'Status' },
    ],
  },
  // Phase 6: Infrastructure entities
  tollTag: {
    label: 'Toll Tag',
    importType: 'tollTag',
    description: 'Import toll tag records with tag numbers, providers, and assigned vehicles.',
    requiredFields: 'tagNumber',
    previewColumns: [
      { key: 'tagNumber', label: 'Tag #' },
      { key: 'vehicleId', label: 'Vehicle' },
      { key: 'status', label: 'Status' },
    ],
  },
  tollPlaza: {
    label: 'Toll Plaza',
    importType: 'tollPlaza',
    description: 'Import toll plaza locations with names, coordinates, and rates.',
    requiredFields: 'name',
    previewColumns: [
      { key: 'name', label: 'Name' },
      { key: 'location', label: 'Location' },
      { key: 'status', label: 'Status' },
    ],
  },
  station: {
    label: 'Gas Station',
    importType: 'station',
    description: 'Import gas station records. For advanced geocoding and matching, use the Station Database wizard.',
    requiredFields: 'name',
    previewColumns: [
      { key: 'name', label: 'Name' },
      { key: 'location', label: 'Location' },
      { key: 'status', label: 'Status' },
    ],
  },
  equipment: {
    label: 'Equipment',
    importType: 'equipment',
    description: 'Import fleet equipment items: dashcams, GPS trackers, phone mounts, and more.',
    requiredFields: 'name',
    previewColumns: [
      { key: 'name', label: 'Name' },
      { key: 'description', label: 'Description' },
      { key: 'status', label: 'Status' },
    ],
  },
  inventory: {
    label: 'Inventory',
    importType: 'inventory',
    description: 'Import inventory stock items: spare parts, consumables, and supplies.',
    requiredFields: 'name',
    previewColumns: [
      { key: 'name', label: 'Name' },
      { key: 'description', label: 'Description' },
      { key: 'status', label: 'Status' },
    ],
  },
  claim: {
    label: 'Claim / Dispute',
    importType: 'claim',
    description: 'Import claimable losses, disputes, and insurance claims.',
    requiredFields: 'date, amount, category',
    previewColumns: [
      { key: 'date', label: 'Date' },
      { key: 'category', label: 'Category' },
      { key: 'amount', label: 'Amount' },
      { key: 'driverName', label: 'Driver' },
      { key: 'status', label: 'Status' },
    ],
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

type FlowStep = 'upload' | 'validating' | 'preview' | 'importing' | 'success' | 'error';

interface BulkEntityImportFlowProps {
  entityType: 'driver' | 'vehicle' | 'transaction' | 'tollTag' | 'tollPlaza' | 'station' | 'equipment' | 'inventory' | 'claim';
  onBack: () => void;
}

export function BulkEntityImportFlow({ entityType, onBack }: BulkEntityImportFlowProps) {
  const config = ENTITY_CONFIGS[entityType];
  const [flowStep, setFlowStep] = useState<FlowStep>('upload');
  const [fileName, setFileName] = useState('');
  const [validRecords, setValidRecords] = useState<any[]>([]);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [totalParsed, setTotalParsed] = useState(0);
  const [progress, setProgress] = useState(0);
  const [importResult, setImportResult] = useState<RestoreResult | null>(null);

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
    reader.onload = async (e) => {
      const content = e.target?.result as string;
      if (!content) {
        toast.error('File is empty.');
        setFlowStep('upload');
        return;
      }

      // Fetch fleet timezone for correct naive-timestamp interpretation
      const fleetTimezone = await fetchFleetTimezone();

      const result = validateImportFile(content, config.importType, fleetTimezone);
      setValidRecords(result.validRecords);
      setErrors(result.errors);
      setTotalParsed(result.totalProcessed);

      if (result.validRecords.length === 0) {
        toast.error(`No valid ${config.label.toLowerCase()} records found.`);
        setFlowStep('upload');
        return;
      }

      setFlowStep('preview');
    };
    reader.onerror = () => {
      toast.error('Failed to read the file.');
      setFlowStep('upload');
    };
    reader.readAsText(file);
  }, [config]);

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
      const result = await importExecutor.processBatch(
        validRecords,
        config.importType,
        (pct) => setProgress(pct),
      );

      setImportResult(result);
      setFlowStep('success');

      if (result.successCount > 0) {
        toast.success(`Imported ${result.successCount.toLocaleString()} ${config.label.toLowerCase()}(s).`);
      }
      if (result.failureCount > 0) {
        toast.warning(`${result.failureCount} record(s) failed to import.`);
      }
    } catch (err: any) {
      console.error(`${config.label} import failed:`, err);
      toast.error(`Import failed: ${err.message || 'Unknown error'}`);
      setFlowStep('error');
    }
  }, [validRecords, config]);

  // ─── Helpers ───────────────────────────────────────────────────────────

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    } catch { return iso || '—'; }
  };

  const getCellValue = (record: any, key: string): string => {
    const val = record[key];
    if (val == null || val === '') return '—';
    if (key === 'date' || key.includes('Date') || key.includes('Expiry')) return formatDate(val);
    if (typeof val === 'number') return val.toLocaleString();
    return String(val);
  };

  const previewRecords = validRecords.slice(0, 20);

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="h-8 px-2">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{config.label} Import</h3>
          <p className="text-sm text-slate-500">{config.description}</p>
        </div>
      </div>

      {/* ═══ UPLOAD ═══ */}
      {flowStep === 'upload' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Upload {config.label} CSV</CardTitle>
                <CardDescription>
                  Required column(s): <strong>{config.requiredFields}</strong>. All other fields are optional.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadImportTemplate(config.importType)}
                className="text-xs shrink-0"
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Download Template
              </Button>
            </div>
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

      {/* ═══ VALIDATING ═══ */}
      {flowStep === 'validating' && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
            <p className="text-sm text-slate-600">Validating {fileName}...</p>
          </CardContent>
        </Card>
      )}

      {/* ═══ PREVIEW ═══ */}
      {flowStep === 'preview' && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-emerald-600">{validRecords.length.toLocaleString()}</p>
                <p className="text-xs text-slate-500 mt-1">Valid Records</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-red-500">{errors.length}</p>
                <p className="text-xs text-slate-500 mt-1">Errors</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-slate-700">{totalParsed}</p>
                <p className="text-xs text-slate-500 mt-1">Total Rows</p>
              </CardContent>
            </Card>
          </div>

          {/* Errors */}
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
                    <li className="italic text-red-400">...and {errors.length - 10} more</li>
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
                      {config.previewColumns.map(col => (
                        <TableHead key={col.key}>{col.label}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRecords.map((record, i) => (
                      <TableRow key={i} className="text-xs">
                        <TableCell className="text-slate-400">{i + 1}</TableCell>
                        {config.previewColumns.map(col => (
                          <TableCell key={col.key} className="max-w-[150px] truncate">
                            {getCellValue(record, col.key)}
                          </TableCell>
                        ))}
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

          {/* Actions */}
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
              Import {validRecords.length.toLocaleString()} {config.label}(s)
            </Button>
          </div>
        </div>
      )}

      {/* ═══ IMPORTING ═══ */}
      {flowStep === 'importing' && (
        <Card>
          <CardContent className="py-12">
            <div className="max-w-md mx-auto space-y-4 text-center">
              <Loader2 className="h-10 w-10 text-indigo-500 animate-spin mx-auto" />
              <p className="text-sm font-medium text-slate-700">Importing {config.label.toLowerCase()}s...</p>
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-slate-400">{progress}% complete</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══ SUCCESS ═══ */}
      {flowStep === 'success' && importResult && (
        <div className="space-y-4">
          <Card className="border-emerald-200 bg-emerald-50/50">
            <CardContent className="py-8 text-center">
              <CheckCircle className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-emerald-800">Import Complete</h3>
              <p className="text-sm text-emerald-700 mt-2">
                Successfully imported <strong>{importResult.successCount.toLocaleString()}</strong> {config.label.toLowerCase()}(s).
              </p>
              {importResult.failureCount > 0 && (
                <p className="text-xs text-red-600 mt-2">
                  {importResult.failureCount} record(s) failed.
                </p>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-xl font-bold text-emerald-600">{importResult.successCount.toLocaleString()}</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-wide">Imported</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-xl font-bold text-red-500">{importResult.failureCount}</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-wide">Failed</p>
              </CardContent>
            </Card>
          </div>

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

      {/* ═══ ERROR ═══ */}
      {flowStep === 'error' && (
        <Card className="border-red-200">
          <CardContent className="py-8 text-center">
            <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-red-800">Import Failed</h3>
            <p className="text-sm text-red-600 mt-2">
              An unexpected error occurred. Check the console for details.
            </p>
            <div className="flex justify-center gap-3 mt-6">
              <Button variant="outline" onClick={onBack}>Back</Button>
              <Button onClick={() => setFlowStep('preview')}>Try Again</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info box */}
      {(flowStep === 'upload' || flowStep === 'preview') && (
        <Alert className="border-blue-200 bg-blue-50/50">
          <Info className="h-4 w-4 text-blue-500" />
          <AlertTitle className="text-blue-800 text-xs font-medium">Tips</AlertTitle>
          <AlertDescription className="text-blue-700 text-xs mt-1 space-y-1">
            <p>1. Click <strong>Download Template</strong> for a CSV with the correct headers and an example row.</p>
            <p>2. Required: <strong>{config.requiredFields}</strong>. All other columns are optional.</p>
            <p>3. Dates accept DD/MM/YYYY, YYYY-MM-DD, or ISO formats. Amounts accept $ and commas.</p>
            <p>4. Records with existing IDs will be updated; records without IDs get auto-generated UUIDs.</p>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}