/**
 * Service items — "Add to May need" pop-up.
 * Look: Stitch screens 3 (add_to_may_need_part_types) + 4 (add_to_may_need_supplies) + 9 (no-match state).
 * Content: audit 9c (Drop "OEM Ref", "Stocked").
 */
import { useMemo, useState } from "react";
import { addMayNeed, type ItemNeed, type Job, type JobsPayload, type MayNeedItem, type Supply } from "./jobsApi";
import { matchesQuery, parseQtyHint, partTypeSubLine, pickerBlockReason } from "./mayNeedModel";
import { NeedSwitch, T, WhiteButton } from "./serviceItemsUi";
import { SupplyDrawer } from "../supplies/SupplyDrawer";

type Tab = "part_type" | "supply";

type Props = {
  token: string;
  data: JobsPayload;
  /** The job being edited, with its current May-need items. */
  job: Job;
  onClose: () => void;
  onAdded: (item: MayNeedItem) => void;
  onSupplyCreated: (s: Supply) => void;
};

export function AddMayNeedDialog({ token, data, job, onClose, onAdded, onSupplyCreated }: Props) {
  const [tab, setTab] = useState<Tab>("part_type");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [need, setNeed] = useState<ItemNeed>("usually");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [newSupplyOpen, setNewSupplyOpen] = useState(false);
  const [extraSupplies, setExtraSupplies] = useState<Supply[]>([]);

  const partTypes = useMemo(
    () =>
      data.jobs
        .filter((j) => j.isPart && j.status === "active" && j.id !== job.id)
        .filter((j) => matchesQuery(query, j.name))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [data.jobs, job.id, query],
  );
  const supplies = useMemo(
    () =>
      [...data.supplies, ...extraSupplies.filter((x) => !data.supplies.some((s) => s.id === x.id))]
        .filter((s) => s.status === "active")
        .filter((s) => matchesQuery(query, s.name, s.description))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [data.supplies, extraSupplies, query],
  );

  const selectedSupply = tab === "supply" ? supplies.find((s) => s.id === selected) ?? extraSupplies.find((s) => s.id === selected) : undefined;
  const unitFor = (s: Supply | undefined) => {
    if (!s) return null;
    const u = data.units.find((x) => x.id === s.unitId);
    return u ? (qty.trim() === "1" ? u.labelOne : u.labelMany) : s.unitCode;
  };
  const parsedQty = parseQtyHint(qty);
  const canAdd = Boolean(selected) && parsedQty.ok && !busy;

  const switchTab = (t: Tab) => {
    setTab(t);
    setSelected(null);
    setQuery("");
    setError("");
  };

  const add = async () => {
    if (!selected || !parsedQty.ok) return;
    setBusy(true);
    setError("");
    try {
      const res = await addMayNeed(token, {
        jobId: job.id,
        kind: tab,
        itemId: selected,
        need,
        qtyHint: parsedQty.value,
        note: note.trim() || null,
      });
      onAdded(res.item);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Couldn't add this item.");
    } finally {
      setBusy(false);
    }
  };

  const rows =
    tab === "part_type"
      ? partTypes.map((p) => ({ id: p.id, title: p.name, sub: partTypeSubLine(data, p) }))
      : supplies.map((s) => ({ id: s.id, title: `${s.name} · ${s.unitCode}`, sub: s.description }));

  const field = `h-10 w-full rounded-lg border border-[#e2e8f0] bg-[#ffffff] px-3 text-sm font-medium text-[#0f172a] outline-none focus:border-[#0153dc] focus:ring-2 focus:ring-[#0153dc]/15`;

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-[#0f172a]/45 backdrop-blur-[4px]" />
      <div
        className="fixed inset-0 z-[61] flex items-center justify-center overflow-y-auto p-4"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !busy) onClose();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="mm-add-may-need-title"
          className="relative my-auto flex w-full max-w-[540px] flex-col overflow-hidden rounded-2xl border border-[#e2e8f0]/90 bg-[#ffffff] shadow-[0_20px_25px_-5px_rgba(15,23,42,0.15),0_8px_10px_-6px_rgba(15,23,42,0.08)]"
        >
          <div className="flex items-start justify-between border-b border-[#f1f5f9] px-6 pb-4 pt-6">
            <div className="flex flex-col">
              <h2 id="mm-add-may-need-title" className="text-xl font-semibold leading-tight text-[#0f172a]">
                Add to May need
              </h2>
              <span className="mt-0.5 text-sm font-medium text-[#64748b]">{job.name}</span>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              disabled={busy}
              className="-mr-1 -mt-1 flex h-9 w-9 items-center justify-center rounded-full text-[#94a3b8] transition-colors hover:bg-[#f1f5f9] hover:text-[#334155]"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>

          <div className="max-h-[65vh] space-y-5 overflow-y-auto p-6">
            <div className="flex items-center gap-2" role="tablist">
              {(
                [
                  { t: "part_type" as const, label: "Part types", icon: "category" },
                  { t: "supply" as const, label: "Supplies", icon: "inventory_2" },
                ]
              ).map((o) => (
                <button
                  key={o.t}
                  type="button"
                  role="tab"
                  aria-selected={tab === o.t}
                  onClick={() => switchTab(o.t)}
                  className={
                    tab === o.t
                      ? "flex items-center gap-1.5 rounded-full bg-[#0153dc] px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-all"
                      : "flex items-center gap-1.5 rounded-full bg-[#f1f5f9] px-4 py-1.5 text-sm font-medium text-[#475569] transition-colors hover:text-[#0f172a]"
                  }
                >
                  <span className="material-symbols-outlined text-[16px]">{o.icon}</span>
                  <span>{o.label}</span>
                </button>
              ))}
            </div>

            <div className="relative w-full">
              <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px] text-[#94a3b8]">search</span>
              <input
                type="search"
                aria-label={tab === "part_type" ? "Search parts" : "Search supplies"}
                placeholder={tab === "part_type" ? "Search parts…" : "Search supplies…"}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-10 w-full rounded-xl border border-[#e2e8f0] bg-[#f8fafc]/70 pl-10 pr-9 text-sm text-[#0f172a] outline-none transition-all placeholder:text-[#94a3b8] focus:border-[#0153dc] focus:bg-[#ffffff] focus:ring-2 focus:ring-[#0153dc]/15"
              />
              {query ? (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setQuery("")}
                  className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-[#94a3b8] hover:text-[#475569]"
                >
                  <span className="material-symbols-outlined text-[16px]">cancel</span>
                </button>
              ) : null}
            </div>

            <div className="space-y-2.5">
              {tab === "supply" ? (
                <div className="flex items-center justify-between">
                  <span className={`${T.labelSm} font-semibold uppercase tracking-wider text-[#565e74]`}>Matched Workshop Supplies</span>
                  <span className={`${T.labelSm} text-[#565e74]`}>
                    {rows.length} result{rows.length === 1 ? "" : "s"}
                  </span>
                </div>
              ) : null}

              {rows.length === 0 ? (
                <NoMatch
                  query={query}
                  isSupply={tab === "supply"}
                  onClear={() => setQuery("")}
                  onNewSupply={() => setNewSupplyOpen(true)}
                />
              ) : (
                <ul className="max-h-[260px] space-y-2 overflow-y-auto pr-1" role="listbox" aria-label={tab === "part_type" ? "Part types" : "Supplies"}>
                  {rows.map((r) => {
                    const blocked = pickerBlockReason(job, tab, r.id);
                    const isSel = selected === r.id;
                    return (
                      <li key={r.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={isSel}
                          aria-disabled={Boolean(blocked)}
                          disabled={Boolean(blocked)}
                          onClick={() => setSelected(r.id)}
                          className={
                            blocked
                              ? "flex w-full cursor-not-allowed select-none items-center justify-between rounded-xl border border-[#e2e8f0] bg-[#f8fafc]/60 p-3.5 text-left opacity-50"
                              : isSel
                                ? "flex w-full items-center justify-between rounded-xl border border-[#0153dc] bg-[#f1f5ff] p-3.5 text-left shadow-sm ring-1 ring-[#0153dc]"
                                : "group flex w-full items-center justify-between rounded-xl border border-[#e2e8f0] bg-[#ffffff] p-3.5 text-left transition-colors hover:border-[#cbd5e1] hover:bg-[#f8fafc]/60"
                          }
                        >
                          <span className="flex items-center gap-3">
                            {isSel ? (
                              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#0153dc] ring-2 ring-[#0153dc]/20">
                                <span className="h-1.5 w-1.5 rounded-full bg-[#ffffff]" />
                              </span>
                            ) : blocked ? (
                              <span className="flex h-4 w-4 items-center justify-center rounded-full border border-[#cbd5e1] bg-[#f1f5f9]">
                                <span className="h-1.5 w-1.5 rounded-full bg-[#cbd5e1]" />
                              </span>
                            ) : (
                              <span className="flex h-4 w-4 items-center justify-center rounded-full border border-[#cbd5e1] bg-[#ffffff] group-hover:border-[#94a3b8]" />
                            )}
                            <span className="flex flex-col">
                              <span className={isSel ? "text-sm font-semibold text-[#0f172a]" : blocked ? "text-sm font-medium text-[#334155]" : "text-sm font-medium text-[#1e293b]"}>
                                {r.title}
                              </span>
                              {r.sub ? (
                                <span className={isSel ? "text-xs font-medium text-[#0153dc]" : blocked ? "text-xs text-[#94a3b8]" : "text-xs text-[#64748b]"}>
                                  {r.sub}
                                </span>
                              ) : null}
                            </span>
                          </span>
                          {blocked ? (
                            <span className="rounded-full border border-[#e2e8f0]/70 bg-[#f1f5f9] px-2.5 py-0.5 text-xs font-medium text-[#64748b]">
                              {blocked}
                            </span>
                          ) : isSel ? (
                            <span className="material-symbols-outlined text-[18px] text-[#0153dc]">check_circle</span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {tab === "supply" && rows.length > 0 ? (
                <WhiteButton icon="add" onClick={() => setNewSupplyOpen(true)}>
                  New supply
                </WhiteButton>
              ) : null}
            </div>

            <div className="space-y-4 border-t border-[#f1f5f9] pt-3">
              <div>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[#334155]">How often is it needed?</span>
                <NeedSwitch value={need} onChange={setNeed} disabled={busy} />
              </div>
              <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-4">
                <label className="sm:col-span-1">
                  <span className="mb-1.5 block text-xs font-medium text-[#475569]">
                    Usual quantity <span className="font-normal text-[#94a3b8]">(opt)</span>
                  </span>
                  <span className="relative block">
                    <input
                      inputMode="decimal"
                      aria-label="Usual quantity"
                      value={qty}
                      onChange={(e) => setQty(e.target.value)}
                      className={`${field} ${tab === "supply" && selectedSupply ? "pr-14" : "text-center"}`}
                    />
                    {tab === "supply" && selectedSupply ? (
                      <span className={`absolute right-3 top-1/2 -translate-y-1/2 select-none rounded bg-[#e9edfe] px-2 py-0.5 ${T.labelSm} text-[#565e74]`}>
                        {unitFor(selectedSupply)}
                      </span>
                    ) : null}
                  </span>
                </label>
                <label className="sm:col-span-3">
                  <span className="mb-1.5 block text-xs font-medium text-[#475569]">
                    Note <span className="font-normal text-[#94a3b8]">(optional)</span>
                  </span>
                  <input
                    aria-label="Note"
                    maxLength={300}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={tab === "part_type" ? "Add condition or installation hint…" : "e.g. Spray, then wipe with a clean rag."}
                    className={`${field} placeholder:text-[#94a3b8]`}
                  />
                </label>
              </div>
              {!parsedQty.ok ? <p className="text-sm text-[#dc2626]">{parsedQty.error}</p> : null}
              {error ? (
                <p role="alert" className="rounded-lg bg-[#fef2f2] px-3 py-2 text-sm text-[#b91c1c]">
                  {error}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-[#f1f5f9] bg-[#f8fafc]/50 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg border border-[#fecaca] px-4 py-2 text-sm font-medium text-[#dc2626] outline-none transition-colors hover:border-[#fca5a5] hover:bg-[#fef2f2] focus:ring-2 focus:ring-[#ef4444]/20"
            >
              Cancel
            </button>
            <div className="flex items-center gap-3">
              {selected ? (
                <span className="text-xs text-[#94a3b8]">1 {tab === "part_type" ? "part" : "supply"} selected</span>
              ) : null}
              <button
                type="button"
                onClick={() => void add()}
                disabled={!canAdd}
                className="flex items-center gap-1.5 rounded-lg bg-[#0153dc] px-5 py-2 text-sm font-medium text-white shadow-sm outline-none transition-all hover:bg-[#1d4ed8] focus:ring-2 focus:ring-[#0153dc]/25 active:bg-[#1e40af] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {tab === "part_type" ? <span className="material-symbols-outlined text-[18px]">add</span> : null}
                <span>{busy ? "Adding…" : "Add"}</span>
                {tab === "supply" ? <span className="material-symbols-outlined text-[16px]">arrow_forward</span> : null}
              </button>
            </div>
          </div>
        </div>
      </div>

      {newSupplyOpen ? (
        <SupplyDrawer
          token={token}
          data={data}
          supply={null}
          initialName={query.trim()}
          canWrite
          onClose={() => setNewSupplyOpen(false)}
          onSaved={(s) => {
            setNewSupplyOpen(false);
            setExtraSupplies((prev) => [...prev, s]);
            onSupplyCreated(s);
            setTab("supply");
            setQuery("");
            setSelected(s.id);
          }}
        />
      ) : null}
    </>
  );
}

function NoMatch({
  query,
  isSupply,
  onClear,
  onNewSupply,
}: {
  query: string;
  isSupply: boolean;
  onClear: () => void;
  onNewSupply: () => void;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-[#e2e8f0] px-4 py-6 text-center">
      <span className="material-symbols-outlined text-[28px] text-[#94a3b8]">search_off</span>
      <p className="mt-1 text-sm font-semibold text-[#1e293b]">
        {query ? (
          <>
            No {isSupply ? "supply" : "part type"} matches &ldquo;{query}&rdquo;
          </>
        ) : (
          <>No {isSupply ? "supplies" : "part types"} yet</>
        )}
      </p>
      <p className="mt-0.5 text-xs text-[#64748b]">
        {isSupply ? "Check your spelling, or add it as a new supply." : "Check your spelling."}
      </p>
      <div className="mt-3 flex gap-2">
        {query ? (
          <WhiteButton icon="backspace" onClick={onClear}>
            Clear query
          </WhiteButton>
        ) : null}
        {isSupply ? (
          <WhiteButton icon="add_circle" onClick={onNewSupply}>
            New supply
          </WhiteButton>
        ) : null}
      </div>
    </div>
  );
}
