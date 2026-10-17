import type { MenuSnapshot } from '@roam/menu-engine';

/** Lists every option/group missing a source label. */
export function ParityCheckPanel({ snapshot }: { snapshot: MenuSnapshot }) {
  const missing: Array<{ kind: string; name: string; id: string }> = [];
  for (const group of snapshot.groups) {
    if (!group.sourceLabel?.trim()) missing.push({ kind: 'group', name: group.name, id: group.id });
    for (const opt of group.options) {
      if (!opt.sourceLabel?.trim()) missing.push({ kind: 'option', name: `${group.name} → ${opt.name}`, id: opt.id });
    }
  }
  return (
    <div className="rounded-lg border border-[#d7e0f2] bg-white p-4">
      <h3 className="text-sm font-semibold text-[#0f172a]">Parity check</h3>
      <p className="mt-1 text-xs text-[#5f75a5]">
        Every option needs the restaurant site&apos;s exact wording so the buyer checklist matches.
      </p>
      {missing.length === 0 ? (
        <p className="mt-3 text-sm text-emerald-700">All groups and options have source labels.</p>
      ) : (
        <ul className="mt-3 max-h-64 space-y-1 overflow-auto text-sm text-[#0f172a]">
          {missing.map((row) => (
            <li key={row.id} className="flex gap-2">
              <span className="text-[#5f75a5]">{row.kind}</span>
              <span>{row.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
