// Stitch: dominion-redesign/parts_import_check_results
export function ImportCheckKpis({ valid, total, errors }: { valid: number; total: number; errors: number }) {
  const pct = total ? Math.round((100 * valid) / total) : 0;
  return (
    <div className="grid md:grid-cols-3 gap-3">
      <div className="rounded-xl bg-surface-container-lowest p-4 shadow-sm">
        <p className="text-xs font-mono uppercase text-outline">Fitment target coverage</p>
        <p className="text-2xl font-semibold text-on-surface">{pct}%</p>
        <p className="text-xs text-on-surface-variant">{valid} verified direct matches mapped to registered chassis IDs</p>
      </div>
      <div className="rounded-xl bg-surface-container-lowest p-4 shadow-sm">
        <p className="text-xs font-mono uppercase text-outline">OEM vs aftermarket ratio</p>
        <p className="text-sm text-on-surface-variant">Usable entries from this file</p>
      </div>
      <div className="rounded-xl bg-surface-container-lowest p-4 shadow-sm">
        <p className="text-xs font-mono uppercase text-outline">Resolver state</p>
        <p className="text-sm font-semibold text-on-surface">{errors} Hard errors</p>
      </div>
    </div>
  );
}
