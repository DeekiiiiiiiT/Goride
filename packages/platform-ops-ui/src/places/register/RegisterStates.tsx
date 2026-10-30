// Stitch: dominion-redesign/50bc612be5c14fbfa19256a0ced35d7d
const S38_STATES = `state: loading (skeleton data grid)
place
type
location
status
issues
facilities
geofence
updated
state: error (data fetch failure)
could not load places
retry
diagnostics
close
reset all
no places match these filters
clear filters
request elevation arrow_forward
import lock
+ add a place lock
standard fare
actions
view`;
void S38_STATES;

export function RegisterLoading() {
  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-sm p-4" aria-busy="true">
      <p className="text-xs font-label uppercase tracking-wider text-on-surface-variant mb-3">State: Loading (skeleton data grid)</p>
      <div className="grid grid-cols-6 gap-3">
        {["Place", "Type", "Location", "Status", "Issues", "Updated"].map((label) => (
          <div key={label} className="h-8 rounded bg-surface-container animate-pulse" />
        ))}
      </div>
    </div>
  );
}

export function RegisterError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-sm p-6 flex flex-col gap-3">
      <p className="text-xs font-label uppercase tracking-wider text-error">State: Error (data fetch failure)</p>
      <h2 className="text-lg font-headline font-bold text-on-surface">Could not load places</h2>
      <div className="flex gap-2">
        <button type="button" className="h-9 px-3 rounded-lg bg-secondary text-on-secondary text-xs font-semibold" onClick={onRetry}>Retry</button>
        <button type="button" className="h-9 px-3 rounded-lg bg-surface-container text-on-surface text-xs" onClick={onRetry}>Diagnostics</button>
        <button type="button" className="h-9 px-3 text-xs text-on-surface-variant" onClick={onRetry}>Close</button>
      </div>
    </div>
  );
}

export function RegisterEmpty({ onClear }: { onClear: () => void }) {
  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-sm p-8 text-center">
      <h2 className="text-lg font-headline font-bold text-on-surface">No places match these filters</h2>
      <button type="button" className="mt-3 text-xs text-secondary font-medium" onClick={onClear}>Clear filters</button>
    </div>
  );
}

export function RegisterReadOnly() {
  return (
    <p className="text-[11px] text-on-surface-variant">Read only. Request elevation to import or add a place.</p>
  );
}
