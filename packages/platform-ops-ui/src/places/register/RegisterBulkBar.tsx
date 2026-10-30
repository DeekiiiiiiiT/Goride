// Stitch: dominion-redesign/f7e577c72a6746ca8de0ef18cbc7c527
const S38D = `places register
set brand on 3 places
close
select brand *
audit reason *
cancel
apply to 3 places
set brand
confirm pins
add facility
remove facility
set type
verify
mark duplicate
clear`;
void S38D;

export function RegisterBulkBar({
  count,
  onAction,
  onClear,
}: {
  count: number;
  onAction: (action: string) => void;
  onClear: () => void;
}) {
  if (!count) return null;
  const actions = [
    ["set_brand", "Set brand"],
    ["pin_confirmed", "Confirm pins"],
    ["add-facility", "Add facility"],
    ["remove-facility", "Remove facility"],
    ["type", "Set type"],
    ["verify", "Verify"],
    ["duplicate_of", "Mark duplicate"],
  ];
  return (
    <aside aria-label="Bulk actions" className="fixed bottom-12 left-1/2 z-50 -translate-x-1/2 shadow-2xl">
      <div className="flex items-center gap-3 rounded-full bg-inverse-surface px-4 py-2.5 text-xs text-inverse-on-surface shadow-xl">
        <div className="flex items-center gap-2 border-r border-slate-700/60 pr-2">
          <span className="h-2 w-2 rounded-full bg-secondary" />
          <span className="font-mono text-[12px] font-semibold text-white">{count} selected</span>
        </div>
        <div className="flex items-center gap-1">
          {actions.map(([action, label]) => (
            <button
              key={action}
              type="button"
              className={
                action === "verify"
                  ? "rounded bg-tertiary/20 px-2.5 py-1 font-label font-medium text-tertiary-fixed"
                  : action === "duplicate_of"
                    ? "rounded bg-error-dim/40 px-2.5 py-1 font-label font-medium text-error-container"
                    : "rounded px-2.5 py-1 font-label text-slate-200 hover:bg-slate-800"
              }
              onClick={() => onAction(action)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="border-l border-slate-700/60 pl-2">
          <button type="button" className="font-label text-[11px] text-slate-400 hover:text-white" onClick={onClear}>Clear</button>
        </div>
      </div>
    </aside>
  );
}
