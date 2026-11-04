import type { MasterPartRow } from "../partsDatabaseApi";

export function MasterRepositoryIndex({
  rows,
  activePartId,
  title,
  totalLoaded,
}: {
  rows: MasterPartRow[];
  activePartId: string;
  title: string;
  totalLoaded: number;
}) {
  return (
    <div className={`flex-1 min-w-[300px] transition-opacity ${activePartId ? "opacity-40 pointer-events-none select-none" : ""}`}>
      <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden mb-space-md border border-outline-variant/40">
        <div className="h-10 px-space-md bg-surface-container flex items-center justify-between">
          <span className="font-headline-md text-headline-md text-on-surface truncate">{title}</span>
          <span className="font-mono-sm text-mono-sm text-on-surface-variant shrink-0">
            {totalLoaded.toLocaleString()} RECORDS LOADED
          </span>
        </div>
        <div className="p-space-md space-y-space-sm">
          {rows.length === 0 ? (
            <p className="font-body-sm text-secondary py-2">No parts in this view yet.</p>
          ) : rows.slice(0, 8).map((row) => {
            const active = row.partId === activePartId;
            const fitLabel = row.fitCount != null
              ? `${row.fitCount} FITMENT${row.fitCount === 1 ? "" : "S"}`
              : null;
            return (
              <div
                key={row.partId}
                className={`h-9 rounded flex items-center px-space-sm gap-space-md ${active ? "bg-primary-fixed/20" : "bg-surface"}`}
              >
                <span className={`font-mono-md text-mono-md w-32 shrink-0 truncate ${active ? "text-primary font-semibold" : "text-on-surface-variant"}`}>
                  {row.number || "—"}
                </span>
                <span className={`font-body-md text-body-md w-60 shrink-0 truncate ${active ? "font-semibold text-on-surface" : "text-on-surface"}`}>
                  {[row.brand, row.name].filter(Boolean).join(" · ") || "Part"}
                </span>
                {row.wva ? (
                  <span className="font-mono-sm text-mono-sm text-on-surface-variant shrink-0">WVA {row.wva}</span>
                ) : null}
                {fitLabel ? (
                  <span className="font-mono-sm text-mono-sm text-on-surface-variant shrink-0">{fitLabel}</span>
                ) : null}
                <span className={`font-label-xs text-label-xs px-2 py-0.5 rounded shrink-0 ml-auto ${active ? "bg-primary-container text-on-primary" : "bg-surface-container-high text-on-surface"}`}>
                  {active ? "DRAWER ACTIVE" : fitLabel ?? "—"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
