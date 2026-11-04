import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { fetchChecklist, fetchSpecKeys, saveSpec } from "../parts-database/partsDatabaseApi";

type SpecRow = {
  specKey?: string;
  label?: string;
  unit?: string | null;
  value?: string | null;
  source?: string | null;
};

export function VehicleCarSpecsSection({ variantId }: { variantId: string }) {
  const qc = useQueryClient();
  const keys = useQuery({ queryKey: ["spec-keys"], queryFn: fetchSpecKeys });
  const checklist = useQuery({
    queryKey: ["variant-checklist-specs", variantId],
    queryFn: () => fetchChecklist(variantId),
  });

  const [specKey, setSpecKey] = useState("");
  const [value, setValue] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");

  const existing = ((checklist.data?.specs as SpecRow[] | undefined) ?? []).filter((s) => s.value);

  const save = useMutation({
    mutationFn: () =>
      saveSpec({
        variantId,
        specKey,
        value: value.trim(),
        scope: "variant",
        evidenceUrl: evidenceUrl.trim(),
      }),
    onSuccess: () => {
      toast.success("Car spec saved");
      setValue("");
      setEvidenceUrl("");
      void qc.invalidateQueries({ queryKey: ["variant-checklist-specs", variantId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save spec"),
  });

  const selected = keys.data?.items.find((k) => k.key === specKey);

  return (
    <div className="rounded-[0.5rem] border border-slate-200 bg-white p-4 lg:col-span-2 xl:col-span-4">
      <h3 className="mb-3 border-b border-slate-200 pb-2.5 font-headline text-[11px] font-semibold uppercase tracking-wider text-slate-800">
        Car specs
      </h3>
      <p className="mb-3 text-xs text-slate-500">
        Values here power &quot;By size or spec&quot; when adding parts. Each value needs an https source link.
      </p>
      {existing.length > 0 ? (
        <ul className="mb-4 divide-y divide-slate-100 text-xs">
          {existing.map((row) => (
            <li key={String(row.specKey)} className="flex flex-wrap items-baseline gap-x-2 py-2">
              <span className="font-medium text-slate-800">{row.label ?? row.specKey}</span>
              <span className="font-mono text-slate-900">
                {row.value}
                {row.unit ? ` ${row.unit}` : ""}
              </span>
              {row.source ? (
                <a href={row.source} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                  Source
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-4 text-xs text-slate-400">No spec values on file for this car yet.</p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-slate-600">Spec</span>
          <select
            className="h-10 rounded-lg border border-slate-200 px-2"
            value={specKey}
            onChange={(e) => setSpecKey(e.target.value)}
          >
            <option value="">Choose…</option>
            {(keys.data?.items ?? []).map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
                {k.unit ? ` (${k.unit})` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-slate-600">Value{selected?.unit ? ` (${selected.unit})` : ""}</span>
          <input
            className="h-10 rounded-lg border border-slate-200 px-3 font-mono"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={selected?.unit ? "e.g. 525" : "Value"}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs sm:col-span-2 lg:col-span-1">
          <span className="font-medium text-slate-600">Source link</span>
          <input
            className="h-10 rounded-lg border border-slate-200 px-3"
            value={evidenceUrl}
            onChange={(e) => setEvidenceUrl(e.target.value)}
            placeholder="https://…"
          />
        </label>
        <div className="flex items-end">
          <button
            type="button"
            className="h-10 w-full rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
            disabled={!specKey || !value.trim() || !evidenceUrl.trim().startsWith("https://") || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : "Save spec"}
          </button>
        </div>
      </div>
    </div>
  );
}
