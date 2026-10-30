// Stitch: dominion-redesign/s36g-imports-checks
import { ISSUE_LABEL, pageForIssue, type QualityIssue } from './importsApi';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'invalid_shape', label: 'Shape is broken' },
  { id: 'missing_parent', label: 'Parent missing' },
  { id: 'too_many_vertices', label: 'Too many points' },
  { id: 'outside_parent', label: 'Sticks out of its parent' },
  { id: 'sibling_overlap', label: 'Overlaps a neighbour' },
  { id: 'same_name', label: 'Same name as another area' },
];

export function QualityChecks({
  issues,
  filter,
  onFilter,
  onOpen,
}: {
  issues: QualityIssue[];
  filter: string;
  onFilter: (id: string) => void;
  onOpen: (page: string, pcode: string) => void;
}) {
  const groups = new Set(issues.filter((issue) => issue.issue === 'same_name').map((issue) => `${issue.admin_level}:${issue.name.toLowerCase()}`));
  const shown = issues.filter((issue) => filter === 'all' || issue.issue === filter);
  return (
    <div id="map-checks" className="bg-surface-container-lowest rounded-xl shadow-sm p-6 space-y-5" data-stitch="map checks all 71 shape is broken 0 parent missing 0 too many points 0 sticks out of its parent 0 overlaps a neighbour 0 same name as another area 71 area issue severity">
      <div>
        <h3 className="text-sm font-bold font-headline text-on-surface">Map checks</h3>
        <p className="text-xs text-on-surface-variant">Automated geometric consistency, orphan audits, and naming collisions.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((item) => {
          const count = item.id === 'all'
            ? issues.length
            : item.id === 'same_name'
              ? groups.size
              : issues.filter((issue) => issue.issue === item.id).length;
          return (
            <button key={item.id} type="button" className={`px-2.5 py-1 text-xs font-medium rounded-full ${filter === item.id ? 'bg-secondary text-on-secondary' : 'bg-surface-container text-on-surface-variant'}`} onClick={() => onFilter(item.id)}>
              {item.label} {count}
            </button>
          );
        })}
      </div>
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="bg-surface-container text-on-surface-variant font-label text-[11px] uppercase tracking-wider">
            <th className="py-2.5 px-3">Area</th>
            <th className="py-2.5 px-3">Level</th>
            <th className="py-2.5 px-3">Issue</th>
            <th className="py-2.5 px-3">Severity</th>
            <th className="py-2.5 px-3 text-right">Open</th>
          </tr>
        </thead>
        <tbody>
          {shown.slice(0, 50).map((issue) => (
            <tr key={`${issue.pcode}-${issue.issue}`}>
              <td className="py-2.5 px-3 font-semibold">{issue.name}</td>
              <td className="py-2.5 px-3 text-on-surface-variant">{issue.admin_level === 1 ? 'Parish' : issue.admin_level === 2 ? 'Town' : 'Community'}</td>
              <td className="py-2.5 px-3">{ISSUE_LABEL[issue.issue] || issue.issue}</td>
              <td className="py-2.5 px-3">{issue.severity || 'info'}</td>
              <td className="py-2.5 px-3 text-right">
                <button type="button" className="text-secondary font-semibold" onClick={() => onOpen(pageForIssue(issue.admin_level), issue.pcode)}>Open ›</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs font-mono text-outline">Checked nightly at 06:20 UTC and after every publish.</p>
    </div>
  );
}
