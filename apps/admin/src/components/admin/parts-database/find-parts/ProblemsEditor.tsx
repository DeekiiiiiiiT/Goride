// Stitch: dominion-redesign/S42i · find_parts_problems_list_and_drawer
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  fetchPartsBrowse,
  fetchSymptoms,
  fetchSymptomSummary,
  saveSymptom,
} from "./findPartsApi";

type SymptomRow = {
  id: string;
  label: string;
  hint: string | null;
  active?: boolean;
  components: Array<{ componentId: string; rank: number }>;
};

type Draft = {
  id?: string;
  label: string;
  hint: string;
  active: boolean;
  components: Array<{ componentId: string; rank: number }>;
  reason: string;
};

const PAGE_SIZE = 8;

function problemIcon(label: string) {
  const text = label.toLowerCase();
  if (text.includes("brake") || text.includes("grind") || text.includes("squeak")) return "volume_up";
  if (text.includes("start") || text.includes("click") || text.includes("crank")) return "electric_bolt";
  if (text.includes("overheat") || text.includes("temp") || text.includes("cool")) return "device_thermostat";
  if (text.includes("a/c") || text.includes("ac ") || text.includes("smell") || text.includes("blow")) return "mode_fan";
  return "help";
}

function symptomCode(id: string) {
  return `PRB-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

function emptyDraft(): Draft {
  return { label: "", hint: "", active: true, components: [], reason: "" };
}

function draftFromRow(row: SymptomRow): Draft {
  return {
    id: row.id,
    label: row.label,
    hint: row.hint ?? "",
    active: row.active !== false,
    components: row.components.map((c) => ({ ...c })),
    reason: "",
  };
}

function RankPill({ rank, name, primary }: { rank: number; name: string; primary: boolean }) {
  if (primary) {
    return (
      <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full font-mono-sm text-mono-sm bg-primary-fixed text-primary font-semibold shadow-xs">
        <span className="w-3.5 h-3.5 rounded-full bg-primary-container text-on-primary flex items-center justify-center text-[9px] font-bold">{rank}</span>
        {name}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full font-mono-sm text-mono-sm bg-secondary-fixed text-on-secondary-fixed shadow-xs">
      <span className="w-3.5 h-3.5 rounded-full bg-secondary text-on-secondary flex items-center justify-center text-[9px] font-bold">{rank}</span>
      {name}
    </span>
  );
}

function LiveToggle({ live, onChange, disabled }: { live: boolean; onChange: (next: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`w-8 h-4 rounded-full p-0.5 flex items-center shadow-inner ${live ? "bg-primary-container justify-end" : "bg-surface-container-highest justify-start"} ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      onClick={() => onChange(!live)}
      aria-pressed={live}
    >
      <div className={`w-3 h-3 rounded-full shadow-xs ${live ? "bg-on-primary" : "bg-outline"}`} />
    </button>
  );
}

export function ProblemsEditor({ owner, onEditingChange }: { owner: boolean; onEditingChange?: (open: boolean) => void }) {
  const list = useQuery({ queryKey: ["symptoms-editor"], queryFn: fetchSymptoms });
  const summary = useQuery({ queryKey: ["symptoms-summary"], queryFn: fetchSymptomSummary });
  const browse = useQuery({ queryKey: ["parts-browse-problems"], queryFn: fetchPartsBrowse });

  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [baseline, setBaseline] = useState<Draft>(emptyDraft);
  const [addPartId, setAddPartId] = useState("");

  const ownerTitle = owner ? undefined : "Only the owner can change parts.";
  const rows = list.data?.symptoms ?? [];

  const componentMeta = useMemo(() => {
    const map = new Map<string, { plainName: string; systemName: string }>();
    for (const system of browse.data?.systems ?? []) {
      for (const component of system.components) {
        map.set(component.id, { plainName: component.plainName, systemName: system.plainName });
      }
    }
    return map;
  }, [browse.data?.systems]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const hay = [
        row.label,
        row.hint ?? "",
        ...row.components.map((c) => componentMeta.get(c.componentId)?.plainName ?? ""),
      ].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [rows, filter, componentMeta]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  useEffect(() => {
    if (page >= pageCount) setPage(Math.max(0, pageCount - 1));
  }, [page, pageCount]);

  useEffect(() => {
    onEditingChange?.(editing);
  }, [editing, onEditingChange]);

  useEffect(() => {
    if (!editing) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeDrawer();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing]);

  function openNew() {
    if (!owner) return;
    const next = emptyDraft();
    setDraft(next);
    setBaseline(next);
    setEditing(true);
  }

  function openEdit(row: SymptomRow) {
    const next = draftFromRow(row);
    setDraft(next);
    setBaseline(next);
    setEditing(true);
  }

  function closeDrawer() {
    setEditing(false);
    setDraft(emptyDraft());
    setAddPartId("");
  }

  function categoryFor(row: SymptomRow) {
    const first = row.components[0]?.componentId;
    return first ? (componentMeta.get(first)?.systemName ?? "General") : "Unassigned";
  }

  async function persist() {
    if (!owner || !draft.label.trim() || !draft.reason.trim()) {
      toast.error("Problem name and audit reason are required.");
      return;
    }
    try {
      await saveSymptom({
        id: draft.id,
        label: draft.label.trim(),
        hint: draft.hint.trim() || null,
        active: draft.active,
        reason: draft.reason.trim(),
        components: draft.components.map((c, index) => ({
          componentId: c.componentId,
          rank: index + 1,
        })),
      });
      toast.success(draft.id ? "Problem updated" : "Problem added");
      await list.refetch();
      await summary.refetch();
      closeDrawer();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    }
  }

  function moveComponent(index: number, dir: -1 | 1) {
    const next = [...draft.components];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setDraft({ ...draft, components: next });
  }

  function removeComponent(index: number) {
    setDraft({
      ...draft,
      components: draft.components.filter((_, i) => i !== index),
    });
  }

  function addComponent() {
    if (!addPartId || draft.components.some((c) => c.componentId === addPartId)) return;
    setDraft({
      ...draft,
      components: [...draft.components, { componentId: addPartId, rank: draft.components.length + 1 }],
    });
    setAddPartId("");
  }

  const total = summary.data?.problems ?? rows.length;
  const liveCount = summary.data?.live ?? rows.filter((r) => r.active !== false).length;
  const selectedId = draft.id;
  const drawerCategory = selectedId
    ? categoryFor(rows.find((r) => r.id === selectedId) ?? { id: selectedId, label: draft.label, hint: draft.hint, components: draft.components })
    : "New problem";

  return (
    <div className="space-y-space-lg">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md">
        <div className="max-w-3xl">
          <div className="flex items-center gap-space-sm mb-1">
            <span className="font-mono-sm uppercase tracking-widest text-[10px] font-bold text-primary px-1.5 py-0.5 rounded bg-primary-fixed">Diagnostic mapping</span>
            <span className="font-mono-sm text-mono-sm text-outline">{total} symptoms indexed</span>
          </div>
          <h2 className="font-headline-xl text-headline-xl text-on-surface tracking-tight">Problems</h2>
          <p className="font-body-md text-body-md text-on-surface-variant mt-1">
            The &quot;By problem&quot; diagnostic lookup people see when they don&apos;t know the part&apos;s technical name. Staff can tune symptoms, hints, and prioritized candidate parts.
          </p>
        </div>
        <div className="flex items-center gap-space-md shrink-0">
          <div className="hidden xl:flex items-center gap-space-md bg-surface-container-lowest px-space-md py-1.5 rounded-xl shadow-sm">
            <div className="flex flex-col">
              <span className="font-label-xs text-label-xs uppercase text-outline">Problems</span>
              <span className="font-mono-md text-mono-md font-semibold text-on-surface">{total}</span>
            </div>
            <div className="w-px h-6 bg-surface-container-high" />
            <div className="flex flex-col">
              <span className="font-label-xs text-label-xs uppercase text-outline">Live</span>
              <span className="font-mono-md text-mono-md font-semibold text-on-surface">{liveCount}</span>
            </div>
          </div>
          <button
            type="button"
            className="h-9 px-space-md rounded-xl bg-primary-container text-on-primary font-body-sm font-semibold flex items-center gap-space-xs hover:bg-primary shadow-sm transition-colors disabled:opacity-40"
            disabled={!owner}
            title={ownerTitle}
            onClick={openNew}
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            <span>Add problem symptom</span>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-space-md">
        <div className="flex items-center gap-space-sm flex-1 max-w-xl">
          <div className="relative w-full">
            <span className="material-symbols-outlined absolute left-space-md top-1/2 -translate-y-1/2 text-outline text-[18px]">filter_alt</span>
            <input
              className="w-full h-9 pl-9 pr-space-md rounded-xl bg-surface-container-lowest text-on-surface placeholder:text-outline font-body-sm shadow-sm focus:outline-none focus:bg-surface-bright"
              placeholder="Filter by symptom phrasing, hint keyword, or part identifier..."
              value={filter}
              onChange={(event) => { setFilter(event.target.value); setPage(0); }}
            />
          </div>
          <div className="flex items-center gap-1.5 px-space-sm py-1.5 rounded-xl bg-surface-container-lowest shadow-sm font-body-sm text-on-surface-variant shrink-0">
            <span>Category:</span>
            <span className="font-semibold text-on-surface">All ({rows.length})</span>
          </div>
        </div>
        <div className="font-mono-sm text-mono-sm text-on-surface-variant">
          <span className="text-on-surface font-semibold">{pageRows.length}</span> active on view <span className="text-outline">/ {total} total</span>
        </div>
      </div>

      <div className={`grid grid-cols-12 gap-space-lg ${editing ? "" : ""}`}>
        <div className={`col-span-12 ${editing ? "xl:col-span-7 2xl:col-span-8" : ""} flex flex-col`}>
          <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low h-9 text-on-surface-variant font-label-xs uppercase tracking-wider">
                    <th className="px-space-md py-2 w-8 text-center">#</th>
                    <th className="px-space-md py-2 min-w-[200px]">Problem Symptom</th>
                    <th className="px-space-md py-2 min-w-[190px]">Customer Hint</th>
                    <th className="px-space-md py-2 min-w-[240px]">Likely Parts (Ranked)</th>
                    <th className="px-space-md py-2 w-[120px]">Live Status</th>
                    <th className="px-space-md py-2 w-[80px] text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container">
                  {pageRows.map((row, index) => {
                    const isSelected = editing && selectedId === row.id;
                    const live = row.active !== false;
                    const rankParts = row.components
                      .slice()
                      .sort((a, b) => a.rank - b.rank)
                      .map((link) => ({
                        rank: link.rank,
                        name: componentMeta.get(link.componentId)?.plainName ?? "Part",
                      }));
                    return (
                      <tr
                        key={row.id}
                        className={isSelected ? "bg-primary-fixed/30 hover:bg-primary-fixed/40 transition-colors" : "bg-surface-container-lowest hover:bg-surface-container-low transition-colors"}
                      >
                        <td className="px-space-md py-3 text-center align-top">
                          {isSelected ? (
                            <div className="w-1.5 h-6 bg-primary-container rounded-full mx-auto" title="Currently selected" />
                          ) : (
                            <span className="font-mono-sm text-mono-sm text-outline">{String(page * PAGE_SIZE + index + 1).padStart(2, "0")}</span>
                          )}
                        </td>
                        <td className="px-space-md py-3 align-top">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5">
                              <span className={`material-symbols-outlined text-[18px] ${isSelected ? "text-primary" : "text-on-surface-variant"}`}>{problemIcon(row.label)}</span>
                              <span className={`font-body-md ${isSelected ? "font-semibold" : "font-medium"} text-on-surface`}>{row.label}</span>
                            </div>
                            <div className="flex items-center gap-1 font-mono-sm text-mono-sm text-on-surface-variant flex-wrap">
                              <span className="bg-surface-container px-1 rounded text-[10px] text-primary font-medium uppercase">{categoryFor(row)}</span>
                              <span>· {symptomCode(row.id)}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-space-md py-3 align-top">
                          <span className="font-body-sm text-on-surface-variant italic">{row.hint ? `"${row.hint}"` : "—"}</span>
                        </td>
                        <td className="px-space-md py-3 align-top">
                          <div className="flex flex-wrap gap-1.5 items-center">
                            {rankParts.length ? rankParts.map((part, i) => (
                              <RankPill key={`${row.id}-${part.rank}`} rank={part.rank} name={part.name} primary={i === 0} />
                            )) : (
                              <span className="font-mono-sm text-outline">No parts mapped</span>
                            )}
                          </div>
                        </td>
                        <td className="px-space-md py-3 align-top">
                          <div className="flex items-center gap-2">
                            <LiveToggle live={live} disabled onChange={() => undefined} />
                            <span className={`font-mono-sm font-semibold ${live ? "text-primary" : "text-on-secondary-container bg-surface-container px-1.5 py-0.5 rounded font-medium"}`}>
                              {live ? "LIVE" : "NOT LIVE"}
                            </span>
                          </div>
                        </td>
                        <td className="px-space-md py-3 align-top text-right">
                          <button
                            type="button"
                            className={`h-7 px-2.5 rounded-lg font-body-sm font-medium shadow-xs inline-flex items-center gap-1 ${isSelected ? "bg-primary-container text-on-primary" : "bg-surface-container text-on-surface hover:bg-surface-container-high"}`}
                            onClick={() => openEdit(row)}
                          >
                            <span className="material-symbols-outlined text-[14px]">edit</span>
                            <span>{isSelected ? "Editing" : "Edit"}</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {!pageRows.length ? (
                    <tr>
                      <td colSpan={6} className="px-space-md py-8 text-center font-body-sm text-on-surface-variant">No problems match this filter.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="p-space-md bg-surface-container-low flex items-center justify-between font-mono-sm text-on-surface-variant flex-wrap gap-2">
              <span>
                Showing rows {filtered.length ? page * PAGE_SIZE + 1 : 0}–{Math.min(filtered.length, page * PAGE_SIZE + pageRows.length)} of {filtered.length}
              </span>
              <div className="flex items-center gap-space-xs">
                <button type="button" className="px-2 py-1 rounded bg-surface-container hover:bg-surface-container-highest disabled:opacity-40" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Prev</button>
                <span className="px-2 py-1 font-semibold text-primary bg-primary-fixed rounded">{page + 1}</span>
                <button type="button" className="px-2 py-1 rounded bg-surface-container hover:bg-surface-container-highest disabled:opacity-40" disabled={page + 1 >= pageCount} onClick={() => setPage((p) => p + 1)}>Next</button>
              </div>
            </div>
          </div>

          <div className="mt-space-lg p-space-md bg-surface-container-lowest rounded-xl shadow-sm flex items-start gap-space-md">
            <div className="w-8 h-8 rounded-lg bg-secondary-fixed flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-primary text-[20px]">psychology_alt</span>
            </div>
            <div>
              <span className="font-headline-md text-on-surface">Diagnostic matching rule</span>
              <p className="font-body-sm text-on-surface-variant mt-0.5">
                Ranked part mappings surface in Find parts under &quot;By problem.&quot; Priority 1 is the primary recommendation. Changes require an audit reason and are logged in Master Activity Log.
              </p>
            </div>
          </div>
        </div>

        {editing ? (
          <aside className="col-span-12 xl:col-span-5 2xl:col-span-4 bg-surface-container-lowest rounded-xl shadow-xl flex flex-col overflow-hidden self-start xl:sticky xl:top-20">
            <div className="p-space-lg bg-surface-container-low flex items-start justify-between gap-2">
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-space-xs mb-1">
                  <span className="w-2 h-2 rounded-full bg-primary-container" />
                  <span className="font-mono-sm text-[10px] tracking-wider font-bold text-primary uppercase">Inspection workspace</span>
                </div>
                <h3 className="font-headline-lg text-on-surface">Edit problem definition</h3>
                <span className="font-mono-sm text-on-surface-variant mt-0.5 truncate">
                  ID: <strong className="text-on-surface">{draft.id ? symptomCode(draft.id) : "NEW"}</strong>
                  {" · "}
                  Category: <strong className="text-on-surface">{drawerCategory}</strong>
                </span>
              </div>
              <button type="button" className="px-2.5 py-1 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant font-mono-sm font-semibold flex items-center gap-1 shrink-0" onClick={closeDrawer}>
                <span className="material-symbols-outlined text-[16px]">close</span>
                ESC
              </button>
            </div>

            <div className="p-space-lg flex flex-col gap-space-lg overflow-y-auto max-h-[calc(100vh-240px)]">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-label-md font-semibold text-on-surface" htmlFor="problem-text-input">Problem symptom text</label>
                  <span className="font-mono-sm text-outline">Customer phrasing</span>
                </div>
                <input
                  id="problem-text-input"
                  className="h-9 px-space-md rounded-xl bg-surface-container-low text-on-surface font-body-md focus:bg-surface-container-lowest focus:outline-none shadow-xs disabled:opacity-60"
                  value={draft.label}
                  disabled={!owner}
                  onChange={(event) => setDraft({ ...draft, label: event.target.value })}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-label-md font-semibold text-on-surface" htmlFor="hint-textarea">Diagnostic hint</label>
                  <span className="font-mono-sm text-outline">Consumer UI helper</span>
                </div>
                <textarea
                  id="hint-textarea"
                  rows={2}
                  className="p-space-md rounded-xl bg-surface-container-low text-on-surface font-body-md focus:bg-surface-container-lowest focus:outline-none shadow-xs resize-none disabled:opacity-60"
                  value={draft.hint}
                  disabled={!owner}
                  onChange={(event) => setDraft({ ...draft, hint: event.target.value })}
                />
              </div>

              <div className="flex flex-col gap-space-sm">
                <div className="flex items-center justify-between">
                  <label className="font-label-md font-semibold text-on-surface flex items-center gap-1.5">
                    Likely parts (Ranked Priority)
                    <span className="w-4 h-4 rounded-full bg-secondary-fixed text-primary flex items-center justify-center font-mono-sm text-[10px] font-bold">{draft.components.length}</span>
                  </label>
                </div>
                <div className="flex flex-col gap-2">
                  {draft.components.map((link, index) => {
                    const meta = componentMeta.get(link.componentId);
                    const primary = index === 0;
                    return (
                      <div key={link.componentId} className="p-space-sm bg-surface-container-low rounded-xl flex items-center justify-between shadow-xs group hover:bg-surface-container-high transition-colors gap-2">
                        <div className="flex items-center gap-space-sm min-w-0">
                          <div className="flex flex-col">
                            <button type="button" className="text-outline hover:text-on-surface p-0.5 disabled:opacity-30" disabled={!owner || index === 0} onClick={() => moveComponent(index, -1)} aria-label="Move up">
                              <span className="material-symbols-outlined text-[18px]">drag_indicator</span>
                            </button>
                          </div>
                          <div className={`w-6 h-6 rounded-lg flex items-center justify-center font-mono-md font-bold shadow-xs shrink-0 ${primary ? "bg-primary-container text-on-primary" : "bg-secondary text-on-secondary"}`}>
                            {index + 1}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-body-md font-semibold text-on-surface leading-tight truncate">{meta?.plainName ?? "Part"}</span>
                            <span className="font-mono-sm text-on-surface-variant truncate">{meta?.systemName ?? "Component"}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className={`font-mono-sm px-1.5 py-0.5 rounded font-medium ${primary ? "text-primary bg-primary-fixed" : "text-secondary bg-secondary-fixed"}`}>
                            {primary ? "Primary" : "Secondary"}
                          </span>
                          <button type="button" className="w-7 h-7 rounded-lg flex items-center justify-center text-outline hover:text-error hover:bg-surface-container-highest disabled:opacity-40" disabled={!owner} onClick={() => removeComponent(index)}>
                            <span className="material-symbols-outlined text-[16px]">close</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {owner ? (
                  <div className="flex gap-2">
                    <select
                      className="h-9 flex-1 rounded-xl bg-surface-container-low px-2 font-body-sm"
                      value={addPartId}
                      onChange={(event) => setAddPartId(event.target.value)}
                    >
                      <option value="">Choose a part to add…</option>
                      {(browse.data?.systems ?? []).flatMap((system) => system.components.map((c) => (
                        <option key={c.id} value={c.id}>{system.plainName} · {c.plainName}</option>
                      )))}
                    </select>
                    <button type="button" className="h-9 px-3 rounded-xl bg-surface-container hover:bg-surface-container-high text-primary font-body-sm font-semibold flex items-center gap-1" onClick={addComponent}>
                      <span className="material-symbols-outlined text-[18px]">add_circle</span>
                      Add
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="p-space-md bg-surface-container-low rounded-xl flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="font-label-md font-semibold text-on-surface">Active status</span>
                  <span className="font-body-sm text-on-surface-variant">Display in consumer diagnostic finder</span>
                </div>
                <LiveToggle live={draft.active} disabled={!owner} onChange={(active) => setDraft({ ...draft, active })} />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-label-md font-semibold text-on-surface flex items-center gap-1" htmlFor="audit-reason-input">
                    Reason for this change
                    <span className="text-error font-bold">*</span>
                  </label>
                  <span className="font-mono-sm text-error bg-error-container text-on-error-container px-1 rounded">AUDIT REQUIRED</span>
                </div>
                <input
                  id="audit-reason-input"
                  className="h-9 px-space-md rounded-xl bg-surface-container-low text-on-surface font-body-md placeholder:text-outline focus:bg-surface-container-lowest focus:outline-none shadow-xs disabled:opacity-60"
                  placeholder="e.g. Added rotor due to fleet brake inspection data"
                  value={draft.reason}
                  disabled={!owner}
                  onChange={(event) => setDraft({ ...draft, reason: event.target.value })}
                />
                <span className="font-mono-sm text-outline">Logged permanently in platform Master Activity Log.</span>
              </div>
            </div>

            <div className="p-space-lg bg-surface-container-low flex items-center justify-between gap-2 flex-wrap">
              <button type="button" className="h-9 px-space-md rounded-xl hover:bg-surface-container text-on-surface-variant font-body-sm font-semibold" onClick={closeDrawer}>Cancel</button>
              <div className="flex items-center gap-space-sm">
                <button
                  type="button"
                  className="h-9 px-space-md rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm font-medium shadow-xs disabled:opacity-40"
                  disabled={!owner}
                  title={ownerTitle}
                  onClick={() => setDraft({ ...baseline, reason: "" })}
                >
                  Revert to baseline
                </button>
                <button
                  type="button"
                  className="h-9 px-space-lg rounded-xl bg-primary-container text-on-primary font-body-sm font-semibold hover:bg-primary shadow-sm flex items-center gap-1.5 disabled:opacity-40"
                  disabled={!owner}
                  title={ownerTitle}
                  onClick={() => { void persist(); }}
                >
                  <span className="material-symbols-outlined text-[16px]">save</span>
                  Save changes
                </button>
              </div>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
