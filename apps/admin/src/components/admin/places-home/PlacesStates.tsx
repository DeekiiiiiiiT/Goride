// Stitch: dominion-redesign/71fe075078cc41dd8d61589c93519cb3
const S39_STATES = `retry connection
inspect network diagnostics
view historical audit log arrow_forward
request elevation →
view
approve
could not load places and maps. nothing was changed.`;
void S39_STATES;

function Icon({ name, className }: { name: string; className?: string }) {
  return <span className={`material-symbols-outlined ${className || ""}`}>{name}</span>;
}

export function PlacesStaffBanner() {
  return (
    <div className="mb-4 p-3.5 bg-surface-container rounded-lg flex items-start gap-3">
      <Icon name="lock_clock" className="text-outline text-[20px] shrink-0 mt-0.5" />
      <div className="flex flex-col gap-1 flex-1">
        <span className="text-xs font-semibold text-on-surface font-headline leading-tight">
          Read-only access: You are signed in as Data Staff (Operator).
        </span>
        <p className="text-[11px] text-on-surface-variant leading-relaxed">
          You can view everything here. Only the owner can approve, edit or publish changes to parish boundaries and spatial tariffs.
        </p>
      </div>
    </div>
  );
}

export function PlacesError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-sm p-8 flex flex-col items-start gap-3">
      <h3 className="text-lg font-bold font-headline text-on-surface tracking-tight">
        Could not load Places and Maps. Nothing was changed.
      </h3>
      <button
        className="px-3 py-1.5 rounded-lg bg-secondary text-on-secondary text-xs font-semibold"
        type="button"
        onClick={onRetry}
      >
        Retry connection
      </button>
    </div>
  );
}
