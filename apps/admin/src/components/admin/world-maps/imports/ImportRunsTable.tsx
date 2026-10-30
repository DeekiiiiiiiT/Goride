// Stitch: dominion-redesign/s36g-imports-checks
import { importChip, type ImportRun } from './importsApi';

const TONE = {
  red: 'bg-error-container text-on-error-container',
  amber: 'bg-amber-200 text-amber-900',
  green: 'bg-tertiary-container text-on-tertiary-container',
};

export function ImportRunsTable({
  runs,
  selected,
  onOpen,
}: {
  runs: ImportRun[];
  selected: string | null;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="xl:col-span-7 bg-surface-container-lowest rounded-xl shadow-sm p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold font-headline text-on-surface">Import history</h3>
          <p className="text-xs text-on-surface-variant">Archived validation runs across boundary revisions.</p>
        </div>
        <span className="text-xs font-mono text-outline">{runs.length} total runs</span>
      </div>
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="bg-surface-container text-on-surface-variant font-label text-[11px] uppercase tracking-wider">
            <th className="py-2.5 px-3">File</th>
            <th className="py-2.5 px-3">When</th>
            <th className="py-2.5 px-3">Result</th>
            <th className="py-2.5 px-3 text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {runs.length === 0 ? (
            <tr><td colSpan={4} className="py-6 text-center text-on-surface-variant">No import runs yet.</td></tr>
          ) : runs.map((run) => {
            const chip = importChip(run.counts?.broken ?? 0, run.counts?.unknown ?? 0);
            return (
              <tr key={run.id} className={run.id === selected ? 'bg-secondary-container/20' : ''}>
                <td className="py-2.5 px-3 font-mono text-[11px]">{run.file_name || 'file'}</td>
                <td className="py-2.5 px-3 font-mono text-[11px]">{run.created_at.slice(0, 16).replace('T', ' ')}</td>
                <td className="py-2.5 px-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${TONE[chip.tone]}`}>{chip.label}</span>
                </td>
                <td className="py-2.5 px-3 text-right">
                  <button type="button" className="text-on-surface-variant hover:text-on-surface text-[11px] font-medium" onClick={() => onOpen(run.id)}>Inspect</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
