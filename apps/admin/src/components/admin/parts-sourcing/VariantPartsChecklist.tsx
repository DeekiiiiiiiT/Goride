import React, { useCallback, useEffect, useState } from "react";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { partsEnterpriseApi } from "../../../services/partSourcingService";
import { toast } from "sonner";
import { AddPartDialog } from "../parts-database/AddPartDialog";

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

type JobRow = {
  section: string;
  opCode: string;
  label: string;
  position?: string | null;
  status: string;
  reason?: string | null;
  groupId?: string | null;
  evidenceUrl?: string | null;
  parts?: Array<{ id: string; manufacturer?: string; partNumber?: string; name?: string; kind?: string }>;
};
type Supply = { id: string; opCode: string; name: string; note?: string | null };

const STATUS: Record<string, string> = {
  verified: "Verified",
  unverified: "Needs checking",
  not_applicable: "Not on this car",
  missing: "Empty",
};

export function VariantPartsChecklist({
  token,
  variant,
  onlyGaps = false,
}: {
  token: string;
  variant: GuidedVariant;
  onlyGaps?: boolean;
}) {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [dialog, setDialog] = useState<{ mode: "create" | "edit" | "fit"; job: GuidedJob; groupId?: string | null; parts?: JobRow["parts"] } | null>(null);
  const [naJob, setNaJob] = useState<JobRow | null>(null);
  const [reason, setReason] = useState("");
  const [scope, setScope] = useState("variant");
  const [removeJob, setRemoveJob] = useState<JobRow | null>(null);
  const [deletePart, setDeletePart] = useState(false);
  const [supplyName, setSupplyName] = useState("");
  const [supplyJob, setSupplyJob] = useState("ENG-OIL");
  const [error, setError] = useState("");

  const load = useCallback(() => {
    void partsEnterpriseApi.checklist(token, variant.id).then((data) => {
      setJobs(Array.isArray(data.jobs) ? data.jobs as JobRow[] : []);
      setSupplies(Array.isArray(data.supplies) ? data.supplies as Supply[] : []);
      setError("");
    }).catch((err) => setError(err instanceof Error ? err.message : "Could not load parts"));
  }, [token, variant.id]);

  useEffect(() => { load(); }, [load]);

  const visible = jobs.filter((job) => !onlyGaps || (job.status !== "verified" && job.status !== "not_applicable"));
  const sections = [...new Set(visible.map((job) => job.section))];

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {sections.map((section) => (
        <section key={section} className="space-y-2">
          <h3 className="text-sm font-semibold">{section}</h3>
          <ul className="divide-y rounded-lg border">
            {visible.filter((job) => job.section === section).map((job) => (
              <li key={`${job.opCode}-${job.position ?? ""}`} className="flex flex-wrap items-center gap-2 p-3 text-sm">
                <span className="font-medium flex-1">{job.label}</span>
                <span className={job.status === "not_applicable" ? "text-slate-400" : job.status === "verified" ? "text-emerald-700" : "text-amber-700"}>
                  {STATUS[job.status] ?? job.status}
                </span>
                {job.parts?.length ? <span className="text-slate-500">{job.parts.map((part) => `${part.manufacturer ?? ""} ${part.partNumber ?? ""}`.trim()).join(" · ")}</span> : null}
                {job.status === "missing" || job.status === "unverified" ? (
                  <Button type="button" size="sm" onClick={() => setDialog({ mode: job.groupId ? "edit" : "create", job, groupId: job.groupId, parts: job.parts })}>{job.groupId ? "Edit" : "Add"}</Button>
                ) : null}
                {job.status === "verified" ? (
                  <>
                    <Button type="button" size="sm" variant="outline" onClick={() => setDialog({ mode: "edit", job, groupId: job.groupId, parts: job.parts })}>Edit</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setDialog({ mode: "fit", job, groupId: job.groupId, parts: job.parts })}>Widen / narrow</Button>
                  </>
                ) : null}
                {job.status !== "not_applicable" ? (
                  <Button type="button" size="sm" variant="ghost" onClick={() => { setNaJob(job); setReason(""); setScope("variant"); }}>Not on this car</Button>
                ) : null}
                {job.groupId ? (
                  <Button type="button" size="sm" variant="ghost" onClick={() => { setRemoveJob(job); setDeletePart(false); }}>Remove from this car</Button>
                ) : null}
                {supplies.filter((item) => item.opCode === job.opCode).map((item) => (
                  <span key={item.id} className="text-xs text-slate-500">You may also need {item.name}{item.note ? ` (${item.note})` : ""}</span>
                ))}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <Label>You may also need</Label>
          <select className="h-9 rounded-md border bg-transparent px-2 text-sm" value={supplyJob} onChange={(e) => setSupplyJob(e.target.value)}>
            {jobs.filter((job, index, list) => list.findIndex((row) => row.opCode === job.opCode) === index).map((job) => (
              <option key={job.opCode} value={job.opCode}>{job.label}</option>
            ))}
          </select>
        </div>
        <Input className="max-w-xs" placeholder="Supply name" value={supplyName} onChange={(e) => setSupplyName(e.target.value)} />
        <Button type="button" size="sm" variant="outline" disabled={!supplyName.trim()} onClick={() => {
          void partsEnterpriseApi.saveRelatedSupply(token, { componentOpCode: supplyJob, supplyName: supplyName.trim() })
            .then(() => { setSupplyName(""); load(); })
            .catch((err) => toast.error(err instanceof Error ? err.message : "Could not save"));
        }}>Add supply</Button>
      </div>
      {dialog ? (
        <AddPartDialog
          variantId={variant.id}
          jobOpCode={dialog.job.opCode}
          groupId={dialog.groupId}
          initialParts={dialog.parts?.map((part) => ({
            manufacturer: part.manufacturer ?? "",
            partNumber: part.partNumber ?? "",
            name: part.name ?? dialog.job.label,
            kind: part.kind || "factory",
          }))}
          onClose={() => { setDialog(null); load(); }}
        />
      ) : null}
      {naJob ? (
        <div className="border rounded-lg p-3 space-y-2">
          <p className="text-sm font-medium">{naJob.label} is not on this car</p>
          <div className="space-y-1 text-sm">
            <label className="flex gap-2"><input type="radio" checked={scope === "variant"} onChange={() => setScope("variant")} /> This vehicle only</label>
            <label className="flex gap-2"><input type="radio" checked={scope === "platform"} onChange={() => setScope("platform")} /> This body</label>
            <label className="flex gap-2"><input type="radio" checked={scope === "engine_family"} onChange={() => setScope("engine_family")} /> This engine</label>
          </div>
          <Input placeholder="Why?" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={!reason.trim()} onClick={() => {
              void partsEnterpriseApi.saveApplicability(token, {
                variantId: variant.id,
                componentOpCode: naJob.opCode,
                scope,
                applicable: false,
                reason: reason.trim(),
              }).then(() => { setNaJob(null); load(); }).catch((err) => toast.error(err instanceof Error ? err.message : "Could not save"));
            }}>Save</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setNaJob(null)}>Cancel</Button>
          </div>
        </div>
      ) : null}
      {removeJob?.groupId ? (
        <div className="border rounded-lg p-3 space-y-2">
          <p className="text-sm">Remove {removeJob.label} from {variant.label} only.</p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={deletePart} onChange={(e) => setDeletePart(e.target.checked)} />
            If no vehicles are left, delete the part too
          </label>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={() => {
              void partsEnterpriseApi.removeFromVehicle(token, {
                groupId: removeJob.groupId,
                variantId: variant.id,
                deletePart,
              }).then(() => { setRemoveJob(null); load(); }).catch((err) => toast.error(err instanceof Error ? err.message : "Could not remove"));
            }}>Remove</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setRemoveJob(null)}>Cancel</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
