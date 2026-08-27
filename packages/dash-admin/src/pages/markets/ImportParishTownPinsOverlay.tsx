/**
 * Overlay to upload or paste GeoJSON Point pins for parish town/city reference.
 */
import React, { useEffect, useRef, useState } from 'react';
import { FileUp, MapPin, Upload, X } from 'lucide-react';
import { toast } from 'sonner';

type ImportParishTownPinsOverlayProps = {
  open: boolean;
  parishName: string;
  text: string;
  saving?: boolean;
  onTextChange: (value: string) => void;
  onClose: () => void;
  onImport: () => void;
};

export function ImportParishTownPinsOverlay({
  open,
  parishName,
  text,
  saving,
  onTextChange,
  onClose,
  onImport,
}: ImportParishTownPinsOverlayProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  useEffect(() => {
    if (!open) setFileName(null);
  }, [open]);

  if (!open) return null;

  const onPickFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      if (!content.trim()) {
        toast.error('That file is empty');
        return;
      }
      setFileName(file.name);
      onTextChange(content);
      toast.success(`Loaded ${file.name}`);
    };
    reader.onerror = () => toast.error('Could not read that file');
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-3 sm:p-6">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-town-pins-title"
        className="relative w-full max-w-xl max-h-[88vh] overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl flex flex-col"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-4 py-3">
          <div>
            <h2 id="import-town-pins-title" className="text-base font-semibold text-white">
              Import town pins (legacy) · GeoJSON
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Upload Point features for towns/cities in {parishName}. These are reference pins only —
              not delivery borders. Prefer catalog towns from Import Boundaries.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            Legacy fallback. Official town locations come from COD-AB admin2 centroids and market
            borders — use Import Boundaries / catalog create when possible.
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".geojson,.json,application/geo+json,application/json"
            className="hidden"
            onChange={(e) => {
              onPickFile(e.target.files?.[0] ?? null);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-600 bg-slate-950/60 px-4 py-6 text-slate-300 hover:border-sky-500/50 hover:bg-slate-950"
          >
            <FileUp className="w-6 h-6 text-sky-300" />
            <span className="text-sm font-medium text-white">Choose GeoJSON file</span>
            <span className="text-[11px] text-slate-500">
              FeatureCollection of Points · .geojson or .json
              {fileName ? ` · loaded: ${fileName}` : ''}
            </span>
          </button>

          <p className="text-[10px] uppercase tracking-wide text-slate-500">Or paste below</p>
          <textarea
            value={text}
            onChange={(e) => {
              setFileName(null);
              onTextChange(e.target.value);
            }}
            placeholder='Paste GeoJSON FeatureCollection with Point features (uses properties.city for labels)'
            className="w-full h-40 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-200 p-3 font-mono"
          />
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-800 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-lg border border-slate-700 text-xs text-slate-300"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || !text.trim()}
            onClick={onImport}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sky-500 text-slate-950 text-xs font-semibold disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5" />
            {saving ? 'Importing…' : 'Import town pins'}
          </button>
        </div>
      </div>
    </div>
  );
}
