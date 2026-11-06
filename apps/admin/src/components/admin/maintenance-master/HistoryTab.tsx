import { useMemo, useState } from "react";
import { historyPlainSentence, formatHistoryTimestamp } from "./maintenanceMasterFormat";

type Props = {
  history: Record<string, unknown>[];
  onExport: () => void;
};

export function HistoryTab({ history, onExport }: Props) {
  const [partFilter, setPartFilter] = useState("");
  const [visible, setVisible] = useState(25);
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = partFilter.trim().toLowerCase();
    if (!q) return history;
    return history.filter((row) => {
      const newRow = (row.new_row ?? {}) as Record<string, unknown>;
      return String(newRow.task_name ?? "").toLowerCase().includes(q);
    });
  }, [history, partFilter]);

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          placeholder="Filter by part…"
          className="rounded-lg border border-outline-variant/50 bg-surface-container-lowest px-3 py-1.5 text-sm"
          value={partFilter}
          onChange={(e) => setPartFilter(e.target.value)}
        />
        <button
          type="button"
          className="rounded-lg border border-outline-variant/50 px-3 py-1.5 text-xs font-medium text-secondary"
          onClick={onExport}
        >
          Export CSV
        </button>
      </div>
      <ul className="space-y-3">
        {filtered.slice(0, visible).map((row) => {
          const id = String(row.id ?? row.created_at);
          const open = expanded === id;
          return (
            <li key={id} className="mm-light-card rounded-xl border border-outline-variant/30 bg-white px-4 py-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <span className="text-on-surface-variant">{formatHistoryTimestamp(row.created_at)}</span>
                  <p className="mt-1 text-on-surface">{historyPlainSentence(row)}</p>
                </div>
                <button
                  type="button"
                  className="text-xs font-medium text-secondary"
                  onClick={() => setExpanded(open ? null : id)}
                >
                  {open ? "Hide" : "Details"}
                </button>
              </div>
              {open ? (
                <pre className="mt-2 overflow-x-auto rounded-lg bg-surface-container-low p-2 font-code text-[11px]">
                  {JSON.stringify(row.new_row ?? {}, null, 2)}
                </pre>
              ) : null}
            </li>
          );
        })}
      </ul>
      {visible < filtered.length ? (
        <button type="button" className="text-sm font-medium text-secondary" onClick={() => setVisible((n) => n + 25)}>
          Load older
        </button>
      ) : null}
    </div>
  );
}
