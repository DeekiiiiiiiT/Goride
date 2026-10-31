export function FullDatabaseSummaryBar({
  title,
  total,
  chips,
  onRemove,
  indexLabel,
}: {
  title: string;
  total: number;
  chips: Array<{ id: string; label: string }>;
  onRemove: (id: string) => void;
  indexLabel: string;
}) {
  return (
    <div className="p-space-md rounded-xl bg-surface-container-lowest border border-outline-variant/40 shadow-sm flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-headline-md text-headline-md font-bold text-on-surface">{title}</span>
        <span className="px-2 py-0.5 rounded-full bg-surface-container-low border border-outline-variant/40 text-primary font-mono-sm text-mono-sm font-bold">{total.toLocaleString()} records</span>
        {chips.length ? <div className="h-4 w-px bg-outline-variant/60 mx-1" /> : null}
        {chips.map((chip) => (
          <span key={chip.id} className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-surface-container-low border border-outline-variant/40 font-body-sm text-body-sm text-on-surface">
            <span>{chip.label}</span>
            <button className="hover:text-error text-outline text-[13px] leading-none" type="button" title="Remove filter" onClick={() => onRemove(chip.id)}>✕</button>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2 text-outline font-mono-sm text-[11px]">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        <span>{indexLabel}</span>
      </div>
    </div>
  );
}
