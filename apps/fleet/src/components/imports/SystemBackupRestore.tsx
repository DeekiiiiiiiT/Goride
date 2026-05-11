import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Progress } from '../ui/progress';
import { Input } from '../ui/input';
import {
  HardDrive, Download, Upload, ArrowLeft, CheckCircle, AlertCircle,
  AlertTriangle, Loader2, FileArchive, Shield, ShieldAlert, Info,
} from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { generateFullBackup, parseBackupZip, BackupManifest, BACKUP_CATEGORIES } from '../../services/data-export';
import { restoreFullBackup, FullRestoreResult } from '../../services/data-import-executor';
import JSZip from 'jszip';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

type Mode = 'menu' | 'backup' | 'restore';
type BackupStep = 'ready' | 'generating' | 'done' | 'error';
type RestoreStep = 'upload' | 'parsing' | 'review' | 'confirm' | 'restoring' | 'done' | 'error';

interface Props {
  onBack: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

export function SystemBackupRestore({ onBack }: Props) {
  const [mode, setMode] = useState<Mode>('menu');

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={mode === 'menu' ? onBack : () => setMode('menu')} className="h-8 px-2">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Full System Backup & Restore</h3>
          <p className="text-sm text-slate-500">Download or restore your entire fleet database as a single ZIP archive.</p>
        </div>
      </div>

      {mode === 'menu' && <MenuView onBackup={() => setMode('backup')} onRestore={() => setMode('restore')} />}
      {mode === 'backup' && <BackupView />}
      {mode === 'restore' && <RestoreView />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Menu View
// ═══════════════════════════════════════════════════════════════════════════

function MenuView({ onBackup, onRestore }: { onBackup: () => void; onRestore: () => void }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Backup Card */}
      <Card
        className="cursor-pointer border-2 border-emerald-100 hover:border-emerald-400 hover:shadow-md transition-all"
        onClick={onBackup}
      >
        <CardContent className="p-6 flex flex-col items-center text-center gap-3">
          <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
            <Download className="h-7 w-7 text-emerald-600" />
          </div>
          <div>
            <h4 className="text-base font-semibold text-slate-900">Download Full Backup</h4>
            <p className="text-sm text-slate-500 mt-1">
              Export all {BACKUP_CATEGORIES.length} data categories as a single ZIP file. Includes drivers, vehicles, trips, transactions, fuel, and all infrastructure data.
            </p>
          </div>
          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Safe — Read-only</Badge>
        </CardContent>
      </Card>

      {/* Restore Card */}
      <Card
        className="cursor-pointer border-2 border-red-100 hover:border-red-400 hover:shadow-md transition-all"
        onClick={onRestore}
      >
        <CardContent className="p-6 flex flex-col items-center text-center gap-3">
          <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center">
            <Upload className="h-7 w-7 text-red-600" />
          </div>
          <div>
            <h4 className="text-base font-semibold text-slate-900">Restore from Backup</h4>
            <p className="text-sm text-slate-500 mt-1">
              Upload a previously-exported ZIP backup to restore data. Supports merge mode (default) or full replace.
            </p>
          </div>
          <Badge className="bg-red-100 text-red-700 border-red-200">Caution — Writes data</Badge>
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Backup View
// ═══════════════════════════════════════════════════════════════════════════

function BackupView() {
  const [step, setStep] = useState<BackupStep>('ready');
  const [progressLabel, setProgressLabel] = useState('');
  const [progressPct, setProgressPct] = useState(0);
  const [manifest, setManifest] = useState<BackupManifest | null>(null);

  const handleGenerate = useCallback(async () => {
    setStep('generating');
    setProgressPct(0);
    try {
      const { blob, manifest: m } = await generateFullBackup((completed, total, label) => {
        setProgressLabel(label);
        setProgressPct(Math.round((completed / total) * 100));
      });
      setManifest(m);

      // Download
      const now = new Date();
      const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
      const filename = `roam_fleet_backup_${ts}.zip`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`Backup downloaded: ${filename} (${(blob.size / 1024 / 1024).toFixed(1)} MB)`);
      setStep('done');
    } catch (err: any) {
      console.error('Backup generation failed:', err);
      toast.error(`Backup failed: ${err.message}`);
      setStep('error');
    }
  }, []);

  return (
    <div className="space-y-4">
      {/* Ready state */}
      {step === 'ready' && (
        <Card className="border-emerald-200">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-5 w-5 text-emerald-600" />
              Generate Full System Backup
            </CardTitle>
            <CardDescription>
              This will fetch all {BACKUP_CATEGORIES.length} data categories and bundle them into a compressed ZIP file.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {BACKUP_CATEGORIES.map(cat => (
                <div key={cat.key} className="px-2 py-1.5 rounded bg-slate-50 border text-xs text-slate-600 truncate">
                  {cat.key}
                </div>
              ))}
            </div>
            <Button onClick={handleGenerate} className="w-full bg-emerald-600 hover:bg-emerald-700">
              <Download className="h-4 w-4 mr-2" />
              Download Full Backup ZIP
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Generating */}
      {step === 'generating' && (
        <Card>
          <CardContent className="py-12">
            <div className="max-w-md mx-auto space-y-4 text-center">
              <Loader2 className="h-10 w-10 text-emerald-500 animate-spin mx-auto" />
              <p className="text-sm font-medium text-slate-700">Generating backup...</p>
              <p className="text-xs text-slate-500">{progressLabel}</p>
              <Progress value={progressPct} className="h-2" />
              <p className="text-xs text-slate-400">{progressPct}%</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Done */}
      {step === 'done' && manifest && (
        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardContent className="py-8 text-center space-y-4">
            <CheckCircle className="h-12 w-12 text-emerald-500 mx-auto" />
            <h3 className="text-lg font-semibold text-emerald-800">Backup Complete</h3>
            <p className="text-sm text-emerald-700">
              <strong>{manifest.totalRecords.toLocaleString()}</strong> total records across{' '}
              <strong>{Object.keys(manifest.categories).length}</strong> categories.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-w-lg mx-auto">
              {Object.entries(manifest.categories).map(([key, cat]) => (
                <div
                  key={key}
                  className={`px-2 py-1.5 rounded border text-xs truncate ${
                    cat.status === 'ok' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'
                  }`}
                >
                  {key}: {cat.recordCount.toLocaleString()}
                </div>
              ))}
            </div>
            {Object.values(manifest.categories).some(c => c.status === 'error') && (
              <Alert variant="destructive" className="max-w-lg mx-auto border-red-200 bg-red-50">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle className="text-xs">Some categories had errors</AlertTitle>
                <AlertDescription className="text-xs mt-1">
                  {Object.entries(manifest.categories)
                    .filter(([, c]) => c.status === 'error')
                    .map(([k, c]) => `${k}: ${c.error}`)
                    .join('; ')}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {step === 'error' && (
        <Card className="border-red-200">
          <CardContent className="py-8 text-center">
            <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-red-800">Backup Failed</h3>
            <p className="text-sm text-red-600 mt-2">Check the console for details.</p>
            <Button onClick={() => setStep('ready')} className="mt-4">Try Again</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Restore View
// ═══════════════════════════════════════════════════════════════════════════

function RestoreView() {
  const [step, setStep] = useState<RestoreStep>('upload');
  const [fileName, setFileName] = useState('');
  const [manifest, setManifest] = useState<BackupManifest | null>(null);
  const [fileList, setFileList] = useState<{ name: string }[]>([]);
  const [zip, setZip] = useState<JSZip | null>(null);
  const [restoreMode, setRestoreMode] = useState<'merge' | 'replace'>('merge');
  const [confirmText, setConfirmText] = useState('');
  const [progressLabel, setProgressLabel] = useState('');
  const [progressPct, setProgressPct] = useState(0);
  const [restoreResult, setRestoreResult] = useState<FullRestoreResult | null>(null);

  // ─── File Upload ───────────────────────────────────────────────────────

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    const file = acceptedFiles[0];
    if (!file.name.endsWith('.zip')) {
      toast.error('Please upload a .zip file.');
      return;
    }

    setFileName(file.name);
    setStep('parsing');

    try {
      const { manifest: m, files, zip: z } = await parseBackupZip(file);
      setManifest(m);
      setFileList(files);
      setZip(z);
      setStep('review');
    } catch (err: any) {
      console.error('Failed to parse backup ZIP:', err);
      toast.error(`Invalid ZIP file: ${err.message}`);
      setStep('upload');
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/zip': ['.zip'] },
    maxFiles: 1,
    multiple: false,
  });

  // ─── Restore Execution ─────────────────────────────────────────────────

  const handleRestore = useCallback(async () => {
    if (!zip) return;

    if (restoreMode === 'replace' && confirmText !== 'REPLACE ALL DATA') {
      toast.error('Please type "REPLACE ALL DATA" to confirm.');
      return;
    }

    setStep('restoring');
    setProgressPct(0);

    try {
      const result = await restoreFullBackup(zip, (stage, pct) => {
        setProgressLabel(stage);
        setProgressPct(pct);
      });

      setRestoreResult(result);
      setStep('done');

      if (result.totalSuccess > 0) {
        toast.success(`Restored ${result.totalSuccess.toLocaleString()} records.`);
      }
      if (result.totalFailed > 0) {
        toast.warning(`${result.totalFailed} records failed.`);
      }
    } catch (err: any) {
      console.error('Full restore failed:', err);
      toast.error(`Restore failed: ${err.message}`);
      setStep('error');
    }
  }, [zip, restoreMode, confirmText]);

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* ═══ UPLOAD ═══ */}
      {step === 'upload' && (
        <div className="space-y-4">
          <Alert className="border-amber-200 bg-amber-50">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-800 text-sm font-semibold">Important</AlertTitle>
            <AlertDescription className="text-amber-700 text-xs mt-1">
              Restoring from a backup will write data to your system. In <strong>Merge</strong> mode (default), existing records with matching IDs will be updated. In <strong>Replace</strong> mode, you must confirm before proceeding.
            </AlertDescription>
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Upload Backup ZIP</CardTitle>
              <CardDescription>Select a previously-exported Roam Fleet backup ZIP file.</CardDescription>
            </CardHeader>
            <CardContent>
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${
                  isDragActive ? 'border-red-400 bg-red-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <input {...getInputProps()} />
                <FileArchive className="h-10 w-10 mx-auto text-slate-400 mb-3" />
                <p className="text-sm text-slate-600 font-medium">
                  {isDragActive ? 'Drop the ZIP file here...' : 'Drag & drop a backup ZIP, or click to select'}
                </p>
                <p className="text-xs text-slate-400 mt-1">Only .zip files from Roam Fleet backup are accepted</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══ PARSING ═══ */}
      {step === 'parsing' && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
            <p className="text-sm text-slate-600">Reading {fileName}...</p>
          </CardContent>
        </Card>
      )}

      {/* ═══ REVIEW ═══ */}
      {step === 'review' && (
        <div className="space-y-4">
          {/* Manifest Summary */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileArchive className="h-5 w-5 text-indigo-500" />
                  Backup Contents
                </CardTitle>
                <Badge variant="outline" className="text-xs">{fileName}</Badge>
              </div>
              {manifest && (
                <CardDescription>
                  Created {new Date(manifest.generatedAt).toLocaleDateString('en-JM', {
                    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                  })} — {manifest.roamFleetVersion} — {manifest.totalRecords.toLocaleString()} total records
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              {manifest ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {Object.entries(manifest.categories).map(([key, cat]) => (
                    <div
                      key={key}
                      className={`px-2.5 py-2 rounded border text-xs ${
                        cat.status === 'ok' && cat.recordCount > 0
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : cat.status === 'error'
                          ? 'bg-red-50 text-red-600 border-red-200'
                          : 'bg-slate-50 text-slate-400 border-slate-200'
                      }`}
                    >
                      <p className="font-medium truncate">{key}</p>
                      <p className="text-[10px] mt-0.5">{cat.recordCount.toLocaleString()} records</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  <Alert variant="destructive" className="border-amber-200 bg-amber-50">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <AlertTitle className="text-amber-800 text-xs">No manifest.json found</AlertTitle>
                    <AlertDescription className="text-amber-700 text-xs">
                      This ZIP may not be a valid Roam Fleet backup. Files found: {fileList.map(f => f.name).join(', ')}
                    </AlertDescription>
                  </Alert>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Restore Mode Selection */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Restore Mode</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-slate-50 transition-colors">
                <input
                  type="radio"
                  name="restore-mode"
                  checked={restoreMode === 'merge'}
                  onChange={() => setRestoreMode('merge')}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium text-slate-900">Merge (Recommended)</p>
                  <p className="text-xs text-slate-500 mt-0.5">Import backup data on top of existing data. Records with matching IDs will be updated; new records will be added.</p>
                </div>
              </label>
              <label className="flex items-start gap-3 p-3 rounded-lg border border-red-200 cursor-pointer hover:bg-red-50/50 transition-colors">
                <input
                  type="radio"
                  name="restore-mode"
                  checked={restoreMode === 'replace'}
                  onChange={() => setRestoreMode('replace')}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium text-red-800">Replace (Destructive)</p>
                  <p className="text-xs text-red-600 mt-0.5">Import backup data and overwrite all existing records. This cannot be undone.</p>
                </div>
              </label>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={() => { setStep('upload'); setManifest(null); setZip(null); }}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Upload Different File
            </Button>
            <Button
              onClick={() => setStep('confirm')}
              className={restoreMode === 'replace' ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'}
            >
              <ShieldAlert className="h-4 w-4 mr-2" />
              Proceed to Restore
            </Button>
          </div>
        </div>
      )}

      {/* ═══ CONFIRM ═══ */}
      {step === 'confirm' && (
        <Card className={restoreMode === 'replace' ? 'border-red-300 bg-red-50/30' : 'border-indigo-200'}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              {restoreMode === 'replace' ? (
                <ShieldAlert className="h-5 w-5 text-red-600" />
              ) : (
                <Shield className="h-5 w-5 text-indigo-600" />
              )}
              Confirm {restoreMode === 'replace' ? 'Full Replace' : 'Merge'} Restore
            </CardTitle>
            <CardDescription>
              {restoreMode === 'replace'
                ? 'WARNING: This will overwrite existing data with the backup contents. This cannot be undone.'
                : 'Data will be merged with your existing records. Matching IDs will be updated.'
              }
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {manifest && (
              <div className="p-3 rounded bg-slate-50 border text-sm">
                <p className="font-medium text-slate-700">Restoring from: {fileName}</p>
                <p className="text-xs text-slate-500 mt-1">
                  {manifest.totalRecords.toLocaleString()} records across{' '}
                  {Object.keys(manifest.categories).length} categories
                </p>
              </div>
            )}

            {restoreMode === 'replace' && (
              <div className="space-y-2">
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle className="text-sm">Type "REPLACE ALL DATA" to confirm</AlertTitle>
                  <AlertDescription className="text-xs">
                    This is a destructive operation. All existing records will be overwritten.
                  </AlertDescription>
                </Alert>
                <Input
                  value={confirmText}
                  onChange={e => setConfirmText(e.target.value)}
                  placeholder="Type REPLACE ALL DATA"
                  className="font-mono text-sm"
                />
              </div>
            )}

            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={() => setStep('review')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button
                onClick={handleRestore}
                disabled={restoreMode === 'replace' && confirmText !== 'REPLACE ALL DATA'}
                className={restoreMode === 'replace' ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'}
              >
                {restoreMode === 'replace' ? 'Replace & Restore' : 'Merge & Restore'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══ RESTORING ═══ */}
      {step === 'restoring' && (
        <Card>
          <CardContent className="py-12">
            <div className="max-w-md mx-auto space-y-4 text-center">
              <Loader2 className="h-10 w-10 text-indigo-500 animate-spin mx-auto" />
              <p className="text-sm font-medium text-slate-700">Restoring data...</p>
              <p className="text-xs text-slate-500">{progressLabel}</p>
              <Progress value={progressPct} className="h-2" />
              <p className="text-xs text-slate-400">{progressPct}%</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══ DONE ═══ */}
      {step === 'done' && restoreResult && (
        <div className="space-y-4">
          <Card className="border-emerald-200 bg-emerald-50/50">
            <CardContent className="py-8 text-center">
              <CheckCircle className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-emerald-800">Restore Complete</h3>
              <p className="text-sm text-emerald-700 mt-2">
                Successfully restored <strong>{restoreResult.totalSuccess.toLocaleString()}</strong> records.
                {restoreResult.totalFailed > 0 && (
                  <span className="text-red-600"> ({restoreResult.totalFailed} failed)</span>
                )}
              </p>
            </CardContent>
          </Card>

          {/* Per-category breakdown */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Restore Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {Object.entries(restoreResult.categories).map(([label, cat]) => (
                  <div
                    key={label}
                    className={`px-3 py-2 rounded border text-xs ${
                      cat.success > 0 && cat.failed === 0
                        ? 'bg-emerald-50 border-emerald-200'
                        : cat.failed > 0
                        ? 'bg-amber-50 border-amber-200'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-700">{label}</span>
                      <div className="flex items-center gap-2">
                        {cat.success > 0 && (
                          <span className="text-emerald-600">{cat.success.toLocaleString()} ok</span>
                        )}
                        {cat.failed > 0 && (
                          <span className="text-red-500">{cat.failed} err</span>
                        )}
                      </div>
                    </div>
                    {cat.errors.length > 0 && (
                      <p className="text-[10px] text-red-500 mt-1 truncate">{cat.errors[0]}</p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {restoreResult.skipped.length > 0 && (
            <Alert className="border-slate-200 bg-slate-50">
              <Info className="h-4 w-4 text-slate-500" />
              <AlertTitle className="text-xs text-slate-700">Skipped Categories</AlertTitle>
              <AlertDescription className="text-xs text-slate-500">
                {restoreResult.skipped.join(', ')} — files not found in the ZIP or had no records.
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* ═══ ERROR ═══ */}
      {step === 'error' && (
        <Card className="border-red-200">
          <CardContent className="py-8 text-center">
            <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-red-800">Restore Failed</h3>
            <p className="text-sm text-red-600 mt-2">An unexpected error occurred. Check the console for details.</p>
            <div className="flex justify-center gap-3 mt-6">
              <Button variant="outline" onClick={() => setStep('upload')}>Upload New File</Button>
              <Button onClick={() => setStep('review')}>Try Again</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}