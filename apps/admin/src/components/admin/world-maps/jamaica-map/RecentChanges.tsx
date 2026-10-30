// Stitch: dominion-redesign/dfbd91b2308242d0bbbd33b83de0389e
import { formatWhen, levelLabel, sourceLabel } from './jamaicaMapFormat';
import type { RecentRow } from './jamaicaMapApi';

export function RecentChanges({ rows }: { rows: RecentRow[] }) {
  return (
    <div className="bg-surface-container-lowest rounded-2xl shadow-sm p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-bold font-headline text-on-surface">Recent changes</h3>
          <span className="text-xs font-mono text-outline">{rows.length} records</span>
        </div>
        <a className="text-xs font-medium text-on-surface-variant hover:text-secondary transition-colors" href="?page=world-imports">View all</a>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs font-body">
          <thead>
            <tr className="bg-surface-container-low text-on-surface-variant font-label text-[11px] uppercase tracking-wider">
              <th className="py-2.5 px-4 rounded-l-lg">Area</th>
              <th className="py-2.5 px-3">Level</th>
              <th className="py-2.5 px-3">Version</th>
              <th className="py-2.5 px-3">Source</th>
              <th className="py-2.5 px-3">When</th>
              <th className="py-2.5 px-4 rounded-r-lg">By</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.pcode}-${row.created_at}`} className="hover:bg-surface-container-low/60 transition-colors">
                <td className="py-3 px-4 font-semibold text-on-surface">
                  <span className="mr-2">{row.name}</span>
                  <span className="font-mono text-[11px] text-outline">{row.pcode}</span>
                </td>
                <td className="py-3 px-3 text-on-surface-variant">{levelLabel(row.admin_level)}</td>
                <td className="py-3 px-3 font-mono text-outline">{row.version != null ? `v${row.version}` : '—'}</td>
                <td className="py-3 px-3">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono bg-surface-container text-on-surface">{sourceLabel(row.source)}</span>
                </td>
                <td className="py-3 px-3 font-mono text-outline">{formatWhen(row.created_at)}</td>
                <td className="py-3 px-4 font-mono text-on-surface-variant">{row.actor_id ? 'Staff' : 'System'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
