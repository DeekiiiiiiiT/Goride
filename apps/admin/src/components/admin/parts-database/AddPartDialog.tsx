// Stitch: dominion-redesign/9b20186c50eb48d39476d9e0f52ec583
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  fetchPartCategories,
  fetchPartJobs,
  fetchSameModel,
  saveBodyFamily,
  saveGuidedPart,
} from "./partsDatabaseApi";

type BrandRow = { manufacturer: string; partNumber: string; name: string; kind: string };

export function AddPartDialog({
  variantId,
  onClose,
  jobOpCode,
  categoryMode = false,
  groupId,
  initialParts,
}: {
  variantId: string;
  onClose: () => void;
  jobOpCode?: string;
  categoryMode?: boolean;
  groupId?: string | null;
  initialParts?: BrandRow[];
}) {
  const client = useQueryClient();
  const [step, setStep] = useState(0);
  const [rows, setRows] = useState<BrandRow[]>(initialParts?.length ? initialParts : [{ manufacturer: "", partNumber: "", name: "", kind: "factory" }]);
  const [job, setJob] = useState(jobOpCode ?? "");
  const [categoryId, setCategoryId] = useState("");
  const [position, setPosition] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [ticked, setTicked] = useState<string[]>([]);
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState("");

  const jobs = useQuery({ queryKey: ["part-jobs"], queryFn: fetchPartJobs });
  const categories = useQuery({ queryKey: ["part-categories"], queryFn: fetchPartCategories, enabled: categoryMode || !job });
  const same = useQuery({ queryKey: ["same-model", variantId], queryFn: () => fetchSameModel(variantId), enabled: Boolean(variantId) });
  const chosen = (jobs.data?.items ?? []).find((item) => item.op_code === job && (item.position ?? "") === position);

  async function save() {
    setError("");
    try {
      await saveGuidedPart({
        variantId,
        groupId: groupId ?? undefined,
        componentOpCode: categoryMode ? undefined : job,
        categoryId: categoryMode ? categoryId : undefined,
        position: position || chosen?.position || undefined,
        yearFrom: yearFrom || undefined,
        yearTo: yearTo || undefined,
        tickedVariantIds: ticked,
        evidenceUrl,
        note,
        parts: rows.filter((row) => row.manufacturer && row.partNumber).map((row) => ({
          manufacturer: row.manufacturer,
          partNumber: row.partNumber,
          name: row.name || row.partNumber,
          kind: row.kind,
        })),
      });
      await client.invalidateQueries({ queryKey: ["find-parts"] });
      await client.invalidateQueries({ queryKey: ["variant-checklist"] });
      await client.invalidateQueries({ queryKey: ["parts-overview"] });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    }
  }

  async function showReach() {
    setPreview("");
    try {
      const result = await saveBodyFamily({
        dryRun: true,
        evidenceUrl: evidenceUrl || "https://example.com/preview",
        platformIds: [],
        label: "Reach preview",
      });
      setPreview(`Before ${result.before ?? 0}. After ${result.after ?? 0}.`);
    } catch (err) {
      setPreview(err instanceof Error ? err.message : "No reach preview");
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-inverse-surface/40 flex items-center justify-center p-4">
      <div className="bg-surface-container-lowest rounded-xl shadow-sm w-full max-w-xl p-6 space-y-4 max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-on-surface-variant">Parts & cross-reference ledger</p>
            <h2 className="text-lg font-semibold">{groupId ? "Edit a part" : "Add a part"}</h2>
          </div>
          <button type="button" onClick={onClose}>Close</button>
        </div>
        <div className="flex gap-3 text-xs">
          <button type="button" onClick={() => setStep(0)}>✓ Part</button>
          <button type="button" onClick={() => setStep(1)}>2 Same source</button>
          <button type="button" onClick={() => setStep(2)}>3 Source</button>
          <button type="button" onClick={() => setStep(3)}>4 Review</button>
        </div>
        {step === 0 ? (
          <div className="space-y-3">
            <p className="text-xs font-semibold">Classification</p>
            {categoryMode ? (
              <label className="block text-xs">Category
                <select className="mt-1 w-full bg-surface-container-low rounded-lg px-3 py-2 text-sm" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                  <option value="">Choose a category</option>
                  {(categories.data?.items ?? []).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
            ) : (
              <label className="block text-xs">Job
                <select className="mt-1 w-full bg-surface-container-low rounded-lg px-3 py-2 text-sm" value={`${job}|${position}`} onChange={(event) => {
                  const [op, pos] = event.target.value.split("|");
                  setJob(op ?? "");
                  setPosition(pos ?? "");
                }}>
                  <option value="|">Choose a job</option>
                  {(jobs.data?.items ?? []).map((item) => (
                    <option key={`${item.op_code}-${item.position ?? ""}-${item.label}`} value={`${item.op_code}|${item.position ?? ""}`}>{item.label}</option>
                  ))}
                </select>
              </label>
            )}
            {rows.map((row, index) => (
              <div key={index} className="grid grid-cols-2 gap-2">
                <input className="bg-surface-container-low rounded-lg px-3 py-2 text-sm" placeholder="Brand" value={row.manufacturer} onChange={(event) => setRows((current) => current.map((item, i) => i === index ? { ...item, manufacturer: event.target.value } : item))} />
                <input className="bg-surface-container-low rounded-lg px-3 py-2 text-sm" placeholder="Part number" value={row.partNumber} onChange={(event) => setRows((current) => current.map((item, i) => i === index ? { ...item, partNumber: event.target.value } : item))} />
                <input className="bg-surface-container-low rounded-lg px-3 py-2 text-sm" placeholder="Name" value={row.name} onChange={(event) => setRows((current) => current.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} />
                <select className="bg-surface-container-low rounded-lg px-3 py-2 text-sm" value={row.kind} onChange={(event) => setRows((current) => current.map((item, i) => i === index ? { ...item, kind: event.target.value } : item))}>
                  <option value="factory">Factory</option>
                  <option value="supplier">Original supplier</option>
                  <option value="other">Other brand</option>
                </select>
              </div>
            ))}
            <button type="button" className="text-xs text-secondary" onClick={() => setRows((current) => [...current, { manufacturer: "", partNumber: "", name: "", kind: "other" }])}>+ Add another brand for the same part</button>
            {rows.length > 1 ? <button type="button" className="text-xs ml-3" onClick={() => setRows((current) => current.slice(0, -1))}>Remove brand</button> : null}
            <div className="grid grid-cols-2 gap-2">
              <input className="bg-surface-container-low rounded-lg px-3 py-2 text-sm" placeholder="Year from" value={yearFrom} onChange={(event) => setYearFrom(event.target.value)} />
              <input className="bg-surface-container-low rounded-lg px-3 py-2 text-sm" placeholder="Year to" value={yearTo} onChange={(event) => setYearTo(event.target.value)} />
            </div>
            {position ? <p className="text-xs">Position: {position}</p> : null}
          </div>
        ) : null}
        {step === 1 ? (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Does the same source also list it for…?</h3>
            <p className="text-xs text-on-surface-variant">Same make and model only. It will also show as Sister or Engine-compatible where the cars match.</p>
            {(same.data?.items ?? []).map((car) => (
              <label key={car.id} className="flex gap-2 text-sm">
                <input type="checkbox" checked={ticked.includes(car.id) || car.id === variantId} disabled={car.id === variantId} onChange={() => setTicked((current) => current.includes(car.id) ? current.filter((id) => id !== car.id) : [...current, car.id])} />
                <span>{car.chassis_code} · {car.production_start_year}–{car.production_end_year ?? ""}</span>
              </label>
            ))}
          </div>
        ) : null}
        {step === 2 ? (
          <div className="space-y-3">
            <label className="block text-xs">Source link *</label>
            <input className="w-full bg-surface-container-low rounded-lg px-3 py-2 text-sm" value={evidenceUrl} onChange={(event) => setEvidenceUrl(event.target.value)} />
            <label className="block text-xs">Note (optional)</label>
            <input className="w-full bg-surface-container-low rounded-lg px-3 py-2 text-sm" value={note} onChange={(event) => setNote(event.target.value)} />
          </div>
        ) : null}
        {step === 3 ? (
          <div className="space-y-2 text-sm">
            <p>{rows.map((row) => `${row.manufacturer} ${row.partNumber}`).join(", ")} listed for this vehicle{position ? ` (${position})` : ""}.</p>
            <button type="button" title="Show cars open_in_new" className="text-xs text-secondary" onClick={() => { void showReach(); }}>Show cars open_in_new</button>
            {preview ? <p className="text-xs">{preview}</p> : null}
          </div>
        ) : null}
        {error ? <p className="text-xs text-red-700">{error}</p> : null}
        <div className="flex justify-between">
          <button type="button" className="text-sm" onClick={onClose}>Cancel</button>
          <div className="flex gap-2">
            {step > 0 ? <button type="button" className="text-sm" onClick={() => setStep((value) => value - 1)}>Back</button> : null}
            <button type="button" className="bg-secondary text-on-secondary text-sm px-3 py-2 rounded-lg" onClick={() => { if (step < 3) setStep((value) => value + 1); else void save(); }}>
              {step === 0 ? "Next: same source" : step === 1 ? "Next: source arrow_forward" : step === 2 ? "Next: review" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
