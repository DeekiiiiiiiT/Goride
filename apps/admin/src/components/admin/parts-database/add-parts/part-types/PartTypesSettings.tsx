// Stitch AP13
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { fetchSpecKeys } from "../../partsDatabaseApi";
import {
  decidePartTypeRequest,
  fetchPartTypeRequests,
  fetchSelfServePartTypes,
  upsertPartType,
} from "../addPartsApi";
import type { FitMode } from "../addPartsTypes";

type SpecFieldDraft = {
  specKey: string;
  label: string;
  unit: string;
  dataType: string;
  required: boolean;
  example: string;
};

const emptySpecField = (): SpecFieldDraft => ({
  specKey: "",
  label: "",
  unit: "",
  dataType: "text",
  required: false,
  example: "",
});

export function PartTypesSettings({ owner, onClose }: { owner: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const types = useQuery({ queryKey: ["self-serve-part-types-owner"], queryFn: fetchSelfServePartTypes });
  const requests = useQuery({ queryKey: ["part-type-requests"], queryFn: () => fetchPartTypeRequests("pending"), enabled: owner });
  const specKeys = useQuery({ queryKey: ["spec-keys"], queryFn: fetchSpecKeys, enabled: owner });
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [opCode, setOpCode] = useState("");
  const [areaId, setAreaId] = useState("b1000000-0000-4000-8000-000000000001");
  const [defaultFitMode, setDefaultFitMode] = useState<FitMode>("specific");
  const [specFields, setSpecFields] = useState<SpecFieldDraft[]>([]);

  if (!owner) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/25 p-6 parts-database-stitch">
        <div className="bg-surface-container-lowest rounded-2xl p-6 max-w-md">
          <p className="font-body-md text-body-md">Part type settings are owner-only.</p>
          <button type="button" className="mt-4 h-10 px-4 rounded-xl border" onClick={onClose}>Close</button>
        </div>
      </div>
    );
  }

  function updateSpecField(index: number, patch: Partial<SpecFieldDraft>) {
    setSpecFields((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/25 p-6 overflow-y-auto parts-database-stitch">
      <div className="w-full max-w-4xl bg-surface-container-lowest rounded-2xl border border-outline-variant/40 shadow-xl p-space-lg my-8">
        <div className="flex items-center justify-between mb-space-md">
          <h2 className="font-headline-lg text-headline-lg text-on-surface">Part types</h2>
          <div className="flex gap-2">
            <button
              type="button"
              className="px-3 h-9 rounded-lg bg-primary-container text-on-primary font-semibold"
              onClick={() => {
                setFormOpen(true);
                setSpecFields(defaultFitMode === "spec" ? [emptySpecField()] : []);
              }}
            >
              Create part type
            </button>
            <button type="button" className="px-3 h-9 rounded-lg border border-outline-variant/60" onClick={onClose}>Close</button>
          </div>
        </div>
        {formOpen ? (
          <div className="mb-space-md p-space-md rounded-xl border border-outline-variant/40 flex flex-col gap-space-md bg-surface-container-low/40">
            <input className="h-10 px-3 rounded-lg border border-outline-variant/50 bg-surface-container-lowest" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <input className="h-10 px-3 rounded-lg border border-outline-variant/50 bg-surface-container-lowest font-mono-sm" placeholder="Op code e.g. BRK-PADS" value={opCode} onChange={(e) => setOpCode(e.target.value)} />
            <label className="flex flex-col gap-1 font-label-md">
              How it usually fits
              <select
                className="h-10 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant/50"
                value={defaultFitMode}
                onChange={(e) => {
                  const mode = e.target.value as FitMode;
                  setDefaultFitMode(mode);
                  if (mode === "spec" && specFields.length === 0) setSpecFields([emptySpecField()]);
                  if (mode !== "spec") setSpecFields([]);
                }}
              >
                <option value="specific">Specific cars</option>
                <option value="engine">By engine</option>
                <option value="spec">By size or spec</option>
              </select>
            </label>
            {defaultFitMode === "spec" ? (
              <div className="flex flex-col gap-space-sm">
                <div className="flex items-center justify-between">
                  <span className="font-label-md text-label-md font-semibold text-on-surface">Size or spec fields</span>
                  <button type="button" className="text-primary font-mono-sm font-semibold hover:underline" onClick={() => setSpecFields((r) => [...r, emptySpecField()])}>
                    + Add field
                  </button>
                </div>
                <div className="rounded-lg bg-surface-container-low overflow-hidden divide-y divide-surface-container-high">
                  {specFields.map((field, idx) => (
                    <div key={idx} className="p-space-md grid grid-cols-1 md:grid-cols-2 gap-space-sm">
                      <label className="flex flex-col gap-1 font-body-sm">
                        Spec key
                        <select
                          className="h-9 px-2 rounded-lg bg-surface-container-lowest text-body-sm"
                          value={field.specKey}
                          onChange={(e) => {
                            const specKey = e.target.value;
                            const meta = specKeys.data?.items.find((k) => k.key === specKey);
                            updateSpecField(idx, {
                              specKey,
                              label: field.label || meta?.label || specKey,
                              unit: field.unit || meta?.unit || "",
                            });
                          }}
                        >
                          <option value="">Choose spec key…</option>
                          {(specKeys.data?.items ?? []).map((k) => (
                            <option key={k.key} value={k.key}>{k.key} — {k.label}</option>
                          ))}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1 font-body-sm">
                        Label
                        <input className="h-9 px-2 rounded-lg bg-surface-container-lowest" value={field.label} onChange={(e) => updateSpecField(idx, { label: e.target.value })} />
                      </label>
                      <label className="flex flex-col gap-1 font-body-sm">
                        Unit
                        <input className="h-9 px-2 rounded-lg bg-surface-container-lowest font-mono-sm" value={field.unit} onChange={(e) => updateSpecField(idx, { unit: e.target.value })} placeholder="mm, W, code…" />
                      </label>
                      <label className="flex flex-col gap-1 font-body-sm">
                        Data type
                        <select className="h-9 px-2 rounded-lg bg-surface-container-lowest" value={field.dataType} onChange={(e) => updateSpecField(idx, { dataType: e.target.value })}>
                          <option value="text">text</option>
                          <option value="number">number</option>
                          <option value="enum">enum</option>
                        </select>
                      </label>
                      <label className="flex flex-col gap-1 font-body-sm md:col-span-2">
                        Example
                        <input className="h-9 px-2 rounded-lg bg-surface-container-lowest font-mono-sm" value={field.example} onChange={(e) => updateSpecField(idx, { example: e.target.value })} placeholder="H16, 525 mm…" />
                      </label>
                      <label className="flex items-center gap-2 font-body-sm md:col-span-2">
                        <input type="checkbox" checked={field.required} onChange={(e) => updateSpecField(idx, { required: e.target.checked })} />
                        Required for catalog editors
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <button
              type="button"
              className="h-10 rounded-xl bg-primary-container text-on-primary font-semibold"
              onClick={() => {
                const payload: Record<string, unknown> = {
                  name,
                  opCode,
                  areaId,
                  defaultFitMode,
                  positionScheme: defaultFitMode === "spec" ? "none" : "axle",
                  status: "active",
                };
                if (defaultFitMode === "spec" && specFields.some((f) => f.specKey)) {
                  payload.specFields = specFields
                    .filter((f) => f.specKey)
                    .map((f, i) => ({
                      specKey: f.specKey,
                      label: f.label || f.specKey,
                      unit: f.unit || null,
                      dataType: f.dataType,
                      required: f.required,
                      example: f.example || null,
                      sortOrder: i + 1,
                    }));
                }
                void upsertPartType(payload).then(() => {
                  toast.success("Part type created");
                  setFormOpen(false);
                  setName("");
                  setOpCode("");
                  setSpecFields([]);
                  void types.refetch();
                  void qc.invalidateQueries({ queryKey: ["self-serve-part-types"] });
                }).catch((e) => toast.error(e instanceof Error ? e.message : "Failed"));
              }}
            >
              Publish
            </button>
          </div>
        ) : null}
        {(requests.data?.items?.length ?? 0) > 0 ? (
          <div className="mb-space-md px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 font-body-sm">
            {requests.data!.items.length} request(s) to add a part type — review below.
          </div>
        ) : null}
        <div className="grid md:grid-cols-2 gap-space-lg">
          <div>
            <h3 className="font-headline-md text-headline-md text-on-surface mb-2">Active types</h3>
            <ul className="divide-y divide-outline-variant/30 max-h-96 overflow-y-auto">
              {(types.data ?? []).map((t) => (
                <li key={t.id} className="py-2 font-body-sm">
                  <span className="font-mono-sm text-on-surface-variant text-xs mr-2">{t.opCode}</span>
                  {t.name}
                  <span className="block text-on-surface-variant text-xs">{t.editorHint}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-headline-md text-headline-md text-on-surface mb-2">Pending requests</h3>
            <ul className="divide-y divide-outline-variant/30 max-h-96 overflow-y-auto">
              {(requests.data?.items ?? []).map((r) => (
                <li key={String(r.id)} className="py-2 font-body-sm flex flex-col gap-2">
                  <span className="font-semibold">{String(r.name)}</span>
                  <span className="block text-on-surface-variant">{String(r.reason)}</span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="text-xs px-2 py-1 rounded-lg bg-primary-container text-on-primary"
                      onClick={() => {
                        void decidePartTypeRequest(String(r.id), {
                          action: "create_part_type",
                          newType: {
                            name: String(r.name),
                            opCode: String(r.example_number ?? "NEW-PART").toUpperCase(),
                            areaId: "b1000000-0000-4000-8000-000000000001",
                            defaultFitMode: "specific",
                            positionScheme: "none",
                            status: "active",
                          },
                        }).then(() => {
                          toast.success("Part type created from request");
                          void requests.refetch();
                          void types.refetch();
                        }).catch((e) => toast.error(e instanceof Error ? e.message : "Failed"));
                      }}
                    >
                      Create part type
                    </button>
                    <button
                      type="button"
                      className="text-xs px-2 py-1 rounded-lg border"
                      onClick={() => {
                        void decidePartTypeRequest(String(r.id), { action: "decline", declineReason: "Declined" })
                          .then(() => { toast.success("Declined"); void requests.refetch(); })
                          .catch((e) => toast.error(e instanceof Error ? e.message : "Failed"));
                      }}
                    >
                      Decline
                    </button>
                    <button
                      type="button"
                      className="text-xs px-2 py-1 rounded-lg border"
                      onClick={() => {
                        void decidePartTypeRequest(String(r.id), { action: "reject", declineReason: "Rejected" })
                          .then(() => { toast.success("Rejected"); void requests.refetch(); })
                          .catch((e) => toast.error(e instanceof Error ? e.message : "Failed"));
                      }}
                    >
                      Reject
                    </button>
                  </div>
                </li>
              ))}
              {(requests.data?.items?.length ?? 0) === 0 ? (
                <li className="py-4 text-on-surface-variant text-body-sm">No pending requests.</li>
              ) : null}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
