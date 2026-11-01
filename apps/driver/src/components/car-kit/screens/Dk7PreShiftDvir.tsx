import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../../services/api";
import { Button } from "../../ui/button";
import { toast } from "sonner";

type TemplateItem = {
  id?: string;
  label?: string;
  safetyCritical?: boolean;
  safety_critical?: boolean;
};

type ItemState = {
  status: "pass" | "attention" | "fail";
  notes: string;
  photoUrl: string;
  photoUploading: boolean;
};

/** Driver pre-shift DVIR — checklist per template item. */
export function Dk7PreShiftDvir({ vehicleId, onDone }: { vehicleId: string; onDone?: () => void }) {
  const [odometer, setOdometer] = useState("");
  const [templateItems, setTemplateItems] = useState<TemplateItem[]>([]);
  const [itemState, setItemState] = useState<Record<string, ItemState>>({});
  const [loadingTpl, setLoadingTpl] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoadingTpl(true);
      try {
        const templates = await api.listInspectionTemplates();
        const first = templates.items?.[0] as { items?: TemplateItem[] } | undefined;
        const items = first?.items ?? [];
        if (!cancelled) {
          setTemplateItems(items);
          const init: Record<string, ItemState> = {};
          for (const it of items) {
            const id = String(it.id ?? it.label ?? "");
            if (!id) continue;
            init[id] = { status: "pass", notes: "", photoUrl: "", photoUploading: false };
          }
          setItemState(init);
        }
      } catch {
        if (!cancelled) toast.error("Could not load inspection checklist");
      } finally {
        if (!cancelled) setLoadingTpl(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setStatus = useCallback((itemKey: string, status: ItemState["status"]) => {
    setItemState((prev) => ({
      ...prev,
      [itemKey]: { ...prev[itemKey], status },
    }));
  }, []);

  const uploadPhoto = useCallback(async (itemKey: string, file: File) => {
    setItemState((prev) => ({
      ...prev,
      [itemKey]: { ...prev[itemKey], photoUploading: true },
    }));
    try {
      const res = await api.uploadFile(file);
      const url = typeof res === "string" ? res : (res as { url?: string }).url;
      if (!url) throw new Error("Upload failed");
      setItemState((prev) => ({
        ...prev,
        [itemKey]: { ...prev[itemKey], photoUrl: url, photoUploading: false },
      }));
    } catch (e) {
      setItemState((prev) => ({
        ...prev,
        [itemKey]: { ...prev[itemKey], photoUploading: false },
      }));
      toast.error(e instanceof Error ? e.message : "Photo upload failed");
    }
  }, []);

  const findingsPayload = useMemo(() => {
    return templateItems.map((it) => {
      const key = String(it.id ?? it.label ?? "");
      const st = itemState[key];
      return {
        itemId: it.id,
        label: it.label,
        status: st?.status ?? "pass",
        notes: st?.notes || undefined,
        photoUrl: st?.photoUrl || undefined,
        safetyCritical: it.safetyCritical === true || it.safety_critical === true,
      };
    });
  }, [itemState, templateItems]);

  const submit = async () => {
    const odo = Number(odometer);
    if (!Number.isFinite(odo) || odo <= 0) {
      toast.error("Enter odometer");
      return;
    }
    for (const row of findingsPayload) {
      if (row.status === "fail" && !row.photoUrl) {
        toast.error(`Photo required for failed item: ${row.label ?? "item"}`);
        return;
      }
    }
    setBusy(true);
    try {
      await api.saveInspectionFindings({
        vehicleId,
        odometer: odo,
        date: new Date().toISOString().slice(0, 10),
        findings: findingsPayload.map((f) => ({
          itemId: f.itemId,
          vehicleId,
          status: f.status,
          notes: f.notes,
          photoUrl: f.photoUrl,
          safetyCritical: f.safetyCritical,
        })),
      });
      const anySafetyFail = findingsPayload.some(
        (f) => f.status === "fail" && f.safetyCritical,
      );
      toast.success(
        anySafetyFail
          ? "DVIR submitted — do not drive until cleared"
          : "DVIR submitted — cleared to drive",
      );
      onDone?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not submit DVIR");
    } finally {
      setBusy(false);
    }
  };

  if (loadingTpl) {
    return <div className="driver-car-kit-stitch p-4 text-sm text-slate-600">Loading checklist…</div>;
  }

  if (!templateItems.length) {
    return (
      <div className="driver-car-kit-stitch space-y-4 p-4">
        <p className="text-sm text-slate-600">No inspection template configured for your fleet.</p>
      </div>
    );
  }

  return (
    <div className="driver-car-kit-stitch space-y-4 p-4">
      <h2 className="text-lg font-bold text-slate-900">Pre-shift inspection (DVIR)</h2>
      <label className="block text-sm">
        Odometer (km)
        <input
          type="number"
          className="mt-1 w-full rounded-lg border px-3 py-2"
          value={odometer}
          onChange={(e) => setOdometer(e.target.value)}
        />
      </label>

      <div className="space-y-3">
        {templateItems.map((it) => {
          const key = String(it.id ?? it.label ?? "");
          const st = itemState[key];
          const critical = it.safetyCritical === true || it.safety_critical === true;
          return (
            <div key={key} className="rounded-xl border bg-white p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium text-slate-900">{it.label ?? "Item"}</span>
                {critical ? (
                  <span className="text-[10px] uppercase font-semibold text-error">Safety</span>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {(["pass", "attention", "fail"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`min-h-[44px] px-3 rounded-lg text-xs font-semibold border ${
                      st?.status === s ? "bg-primary text-on-primary border-primary" : "bg-surface-container-low"
                    }`}
                    onClick={() => setStatus(key, s)}
                  >
                    {s === "pass" ? "Pass" : s === "attention" ? "Attention" : "Fail"}
                  </button>
                ))}
              </div>
              {st?.status === "fail" ? (
                <label className="block text-xs">
                  Photo (required)
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="mt-1 w-full text-sm"
                    disabled={st.photoUploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void uploadPhoto(key, file);
                    }}
                  />
                  {st.photoUrl ? <span className="text-green-700">Photo attached</span> : null}
                </label>
              ) : null}
              <textarea
                className="w-full rounded-lg border px-2 py-1 text-sm"
                rows={2}
                placeholder="Notes (optional)"
                value={st?.notes ?? ""}
                onChange={(e) =>
                  setItemState((prev) => ({
                    ...prev,
                    [key]: { ...prev[key], notes: e.target.value },
                  }))
                }
              />
            </div>
          );
        })}
      </div>

      <Button type="button" disabled={busy} className="w-full min-h-[48px]" onClick={() => void submit()}>
        Submit DVIR
      </Button>
    </div>
  );
};
