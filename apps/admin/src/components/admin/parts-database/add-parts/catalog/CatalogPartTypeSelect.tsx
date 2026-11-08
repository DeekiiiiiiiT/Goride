import { useMemo, useState } from "react";
import { MaterialIcon } from "../../import/MaterialIcon";
import type { PartTypeRow } from "../addPartsTypes";
import { PartTypeIcon } from "../addPartsShared";

export function CatalogPartTypeSelect({
  types,
  value,
  onChange,
}: {
  types: PartTypeRow[];
  value: string;
  onChange: (t: PartTypeRow | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const selected = types.find((t) => t.id === value) ?? null;
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return types;
    return types.filter(
      (t) =>
        t.name.toLowerCase().includes(needle)
        || (t.opCode ?? "").toLowerCase().includes(needle)
        || (t.tradeTerm ?? "").toLowerCase().includes(needle),
    );
  }, [q, types]);

  return (
    <div className="relative">
      <button
        type="button"
        className="w-full h-10 rounded-lg border border-outline-variant/40 px-2 text-body-sm flex items-center gap-2 bg-surface-container-lowest text-left"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {selected ? (
          <>
            <PartTypeIcon iconKey={selected.iconKey} className="text-[18px] text-primary shrink-0" />
            <span className="truncate">{selected.name}</span>
          </>
        ) : (
          <span className="text-on-surface-variant">Choose type…</span>
        )}
        <MaterialIcon name={open ? "expand_less" : "expand_more"} className="ml-auto text-[20px] text-on-surface-variant" />
      </button>
      {open ? (
        <div className="absolute z-20 mt-1 w-full min-w-[240px] rounded-xl border border-outline-variant/40 bg-surface-container-lowest shadow-lg p-2 max-h-72 flex flex-col">
          <input
            className="h-9 px-3 rounded-lg border border-outline-variant/40 mb-2"
            placeholder="Search types…"
            value={q}
            autoFocus
            onChange={(e) => setQ(e.target.value)}
          />
          <ul className="overflow-y-auto flex-1">
            {filtered.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-surface-container text-left"
                  onClick={() => {
                    onChange(t);
                    setOpen(false);
                    setQ("");
                  }}
                >
                  <PartTypeIcon iconKey={t.iconKey} className="text-[18px] text-primary" />
                  <span className="font-body-sm">{t.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
