/**
 * Multi-file COD-AB / GeoJSON boundary import — dry-run then commit.
 */
import React, { useRef, useState } from 'react';
import { FileUp, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { importAdminBoundaries, type DashBoundaryImportReport } from '@roam/dash-admin-client';
import {
  parseBoundariesFromGeoJson,
  type ParsedBoundaryFeature,
} from './coverageIo';

type FileBatchRow = ParsedBoundaryFeature & {
  fileName: string;
  warnings: string[];
};

type Props = {
  open: boolean;
  accessToken: string;
  onClose: () => void;
  onImported?: () => void;
};

function featureToImportPayload(f: ParsedBoundaryFeature) {
  const props = f.properties ?? {};
  return {
    admin_level: f.adminLevel,
    pcode: f.pcode,
    parent_pcode: f.parentPcode,
    name: f.name,
    slug: f.slug,
    multiPolygon: f.multiPolygon,
    area_sqkm: f.areaSqkm,
    center_lat: f.centerLat,
    center_lng: f.centerLng,
    source: typeof props.source === 'string' ? props.source : 'cod-ab',
    source_version:
      typeof props.version === 'string' || typeof props.version === 'number'
        ? String(props.version)
        : null,
    valid_on: typeof props.valid_on === 'string' ? props.valid_on : null,
    properties: props,
  };
}

export function ImportBoundariesWizard({ open, accessToken, onClose, onImported }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<FileBatchRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [linkParishes, setLinkParishes] = useState(true);
  const [report, setReport] = useState<DashBoundaryImportReport | null>(null);

  if (!open) return null;

  const reset = () => {
    setRows([]);
    setParseErrors([]);
    setParseWarnings([]);
    setReport(null);
  };

  const onCloseAll = () => {
    reset();
    onClose();
  };

  const ingestFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => /\.(json|geojson)$/i.test(f.name) || f.type.includes('json'));
    if (list.length === 0) {
      toast.error('Drop .json or .geojson files');
      return;
    }
    const nextRows: FileBatchRow[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const file of list) {
      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as unknown;
        const result = parseBoundariesFromGeoJson(parsed);
        for (const err of result.errors) errors.push(`${file.name}: ${err}`);
        for (const w of result.warnings) warnings.push(`${file.name}: ${w}`);
        for (const f of result.features) {
          nextRows.push({ ...f, fileName: file.name, warnings: result.warnings.filter((w) => w.includes(f.name)) });
        }
      } catch (e) {
        errors.push(`${file.name}: ${e instanceof Error ? e.message : 'Failed to parse'}`);
      }
    }

    setRows((prev) => [...prev, ...nextRows]);
    setParseErrors((prev) => [...prev, ...errors]);
    setParseWarnings((prev) => [...prev, ...warnings]);
    if (nextRows.length > 0) toast.success(`Parsed ${nextRows.length} feature(s) from ${list.length} file(s)`);
  };

  const runImport = async (dryRun: boolean) => {
    const features = rows
      .filter((r) => r.pcode && r.adminLevel != null)
      .map(featureToImportPayload);
    if (features.length === 0) {
      toast.error('No features with pcode + admin level to import');
      return;
    }
    setBusy(true);
    try {
      const res = await importAdminBoundaries(accessToken, {
        features,
        dry_run: dryRun,
        link_parishes: linkParishes,
      });
      setReport(res.report);
      const r = res.report;
      const summary = `${r.created} created · ${r.updated} updated · ${r.skipped} skipped`;
      if (dryRun) {
        toast.message(`Dry run: ${summary}`);
      } else {
        toast.success(`Imported: ${summary}`);
        onImported?.();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files?.length) void ingestFiles(e.dataTransfer.files);
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-3 sm:p-6">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-[2px]"
        onClick={onCloseAll}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-boundaries-title"
        className="relative w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl flex flex-col"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-4 py-3">
          <div>
            <h2 id="import-boundaries-title" className="text-base font-semibold text-white">
              Import boundaries
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Drop official COD-AB GeoJSON (admin0–admin3). Dry-run first, then commit.
            </p>
          </div>
          <button
            type="button"
            onClick={onCloseAll}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".geojson,.json,application/geo+json,application/json"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void ingestFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-600 bg-slate-950/60 px-4 py-8 text-slate-300 hover:border-amber-500/50 hover:bg-slate-950"
          >
            <FileUp className="w-7 h-7 text-amber-300" />
            <span className="text-sm font-medium text-white">Drop .json / .geojson files</span>
            <span className="text-[11px] text-slate-500">or click to choose · multiple files OK</span>
          </button>

          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={linkParishes}
              onChange={(e) => setLinkParishes(e.target.checked)}
            />
            Auto-link admin1 features to parish borders by slug
          </label>

          {(parseErrors.length > 0 || parseWarnings.length > 0) && (
            <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-3 space-y-1 max-h-28 overflow-y-auto text-xs">
              {parseErrors.map((e) => (
                <p key={e} className="text-red-300">
                  {e}
                </p>
              ))}
              {parseWarnings.slice(0, 40).map((w) => (
                <p key={w} className="text-amber-200/80">
                  {w}
                </p>
              ))}
            </div>
          )}

          {rows.length > 0 && (
            <div className="rounded-lg border border-slate-700 overflow-hidden">
              <div className="overflow-x-auto max-h-64">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-950 text-slate-400 sticky top-0">
                    <tr>
                      <th className="px-2 py-2 font-medium">Name</th>
                      <th className="px-2 py-2 font-medium">Pcode</th>
                      <th className="px-2 py-2 font-medium">Level</th>
                      <th className="px-2 py-2 font-medium">Parts</th>
                      <th className="px-2 py-2 font-medium">Holes</th>
                      <th className="px-2 py-2 font-medium">Vertices</th>
                      <th className="px-2 py-2 font-medium">File</th>
                      <th className="px-2 py-2 font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={`${r.pcode ?? r.name}-${i}`} className="border-t border-slate-800 text-slate-200">
                        <td className="px-2 py-1.5">{r.name}</td>
                        <td className="px-2 py-1.5 font-mono text-[11px]">{r.pcode ?? '—'}</td>
                        <td className="px-2 py-1.5">{r.adminLevel ?? '—'}</td>
                        <td className="px-2 py-1.5">{r.partCount}</td>
                        <td className="px-2 py-1.5">{r.holeCount}</td>
                        <td className="px-2 py-1.5">{r.vertexCount.toLocaleString()}</td>
                        <td className="px-2 py-1.5 text-slate-500 truncate max-w-[120px]">{r.fileName}</td>
                        <td className="px-2 py-1.5 text-amber-200/70 truncate max-w-[140px]">
                          {!r.pcode ? 'missing pcode' : r.warnings[0] ?? ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="px-3 py-2 text-[11px] text-slate-500 border-t border-slate-800">
                {rows.length} feature(s) · {rows.filter((r) => r.pcode && r.adminLevel != null).length} ready to
                upsert
              </p>
            </div>
          )}

          {report && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100 space-y-1">
              <p className="font-medium text-amber-200">
                {report.dry_run ? 'Dry-run report' : 'Import report'}
              </p>
              <p>
                Created {report.created} · Updated {report.updated} · Skipped {report.skipped}
                {report.linked_parishes > 0 ? ` · Linked parishes ${report.linked_parishes}` : ''}
              </p>
              {report.errors.slice(0, 12).map((e) => (
                <p key={e} className="text-red-300">
                  {e}
                </p>
              ))}
              {report.warnings.slice(0, 12).map((w) => (
                <p key={w} className="text-amber-100/70">
                  {w}
                </p>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 px-4 py-3">
          <button
            type="button"
            onClick={reset}
            className="px-3 py-2 rounded-lg border border-slate-700 text-sm text-slate-300"
          >
            Clear
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCloseAll}
              className="px-3 py-2 rounded-lg border border-slate-700 text-sm text-slate-300"
            >
              Close
            </button>
            <button
              type="button"
              disabled={busy || rows.length === 0}
              onClick={() => void runImport(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-amber-500/40 text-sm text-amber-100 disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Dry-run
            </button>
            <button
              type="button"
              disabled={busy || rows.length === 0}
              onClick={() => void runImport(false)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500 text-slate-950 text-sm font-semibold disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Commit import
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
