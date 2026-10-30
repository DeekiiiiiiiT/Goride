// Stitch: dominion-redesign/e8cd9a893717485ca09e80c931cb25e3
export function PartsLoading() {
  return (
    <div className="parts-database-stitch px-8 py-6 space-y-4" aria-busy="true">
      <div className="h-10 rounded-lg bg-surface-container animate-pulse" />
      <div className="h-24 rounded-xl bg-surface-container animate-pulse" />
      <div className="h-24 rounded-xl bg-surface-container animate-pulse" />
    </div>
  );
}

export function PartsError({ onRetry, message }: { onRetry: () => void; message?: string }) {
  return (
    <div className="parts-database-stitch px-8 py-10">
      <h2 className="text-lg font-semibold text-on-surface">{message || "Could not load. Try again"}</h2>
      <p className="text-sm text-on-surface-variant mt-1">Nothing was changed.</p>
      <button type="button" className="mt-4 text-sm font-medium text-secondary" onClick={onRetry}>Try again</button>
    </div>
  );
}

export function PartsEmpty({ onClear }: { onClear?: () => void }) {
  return (
    <div className="parts-database-stitch rounded-xl bg-surface-container-lowest p-6 shadow-sm">
      <h2 className="text-base font-semibold text-on-surface">No vehicle matches. Clear search</h2>
      <button type="button" className="mt-4 text-sm text-secondary" onClick={onClear}>Clear search</button>
    </div>
  );
}

export function PartsZeroCoverage({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-xl bg-surface-container-low p-4">
      <h3 className="text-sm font-semibold text-on-surface">None on file yet</h3>
      <button type="button" className="mt-3 text-xs font-medium text-secondary" onClick={onAdd}>Add for this vehicle</button>
    </div>
  );
}
