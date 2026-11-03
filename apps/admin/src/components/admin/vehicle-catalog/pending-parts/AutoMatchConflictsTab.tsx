import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../../auth/AuthContext";
import {
  fetchAutoMatchConflicts,
  fetchConflictHeatmap,
  fetchPartMatchSchedule,
  resolveAutoMatchConflict,
  resolveAutoMatchConflictsBatch,
  type MatchConflictRow,
} from "../../../../services/partsAutoMatchApi";

const TYPE_CHIPS: Array<{ id: string; label: string }> = [
  { id: "", label: "All types" },
  { id: "oe_ambiguous", label: "Same number, two parts" },
  { id: "part_type_mismatch", label: "Wrong part type" },
  { id: "position_side_mismatch", label: "Position or side differs" },
  { id: "index_wear_sensor", label: "Wear sensor differs" },
  { id: "index_merge_proposed", label: "Group merge suggested" },
  { id: "system_link", label: "Whole-system link" },
];

const STATUS_SEGMENTS = [
  { id: "open", label: "Open" },
  { id: "kept", label: "Kept" },
  { id: "removed", label: "Removed" },
  { id: "superseded", label: "No longer applies" },
];

function minutesUntil(iso: string | undefined): string {
  if (!iso) return "—";
  const ms = Date.parse(iso) - Date.now();
  if (!Number.isFinite(ms)) return "—";
  return String(Math.max(0, Math.round(ms / 60000)));
}

function displayCar(row: MatchConflictRow): string {
  return String(row.vehicle_label || row.car_label || row.vehicle_catalog_id || "—");
}

function displayPart(row: MatchConflictRow): string {
  return String(row.part_name || row.group_code || row.interchange_group_id || row.part_id || "—");
}

export function AutoMatchConflictsTab() {
  const { session, role } = useAuth();
  const token = session?.access_token ?? "";
  const owner = role === "platform_owner";
  const client = useQueryClient();
  const [type, setType] = useState("");
  const [status, setStatus] = useState("open");
  const [search, setSearch] = useState("");
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const schedule = useQuery({ queryKey: ["part-match-schedule"], queryFn: () => fetchPartMatchSchedule(token), enabled: Boolean(token) });
  const heatmap = useQuery({ queryKey: ["conflict-heatmap"], queryFn: () => fetchConflictHeatmap(token), enabled: Boolean(token) });
  const list = useQuery({
    queryKey: ["auto-match-conflicts", type, status, search],
    queryFn: () => fetchAutoMatchConflicts(token, { type: type || undefined, status, q: search }),
    enabled: Boolean(token),
  });

  const rows = list.data?.rows ?? [];
  const totalsByType = list.data?.totalsByType ?? {};
  const totalsByStatus = list.data?.totalsByStatus ?? {};
  const drawer = rows.find((r: MatchConflictRow) => String(r.id) === drawerId);

  async function resolve(action: "keep" | "remove", id = drawerId) {
    if (!id || !note.trim()) {
      toast.message("Add a note for the audit trail.");
      return;
    }
    setBusy(true);
    try {
      await resolveAutoMatchConflict(token, id, action, note.trim());
      toast.success(action === "keep" ? "Kept" : "Removed");
      setDrawerId(null);
      setNote("");
      await client.invalidateQueries({ queryKey: ["auto-match-conflicts"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not resolve");
    } finally {
      setBusy(false);
    }
  }

  async function batchResolveRules() {
    if (!owner) return;
    const openRows = rows.filter((r) => String(r.status) === "open").slice(0, 5);
    if (!openRows.length) {
      toast.message("No open rows on this page to batch.");
      return;
    }
    setBusy(true);
    try {
      await resolveAutoMatchConflictsBatch(
        token,
        openRows.map((r) => ({ id: String(r.id), action: "keep" as const, note: "Batch resolve rules" })),
      );
      toast.success("Batch resolved");
      await client.invalidateQueries({ queryKey: ["auto-match-conflicts"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Batch failed");
    } finally {
      setBusy(false);
    }
  }

  const nextRun = schedule.data?.nextRun;

  const statusCounts = useMemo(() => STATUS_SEGMENTS.map((seg) => ({
    ...seg,
    count: totalsByStatus[seg.id] ?? 0,
  })), [totalsByStatus]);

  return (
    <div className="flex flex-col gap-space-lg">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-[0.5rem] border border-outline-variant p-3 text-sm">
          <p className="font-semibold uppercase text-xs text-secondary">Conflict heatmap</p>
          <p className="mt-1">Open {heatmap.data?.openCount ?? 0} · Types {Object.keys(heatmap.data?.byType ?? {}).length}</p>
        </div>
        <div className="rounded-[0.5rem] border border-outline-variant p-3 text-sm">
          <p className="font-semibold uppercase text-xs text-secondary">Geometry verification</p>
          <p className="mt-1">Position / side mismatches: {totalsByType.position_side_mismatch ?? 0}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button type="button" className="rounded-[0.25rem] border border-outline-variant px-3 py-1.5 text-sm disabled:opacity-40" disabled={!owner || busy} onClick={() => { void batchResolveRules(); }}>
          Batch Resolve Rules
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {TYPE_CHIPS.map((chip) => (
          <button
            key={chip.id || "all"}
            type="button"
            className={`rounded-[0.75rem] px-3 py-1 text-xs font-semibold ${type === chip.id ? "bg-primary-container text-on-primary" : "bg-surface-container"}`}
            onClick={() => setType(chip.id)}
          >
            {chip.label}{chip.id && totalsByType[chip.id] != null ? ` (${totalsByType[chip.id]})` : ""}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {statusCounts.map((seg) => (
          <button
            key={seg.id}
            type="button"
            className={`rounded-[0.25rem] px-3 py-1 text-sm ${status === seg.id ? "bg-on-surface text-surface" : "bg-surface-container"}`}
            onClick={() => setStatus(seg.id)}
          >
            {seg.label} ({seg.count})
          </button>
        ))}
        <input className="ml-auto min-w-[200px] rounded-[0.25rem] border border-outline-variant px-3 py-1.5 text-sm" placeholder="Search car, number, group…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {list.isLoading ? (
        <p className="flex items-center gap-2 text-secondary"><Loader2 className="h-4 w-4 animate-spin" /> Loading conflicts…</p>
      ) : (
        <div className="overflow-x-auto rounded-[0.5rem] border border-outline-variant">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-surface-container-low uppercase tracking-wider text-on-surface-variant">
              <tr>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Detail</th>
                <th className="px-3 py-2">Found</th>
                <th className="px-3 py-2">Car</th>
                <th className="px-3 py-2">Part</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row: MatchConflictRow) => {
                const st = String(row.status || "");
                return (
                  <tr key={String(row.id)} className="border-t border-outline-variant/40">
                    <td className="px-3 py-2 font-mono">{String(row.conflict_type || "—")}</td>
                    <td className="px-3 py-2">{String(row.code || row.detail || "—").slice(0, 40)}</td>
                    <td className="px-3 py-2 font-mono">{String(row.matched_key || "—")}</td>
                    <td className="px-3 py-2">{displayCar(row)}</td>
                    <td className="px-3 py-2">{displayPart(row)}</td>
                    <td className="px-3 py-2">{st}</td>
                    <td className="px-3 py-2">
                      {st === "open" ? (
                        <div className="flex flex-wrap gap-2">
                          <button type="button" className="text-primary font-semibold" onClick={() => { setDrawerId(String(row.id)); setNote(""); }}>Review</button>
                          <button type="button" className="text-secondary" disabled={busy} onClick={() => {
                            void resolveAutoMatchConflict(token, String(row.id), "keep", "Inline keep").then(() => client.invalidateQueries({ queryKey: ["auto-match-conflicts"] }));
                          }}>Keep</button>
                          <button type="button" className="text-red-700" disabled={busy} onClick={() => {
                            void resolveAutoMatchConflict(token, String(row.id), "remove", "Inline remove").then(() => client.invalidateQueries({ queryKey: ["auto-match-conflicts"] }));
                          }}>Remove</button>
                        </div>
                      ) : st === "superseded" ? "—" : "Resolved"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <footer className="text-sm text-secondary border-t border-outline-variant/40 pt-3">
        Resolved-by audit trail · ENGINE PULSE: T-MINUS {minutesUntil(nextRun)}M ·{" "}
        <a className="text-primary font-semibold" href="/?page=global-settings-general">View audit-trail settings ↗</a>
      </footer>
      {drawer ? (
        <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-md border-l border-outline-variant bg-surface-container-lowest p-space-lg shadow-2xl overflow-y-auto">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-mono-sm text-mono-sm text-secondary">{String(drawer.code || drawer.id)}</p>
              <h3 className="font-headline-md text-headline-md">{String(drawer.conflict_type)}</h3>
            </div>
            <button type="button" onClick={() => setDrawerId(null)}>✕</button>
          </div>
          <section className="mt-4 text-sm">
            <h4 className="font-semibold uppercase text-xs text-secondary">Car &amp; parts involved</h4>
            <p className="mt-1">{displayCar(drawer)} · {displayPart(drawer)}</p>
          </section>
          <section className="mt-3 text-sm">
            <h4 className="font-semibold uppercase text-xs text-secondary">Numbers involved</h4>
            <p className="mt-1 font-mono">{String(drawer.matched_key || "—")}</p>
          </section>
          <section className="mt-3 text-sm rounded border border-outline-variant/40 p-3">
            <p className="font-semibold">What Keep / Remove does</p>
            <p className="text-secondary mt-1">Keep confirms the proposal. Remove closes it without deleting manual listings. Manual wins always.</p>
          </section>
          <label className="mt-4 block text-xs font-semibold uppercase text-secondary">Note · mandatory for audit trail</label>
          <textarea className="mt-1 w-full rounded-[0.25rem] border border-outline-variant p-2 text-sm" rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="mt-4 flex gap-2">
            <button type="button" className="flex-1 rounded-[0.25rem] border border-outline-variant py-2 text-sm" disabled={busy} onClick={() => { void resolve("remove"); }}>Remove</button>
            <button type="button" className="flex-1 rounded-[0.25rem] bg-primary-container py-2 text-sm font-semibold text-on-primary" disabled={busy} onClick={() => { void resolve("keep"); }}>Keep</button>
          </div>
        </aside>
      ) : null}
    </div>
  );
}
