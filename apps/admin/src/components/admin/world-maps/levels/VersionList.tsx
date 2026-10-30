// Stitch: dominion-redesign/s36d-border-editor
import { isOldTemplate, sortBoundaryVersions } from '../boundaryVersions';
import type { VersionRow } from './levelsFormat';

export function VersionList({
  rows,
  chosen,
  onChoose,
  onDiscard,
  canWrite,
}: {
  rows: VersionRow[];
  chosen: string | null;
  onChoose: (id: string) => void;
  onDiscard: (id: string) => void;
  canWrite: boolean;
}) {
  const ordered = sortBoundaryVersions(rows.filter((row) => row.status !== 'discarded'));
  return (
    <div className="flex flex-col gap-2" data-stitch="discard draft live · v1 old template · v0">
      <span className="text-[11px] font-label uppercase tracking-wider text-outline font-semibold">Versions</span>
      <div className="flex flex-col gap-1.5">
        {ordered.map((row) => {
          const live = row.status === 'published';
          const draft = row.status === 'draft';
          const old = isOldTemplate(row.notes);
          const on = row.id === chosen;
          return (
            <div key={row.id} className={on ? 'p-3 rounded-lg bg-surface-container-low flex flex-col gap-1 shadow-sm' : 'p-2.5 rounded-lg hover:bg-surface-container-low transition-colors'}>
              <div className="flex items-center justify-between gap-2">
                <button type="button" className="text-xs font-medium text-on-surface text-left" onClick={() => onChoose(row.id)}>
                  <span className={`inline-flex items-center gap-1.5 ${draft ? 'text-amber-900 font-semibold' : ''}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${live ? 'bg-tertiary' : draft ? 'bg-amber-500' : 'bg-outline'}`} />
                    {live ? `Live · v${row.version}` : draft ? `Draft · v${row.version}` : old ? `Old template · v${row.version}` : `v${row.version}`}
                  </span>
                </button>
                {draft && canWrite ? (
                  <button type="button" className="text-[11px] text-error hover:underline font-medium" onClick={() => onDiscard(row.id)}>Discard draft</button>
                ) : null}
              </div>
              <div className="flex items-center justify-between text-[11px] font-mono text-on-surface-variant">
                <span>{row.source || row.notes || ''}</span>
                <span>{row.created_at.slice(0, 10)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
