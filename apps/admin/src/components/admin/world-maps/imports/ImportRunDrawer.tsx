// Stitch: dominion-redesign/s36g-imports-checks
import { useState } from 'react';
import { fetchImpact, publishVersion } from '../levels/levelsApi';
import { importChip, publishInOrder, type ImportRow, type ImportRun } from './importsApi';

export function ImportRunDrawer({
  token,
  run,
  saved,
  onClose,
  onPublished,
}: {
  token: string;
  run: ImportRun;
  saved: Array<{ pcode: string; version_id: string; level: number; name: string }>;
  onClose: () => void;
  onPublished: (message: string) => void;
}) {
  const rows = run.report ?? [];
  const matched = rows.filter((row) => row.matched && row.valid);
  const unknown = rows.filter((row) => !row.matched);
  const broken = rows.filter((row) => row.matched && !row.valid);
  const [tab, setTab] = useState<'matched' | 'unknown' | 'broken'>('broken');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const chip = importChip(run.counts?.broken ?? broken.length, run.counts?.unknown ?? unknown.length);
  const list = tab === 'matched' ? matched : tab === 'unknown' ? unknown : broken;
  const canPublish = typed.trim() === 'PUBLISH' && saved.length > 0 && chip.tone !== 'red';

  async function publishAll() {
    setBusy(true);
    const result = await publishInOrder(saved, async (area) => {
      await fetchImpact(token, area.pcode, area.version_id);
      await publishVersion(token, area.pcode, area.version_id, area.name);
    });
    setBusy(false);
    onPublished(result.stopped
      ? `Stopped at ${result.stopped}. Went live: ${result.live.join(', ') || 'none'}. ${result.error || ''}`
      : `Went live: ${result.live.join(', ')}`);
  }

  return (
    <div className="xl:col-span-5 bg-surface-container-lowest rounded-xl shadow-md p-6 space-y-4" data-stitch="parishes-2026-10.geojson close matched 12 unknown 1 broken 1 download error geojson publish drafts from this import…">
      <div className="flex items-start justify-between">
        <div>
          <span className="text-[10px] font-label font-bold uppercase tracking-wider text-secondary bg-secondary-container px-1.5 py-0.5 rounded">Run Drawer</span>
          <h4 className="text-sm font-bold font-headline text-on-surface mt-1">{run.file_name}</h4>
        </div>
        <button type="button" className="text-on-surface-variant" onClick={onClose}>
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" className="px-2.5 py-1 text-xs rounded bg-surface-container-low" onClick={() => setTab('matched')}>Matched {matched.length}</button>
        <button type="button" className="px-2.5 py-1 text-xs rounded bg-amber-100 text-amber-900" onClick={() => setTab('unknown')}>Unknown {unknown.length}</button>
        <button type="button" className="px-2.5 py-1 text-xs font-bold rounded bg-error text-on-error" onClick={() => setTab('broken')}>Broken {broken.length}</button>
      </div>
      <div className="space-y-2 bg-surface-container-low p-4 rounded-lg max-h-48 overflow-auto">
        {list.length === 0 ? <p className="text-xs text-on-surface-variant">Nothing in this list.</p> : list.map((row) => (
          <div key={`${row.pcode}-${row.name}`} className="text-xs">
            <div className="font-bold text-on-surface">{row.pcode} {row.name}</div>
            <p className="text-[11px] text-on-surface-variant">{row.valid ? 'Valid shape' : 'This file has no area shape.'}</p>
          </div>
        ))}
        {(run.errors ?? []).slice(0, 8).map((line) => <p key={line} className="text-[11px] text-error">{line}</p>)}
      </div>
      <button type="button" className="text-xs text-on-surface-variant underline" onClick={() => downloadErrors(run)}>Download error GeoJSON</button>
      <label className="block text-xs text-on-surface-variant">
        Type PUBLISH to confirm
        <input className="mt-1 w-full px-3 py-1.5 bg-surface-container-low rounded-lg text-xs" value={typed} onChange={(event) => setTyped(event.target.value)} />
      </label>
      <button type="button" disabled={!canPublish || busy} className="px-3.5 py-1.5 text-xs font-semibold bg-secondary text-on-secondary rounded-lg disabled:bg-surface-container-highest disabled:text-outline" onClick={() => void publishAll()}>
        Publish drafts from this import…
      </button>
    </div>
  );
}

function downloadErrors(run: ImportRun) {
  const blob = new Blob([JSON.stringify({ errors: run.errors ?? [], rows: (run.report ?? []).filter((row) => !row.valid) }, null, 2)], { type: 'application/geo+json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'import-errors.geojson';
  link.click();
  URL.revokeObjectURL(url);
}

export type { ImportRow };
