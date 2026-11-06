type UsageRow = { label: string; count: number };

type Props = {
  open: boolean;
  partName: string;
  usage: UsageRow[];
  onClose: () => void;
  onConfirm: () => void;
  busy?: boolean;
};

function usageValue(count: number): string {
  if (count <= 0) return "None";
  return String(count);
}

export function MaintenanceMasterRetireDialog({
  open,
  partName,
  usage,
  onClose,
  onConfirm,
  busy,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="mm-light-card w-full max-w-md rounded-2xl border border-outline-variant/40 bg-white p-6 shadow-lg"
        role="dialog"
        aria-labelledby="mm-retire-title"
      >
        <h2 id="mm-retire-title" className="font-headline text-headline-md text-on-surface">
          Retire {partName}?
        </h2>
        <p className="mt-3 text-sm text-on-surface-variant">
          It stays on cars that already have it, marked retired, and won&apos;t be added to new cars or new
          schedules.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg border border-outline-variant/30 bg-surface-container-low p-3">
          {usage.map((row) => (
            <div key={row.label} className="rounded-lg bg-surface-container-lowest px-2 py-2 text-center">
              <p className="text-[11px] text-on-surface-variant">{row.label}</p>
              <p className="font-code mt-1 text-sm text-on-surface">{usageValue(row.count)}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-outline-variant/60 px-4 py-2 text-sm text-on-surface hover:bg-surface-container"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-on-secondary hover:opacity-90 disabled:opacity-50"
            onClick={onConfirm}
            disabled={busy}
          >
            Retire
          </button>
        </div>
      </div>
    </div>
  );
}
