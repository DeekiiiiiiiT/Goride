// Stitch: dominion-redesign/e8cd9a893717485ca09e80c931cb25e3
export function PartsLoading() {
  return (
    <div className="parts-database-stitch px-8 py-6 space-y-4">
      <h1 className="text-xl font-headline font-bold">Parts Engine Lifecycle States</h1>
      <p className="text-xs">State 1: Loading skeletons</p>
      <p className="text-xs">State 2: No vehicle found</p>
      <p className="text-xs">State 3: Zero coverage (empty)</p>
      <p className="text-xs">State 4: Index error</p>
      <h2 className="text-sm font-semibold text-on-surface">View all quadrants</h2>
      <h2 className="text-sm font-semibold text-on-surface">Loading…</h2>
      <div className="h-10 rounded-lg bg-surface-container animate-pulse" />
      <div className="h-24 rounded-xl bg-surface-container animate-pulse" />
      <div className="h-24 rounded-xl bg-surface-container animate-pulse" />
    </div>
  );
}

export function PartsError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="parts-database-stitch px-8 py-10">
      <h2 className="text-lg font-semibold text-on-surface">Could not load. Try again</h2>
      <button type="button" className="mt-4 text-sm font-medium text-secondary" onClick={onRetry}>Try again</button>
      <button type="button" className="mt-4 ml-3 text-sm" onClick={onRetry}>View node status</button>
    </div>
  );
}

export function PartsEmpty({ onClear }: { onClear?: () => void }) {
  return (
    <div className="parts-database-stitch rounded-xl bg-surface-container-lowest p-6 shadow-sm">
      <h2 className="text-base font-semibold text-on-surface">No vehicle matches. Clear search</h2>
      <button type="button" className="mt-4 text-sm text-secondary" onClick={onClear}>Clear search</button>
      <button type="button" className="mt-4 ml-3 text-sm" onClick={onClear}>Clear filter</button>
      <button type="button" className="mt-4 ml-3 text-sm" onClick={onClear}>Switch vehicle</button>
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
