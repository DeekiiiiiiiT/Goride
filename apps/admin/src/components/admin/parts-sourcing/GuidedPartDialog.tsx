import React, { useEffect, useMemo, useState } from "react";
import { Button } from "../../ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../../ui/dialog";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { partsEnterpriseApi } from "../../../services/partSourcingService";
import { toast } from "sonner";

export type GuidedVariant = {
  id: string;
  label: string;
  yearFrom?: number | null;
  yearTo?: number | null;
};

export type GuidedJob = {
  opCode: string;
  label: string;
  position?: string | null;
};

type PartDraft = { manufacturer: string; partNumber: string; name: string; kind: string };
type FitChoice = "catalog_variant" | "platform" | "engine_family";
type PreviewVehicle = {
  variantId: string;
  make: string;
  model: string;
  trim?: string | null;
  chassis?: string | null;
  engine?: string | null;
  yearFrom?: number | null;
  yearTo?: number | null;
  included: boolean;
  differentEngine?: boolean;
  outsideYears?: boolean;
};

const KINDS = [
  ["oem", "Factory"],
  ["oe_supplier", "Original supplier"],
  ["aftermarket", "Other brand"],
] as const;

export function GuidedPartDialog({
  open,
  token,
  variant,
  job,
  mode,
  groupId,
  initialParts,
  onClose,
  onSaved,
}: {
  open: boolean;
  token: string;
  variant: GuidedVariant;
  job: GuidedJob;
  mode: "create" | "edit" | "fit";
  groupId?: string | null;
  initialParts?: PartDraft[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [step, setStep] = useState(mode === "fit" ? 2 : 1);
  const [parts, setParts] = useState<PartDraft[]>(initialParts?.length ? initialParts : [{
    manufacturer: "",
    partNumber: "",
    name: job.label,
    kind: "oem",
  }]);
  const [fit, setFit] = useState<FitChoice>("catalog_variant");
  const [yearFrom, setYearFrom] = useState(variant.yearFrom != null ? String(variant.yearFrom) : "");
  const [yearTo, setYearTo] = useState(variant.yearTo != null ? String(variant.yearTo) : "");
  const [ticks, setTicks] = useState<string[] | null>(null);
  const [vehicles, setVehicles] = useState<PreviewVehicle[]>([]);
  const [engineAllowed, setEngineAllowed] = useState(false);
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(mode === "fit" ? 2 : 1);
    setParts(initialParts?.length ? initialParts : [{ manufacturer: "", partNumber: "", name: job.label, kind: "oem" }]);
    setFit("catalog_variant");
    setYearFrom(variant.yearFrom != null ? String(variant.yearFrom) : "");
    setYearTo(variant.yearTo != null ? String(variant.yearTo) : "");
    setTicks(null);
    setEvidenceUrl("");
    setNote("");
  }, [open, mode, job.label, job.opCode, variant.id, variant.yearFrom, variant.yearTo, initialParts]);

  useEffect(() => {
    if (!open || step < 2) return;
    const handle = window.setTimeout(() => {
      void partsEnterpriseApi.previewFit(token, {
        variantId: variant.id,
        componentOpCode: job.opCode,
        fit,
        yearFrom: yearFrom ? Number(yearFrom) : null,
        yearTo: yearTo ? Number(yearTo) : null,
        ...(ticks ? { tickedVariantIds: ticks } : {}),
      }).then((data) => {
        const rows = Array.isArray(data.vehicles) ? data.vehicles as PreviewVehicle[] : [];
        setVehicles(rows);
        setEngineAllowed(Boolean(data.engineScopeAllowed));
        if (!ticks) setTicks(rows.filter((row) => row.included).map((row) => row.variantId));
      }).catch((err) => toast.error(err instanceof Error ? err.message : "Could not list the cars"));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [open, step, token, variant.id, job.opCode, fit, yearFrom, yearTo, ticks]);

  const included = useMemo(
    () => vehicles.filter((row) => (ticks ? ticks.includes(row.variantId) : row.included)),
    [vehicles, ticks],
  );

  function toggle(id: string) {
    setTicks((prev) => {
      const current = prev ?? vehicles.filter((row) => row.included).map((row) => row.variantId);
      return current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
    });
  }

  async function save() {
    if (!evidenceUrl.trim() && mode !== "fit") {
      toast.error("Add the source link.");
      return;
    }
    setBusy(true);
    try {
      const body = {
        variantId: variant.id,
        componentOpCode: job.opCode,
        fit,
        position: job.position ?? null,
        yearFrom: yearFrom ? Number(yearFrom) : null,
        yearTo: yearTo ? Number(yearTo) : null,
        tickedVariantIds: ticks ?? included.map((row) => row.variantId),
        evidenceUrl: evidenceUrl.trim(),
        note: note.trim(),
        parts: parts.map((part) => ({ ...part, name: part.name || job.label })),
      };
      if (mode === "fit" && groupId) await partsEnterpriseApi.replaceFit(token, groupId, body);
      else await partsEnterpriseApi.saveGuidedPart(token, { ...body, ...(mode === "edit" && groupId ? { groupId } : {}) });
      toast.success("Saved");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  const summary = `${parts.filter((part) => part.partNumber.trim()).map((part) => `${part.manufacturer} ${part.partNumber}`).join(" + ")} (${job.label}) fits ${included.length === 1 ? included[0] ? `${included[0].make} ${included[0].model}` : variant.label : `${included.length} vehicles`}.`;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "fit" ? `Which cars use this ${job.label.toLowerCase()}?` : `Add ${job.label}`}</DialogTitle>
        </DialogHeader>
        {step === 1 && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">For {variant.label}. {job.position ? `Position: ${job.position}.` : ""}</p>
            {parts.map((part, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-2 border rounded-lg p-3">
                <div>
                  <Label>Brand</Label>
                  <Input value={part.manufacturer} onChange={(e) => setParts((rows) => rows.map((row, i) => i === index ? { ...row, manufacturer: e.target.value } : row))} />
                </div>
                <div>
                  <Label>Part number</Label>
                  <Input value={part.partNumber} onChange={(e) => setParts((rows) => rows.map((row, i) => i === index ? { ...row, partNumber: e.target.value } : row))} />
                </div>
                <div>
                  <Label>Name</Label>
                  <Input value={part.name} onChange={(e) => setParts((rows) => rows.map((row, i) => i === index ? { ...row, name: e.target.value } : row))} />
                </div>
                <div>
                  <Label>Kind</Label>
                  <select className="h-9 w-full rounded-md border bg-transparent px-2 text-sm" value={part.kind} onChange={(e) => setParts((rows) => rows.map((row, i) => i === index ? { ...row, kind: e.target.value } : row))}>
                    {KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setParts((rows) => [...rows, { manufacturer: "", partNumber: "", name: job.label, kind: "aftermarket" }])}>Add another brand for the same part</Button>
          </div>
        )}
        {step === 2 && (
          <div className="space-y-3">
            <div className="space-y-2">
              {([
                ["catalog_variant", `Only ${variant.label}`],
                ["platform", "All cars with this body"],
                ["engine_family", "All cars with this engine"],
              ] as const).map(([value, label]) => (
                <label key={value} className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name="fit"
                    checked={fit === value}
                    disabled={value === "engine_family" && !engineAllowed}
                    onClick={() => { setFit(value); setTicks(null); }}
                    onChange={() => { setFit(value); setTicks(null); }}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            {fit === "engine_family" && (
              <p className="text-sm text-amber-700">Only choose this if the maker's catalog lists the part by engine.</p>
            )}
            <div className="flex gap-2">
              <div>
                <Label>From year</Label>
                <Input value={yearFrom} onChange={(e) => { setYearFrom(e.target.value); setTicks(null); }} />
              </div>
              <div>
                <Label>To year</Label>
                <Input value={yearTo} onChange={(e) => { setYearTo(e.target.value); setTicks(null); }} />
              </div>
            </div>
            {fit !== "catalog_variant" && (
              <ul className="max-h-48 overflow-auto space-y-1 text-sm">
                {vehicles.map((row) => (
                  <li key={row.variantId}>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={ticks ? ticks.includes(row.variantId) : row.included} onChange={() => toggle(row.variantId)} />
                      <span>{row.make} {row.model} {row.trim || ""} {row.chassis || ""} {row.engine || ""} {row.yearFrom || ""}–{row.yearTo || ""}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-sm text-slate-600">{included.length} vehicle{included.length === 1 ? "" : "s"} will get this part.</p>
          </div>
        )}
        {step === 3 && (
          <div className="space-y-3">
            <div>
              <Label>Source link</Label>
              <Input value={evidenceUrl} placeholder="Maker catalog, supplier table, or dealer page" onChange={(e) => setEvidenceUrl(e.target.value)} />
            </div>
            <div>
              <Label>Note (optional)</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
        )}
        {step === 4 && (
          <p className="text-sm">{summary}{evidenceUrl ? ` Source: ${evidenceUrl}` : ""}</p>
        )}
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          {step > (mode === "fit" ? 2 : 1) && <Button type="button" variant="outline" onClick={() => setStep((n) => n - 1)}>Back</Button>}
          {step < 4 && <Button type="button" onClick={() => setStep((n) => (mode === "fit" && n === 2 ? 4 : n + 1))}>Next</Button>}
          {step === 4 && <Button type="button" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
