// Stitch AP13
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { fetchSpecKeys } from "../../partsDatabaseApi";
import {
  decidePartTypeRequest,
  fetchPartTypeRequests,
  fetchSelfServePartTypes,
  upsertPartType,
} from "../addPartsApi";
import type { FitMode } from "../addPartsTypes";
import { groupPartTypesByArea, AddPartsBreadcrumb, fitModeLabel, positionSchemeLabel } from "../addPartsShared";
import { PartsButton } from "../../PartsButton";

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

export function PartTypesSettings({ owner, onClose, fullPage }: { owner: boolean; onClose: () => void; fullPage?: boolean }) {
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
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const selectedType = (types.data ?? []).find((t) => t.id === selectedTypeId) ?? null;
  const [editName, setEditName] = useState("");
  const [editOpCode, setEditOpCode] = useState("");
  const [editFitMode, setEditFitMode] = useState<FitMode>("specific");
  const [editPositionScheme, setEditPositionScheme] = useState("axle");
  const [editHint, setEditHint] = useState("");
  const [editSpecFields, setEditSpecFields] = useState<SpecFieldDraft[]>([]);
  const [requestCreateId, setRequestCreateId] = useState<string | null>(null);
  const [reqCreateName, setReqCreateName] = useState("");
  const [reqCreateOpCode, setReqCreateOpCode] = useState("");
  const [reqCreateFitMode, setReqCreateFitMode] = useState<FitMode>("specific");
  const [reqCreateSpecFields, setReqCreateSpecFields] = useState<SpecFieldDraft[]>([]);

  function loadTypeIntoEditor(t: NonNullable<typeof selectedType>) {
    setEditName(t.name);
    setEditOpCode(t.opCode ?? "");
    setEditFitMode(t.defaultFitMode as FitMode);
    setEditPositionScheme(t.positionScheme ?? "none");
    setEditHint(t.editorHint ?? "");
    setEditSpecFields(
      (t.specFields ?? []).map((f) => ({
        specKey: f.specKey,
        label: f.label ?? "",
        unit: f.unit ?? "",
        dataType: f.dataType ?? "text",
        required: Boolean(f.required),
        example: f.example ?? "",
      })),
    );
  }

  function updateEditSpecField(index: number, patch: Partial<SpecFieldDraft>) {
    setEditSpecFields((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

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

  useEffect(() => {
    const t = (types.data ?? []).find((x) => x.id === selectedTypeId);
    if (t) loadTypeIntoEditor(t);
  }, [selectedTypeId, types.data]);

  const POSITION_SCHEMES = [
    "none",
    "axle",
    "axle_inner_outer",
    "four_corners",
    "driver_passenger_rear",
    "low_high_beam",
    "front_rear_side",
    "before_after_catalyst",
  ] as const;

  return (
    <div className={fullPage ? "parts-database-stitch add-parts-flow w-full max-w-[1520px] mx-auto py-space-lg px-margin" : "fixed inset-0 z-40 flex items-start justify-center bg-black/25 p-6 overflow-y-auto parts-database-stitch add-parts-flow"}>
      <div className={fullPage ? "flex flex-col gap-space-lg" : "w-full max-w-4xl bg-surface-container-lowest rounded-2xl border border-outline-variant/40 shadow-xl p-space-lg my-8"}>
        {fullPage ? (
          <div className="col-span-full flex flex-col gap-space-sm mb-space-md">
            <AddPartsBreadcrumb ap="AP13" />
            <h1 className="font-headline-xl text-headline-xl text-on-surface">Part types</h1>
            <p className="font-body-sm text-on-surface-variant">Owner settings — taxonomy, fit mode, position scheme, and spec fields.</p>
          </div>
        ) : null}
        <div className={fullPage ? "grid lg:grid-cols-[1fr_1.1fr] gap-space-xl" : ""}>
        <div className="flex items-center justify-between mb-space-md col-span-full">
          {!fullPage ? <h2 className="font-headline-lg text-headline-lg text-on-surface">Part types</h2> : null}
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
                  <PartsButton variant="secondary" className="font-mono-sm" onClick={() => setSpecFields((r) => [...r, emptySpecField()])}>
                    + Add field
                  </PartsButton>
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
        <div className={fullPage ? "grid lg:grid-cols-[1fr_1.1fr] gap-space-xl col-span-full" : "grid md:grid-cols-2 gap-space-lg"}>
          <div className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-space-md">
            <h3 className="font-headline-md text-headline-md text-on-surface mb-2">Catalog types</h3>
            <div className="max-h-[520px] overflow-y-auto flex flex-col gap-space-md">
              {groupPartTypesByArea(types.data ?? []).map(({ area, types: areaTypes }) => (
                <div key={area ? String(area.num) : "other"}>
                  <p className="font-label-xs text-label-xs uppercase text-outline font-bold mb-1">
                    {area ? `${area.num}. ${area.label}` : "Other"}
                  </p>
                  <ul className="divide-y divide-outline-variant/20">
                    {areaTypes.map((t) => (
                      <li key={t.id}>
                        <button
                          type="button"
                          className={`w-full py-2 font-body-sm flex flex-wrap items-center gap-2 text-left rounded-lg px-2 ${selectedTypeId === t.id ? "bg-primary-fixed/20 ring-1 ring-primary/30" : "hover:bg-surface-container-low"}`}
                          onClick={() => setSelectedTypeId(t.id)}
                        >
                        <span className="font-mono-sm text-on-surface-variant text-xs">{t.opCode}</span>
                        <span className="font-semibold">{t.name}</span>
                        <span className="font-mono-sm text-[10px] px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant">{fitModeLabel(t.defaultFitMode)}</span>
                        <span className="font-mono-sm text-[10px] text-outline">{positionSchemeLabel(t.positionScheme)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-space-md flex flex-col gap-space-md">
            <h3 className="font-headline-md text-headline-md text-on-surface">Edit part type</h3>
            {selectedType ? (
              <div className="flex flex-col gap-space-md font-body-sm">
                <label className="flex flex-col gap-1 font-label-md">
                  Name
                  <input className="h-10 px-3 rounded-lg border border-outline-variant/50 bg-surface-container-lowest" value={editName} onChange={(e) => setEditName(e.target.value)} />
                </label>
                <label className="flex flex-col gap-1 font-label-md">
                  Op code
                  <input className="h-10 px-3 rounded-lg border border-outline-variant/50 bg-surface-container-lowest font-mono-sm" value={editOpCode} onChange={(e) => setEditOpCode(e.target.value)} />
                </label>
                <label className="flex flex-col gap-1 font-label-md">
                  How it fits
                  <select className="h-10 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant/50" value={editFitMode} onChange={(e) => setEditFitMode(e.target.value as FitMode)}>
                    <option value="specific">Specific cars</option>
                    <option value="engine">By engine</option>
                    <option value="spec">By size or spec</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 font-label-md">
                  Position scheme
                  <select className="h-10 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant/50" value={editPositionScheme} onChange={(e) => setEditPositionScheme(e.target.value)}>
                    {POSITION_SCHEMES.map((s) => (
                      <option key={s} value={s}>{positionSchemeLabel(s)}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 font-label-md">
                  Editor hint
                  <textarea className="min-h-[60px] px-3 py-2 rounded-lg border border-outline-variant/50 bg-surface-container-lowest" value={editHint} onChange={(e) => setEditHint(e.target.value)} />
                </label>
                {editFitMode === "spec" ? (
                  <div className="flex flex-col gap-space-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-label-md font-semibold">Spec fields</span>
                      <PartsButton variant="secondary" className="font-mono-sm" onClick={() => setEditSpecFields((r) => [...r, emptySpecField()])}>
                        + Add field
                      </PartsButton>
                    </div>
                    <div className="rounded-lg bg-surface-container-low overflow-hidden divide-y divide-surface-container-high">
                      {editSpecFields.map((field, idx) => (
                        <div key={idx} className="p-space-md grid grid-cols-1 md:grid-cols-2 gap-space-sm">
                          <label className="flex flex-col gap-1">
                            Spec key
                            <input className="h-9 px-2 rounded-lg bg-surface-container-lowest font-mono-sm" value={field.specKey} onChange={(e) => updateEditSpecField(idx, { specKey: e.target.value })} />
                          </label>
                          <label className="flex flex-col gap-1">
                            Label
                            <input className="h-9 px-2 rounded-lg bg-surface-container-lowest" value={field.label} onChange={(e) => updateEditSpecField(idx, { label: e.target.value })} />
                          </label>
                          <label className="flex flex-col gap-1">
                            Unit
                            <input className="h-9 px-2 rounded-lg bg-surface-container-lowest font-mono-sm" value={field.unit} onChange={(e) => updateEditSpecField(idx, { unit: e.target.value })} />
                          </label>
                          <label className="flex flex-col gap-1">
                            Data type
                            <select className="h-9 px-2 rounded-lg bg-surface-container-lowest" value={field.dataType} onChange={(e) => updateEditSpecField(idx, { dataType: e.target.value })}>
                              <option value="text">text</option>
                              <option value="number">number</option>
                              <option value="enum">enum</option>
                            </select>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                <button
                  type="button"
                  className="h-10 rounded-xl bg-primary-container text-on-primary font-semibold self-start px-6"
                  onClick={() => {
                    const payload: Record<string, unknown> = {
                      name: editName,
                      opCode: editOpCode,
                      defaultFitMode: editFitMode,
                      positionScheme: editPositionScheme,
                      editorHint: editHint,
                      status: "active",
                    };
                    if (editFitMode === "spec" && editSpecFields.some((f) => f.specKey)) {
                      payload.specFields = editSpecFields.filter((f) => f.specKey).map((f, i) => ({
                        specKey: f.specKey,
                        label: f.label || f.specKey,
                        unit: f.unit || null,
                        dataType: f.dataType,
                        required: f.required,
                        example: f.example || null,
                        sortOrder: i + 1,
                      }));
                    }
                    void upsertPartType(payload, selectedType.id).then(() => {
                      toast.success("Part type saved");
                      void types.refetch();
                      void qc.invalidateQueries({ queryKey: ["self-serve-part-types"] });
                    }).catch((e) => toast.error(e instanceof Error ? e.message : "Failed"));
                  }}
                >
                  Save part type
                </button>
              </div>
            ) : (
              <p className="font-body-sm text-on-surface-variant">Select a type from the catalog list to edit fit mode, position, and spec fields.</p>
            )}
            <h3 className="font-headline-md text-headline-md text-on-surface pt-2 border-t border-outline-variant/30">Requests queue</h3>
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
                        setRequestCreateId(String(r.id));
                        setReqCreateName(String(r.name));
                        setReqCreateOpCode(String(r.example_number ?? "NEW-PART").toUpperCase());
                        setReqCreateFitMode("specific");
                        setReqCreateSpecFields([]);
                      }}
                    >
                      Create part type
                    </button>
                    <button
                      type="button"
                      className="text-xs px-2 py-1 rounded-lg border border-outline-variant/60"
                      onClick={() => {
                        void decidePartTypeRequest(String(r.id), { action: "decline", declineReason: "Declined" })
                          .then(() => { toast.success("Declined"); void requests.refetch(); })
                          .catch((e) => toast.error(e instanceof Error ? e.message : "Failed"));
                      }}
                    >
                      Decline
                    </button>
                  </div>
                </li>
              ))}
              {(requests.data?.items?.length ?? 0) === 0 ? (
                <li className="py-4 text-on-surface-variant text-body-sm">No pending requests.</li>
              ) : null}
            </ul>
            {fullPage && requestCreateId ? (
              <div className="border-t border-outline-variant/30 pt-space-md flex flex-col gap-space-md">
                <h4 className="font-label-md font-semibold">Create from request</h4>
                <input className="h-10 px-3 rounded-lg border bg-surface-container-lowest" value={reqCreateName} onChange={(e) => setReqCreateName(e.target.value)} placeholder="Name" />
                <input className="h-10 px-3 rounded-lg border bg-surface-container-lowest font-mono-sm" value={reqCreateOpCode} onChange={(e) => setReqCreateOpCode(e.target.value)} placeholder="Op code" />
                <select className="h-10 px-3 rounded-lg border bg-surface-container-lowest" value={reqCreateFitMode} onChange={(e) => setReqCreateFitMode(e.target.value as FitMode)}>
                  <option value="specific">Specific cars</option>
                  <option value="engine">By engine</option>
                  <option value="spec">By size or spec</option>
                </select>
                {reqCreateFitMode === "spec" ? (
                  <div className="rounded-lg bg-surface-container-low divide-y">
                    {reqCreateSpecFields.map((field, idx) => (
                      <div key={idx} className="p-space-sm grid grid-cols-2 gap-2">
                        <input className="h-9 px-2 rounded bg-surface-container-lowest font-mono-sm" placeholder="spec_key" value={field.specKey} onChange={(e) => setReqCreateSpecFields((rows) => rows.map((r, i) => (i === idx ? { ...r, specKey: e.target.value } : r)))} />
                        <input className="h-9 px-2 rounded bg-surface-container-lowest" placeholder="Label" value={field.label} onChange={(e) => setReqCreateSpecFields((rows) => rows.map((r, i) => (i === idx ? { ...r, label: e.target.value } : r)))} />
                        <input className="h-9 px-2 rounded bg-surface-container-lowest font-mono-sm" placeholder="Unit" value={field.unit} onChange={(e) => setReqCreateSpecFields((rows) => rows.map((r, i) => (i === idx ? { ...r, unit: e.target.value } : r)))} />
                        <select className="h-9 px-2 rounded bg-surface-container-lowest" value={field.dataType} onChange={(e) => setReqCreateSpecFields((rows) => rows.map((r, i) => (i === idx ? { ...r, dataType: e.target.value } : r)))}>
                          <option value="text">text</option>
                          <option value="number">number</option>
                        </select>
                      </div>
                    ))}
                    <PartsButton variant="secondary" className="w-full font-mono-sm justify-start rounded-none border-0 border-t border-outline-variant/30" onClick={() => setReqCreateSpecFields((r) => [...r, emptySpecField()])}>+ Add field</PartsButton>
                  </div>
                ) : null}
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="h-9 px-4 rounded-lg bg-primary-container text-on-primary font-semibold text-sm"
                    onClick={() => {
                      void decidePartTypeRequest(requestCreateId, {
                        action: "create_part_type",
                        newType: {
                          name: reqCreateName,
                          opCode: reqCreateOpCode,
                          areaId: "b1000000-0000-4000-8000-000000000001",
                          defaultFitMode: reqCreateFitMode,
                          positionScheme: reqCreateFitMode === "spec" ? "driver_passenger_rear" : "none",
                          status: "active",
                          specFields: reqCreateFitMode === "spec" ? reqCreateSpecFields.filter((f) => f.specKey) : undefined,
                        },
                      }).then(() => {
                        toast.success("Part type created from request");
                        setRequestCreateId(null);
                        void requests.refetch();
                        void types.refetch();
                      }).catch((e) => toast.error(e instanceof Error ? e.message : "Failed"));
                    }}
                  >
                    Publish from request
                  </button>
                  <button type="button" className="h-9 px-3 rounded-lg border text-sm" onClick={() => setRequestCreateId(null)}>Cancel</button>
                </div>
              </div>
            ) : fullPage ? (
              <div className="border-t border-outline-variant/30 pt-space-md">
                <h4 className="font-label-md font-semibold mb-2">Create from request</h4>
                <p className="font-body-sm text-on-surface-variant">Choose Create part type on a pending row to open the form.</p>
              </div>
            ) : null}
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
