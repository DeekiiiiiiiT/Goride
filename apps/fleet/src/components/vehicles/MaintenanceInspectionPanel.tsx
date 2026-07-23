import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, AlertTriangle, XCircle, Ban } from "lucide-react";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { toast } from "sonner@2.0.3";
import { api } from "../../services/api";
import type {
  MaintenanceInspectionItem,
  MaintenanceInspectionStatus,
  MaintenanceInspectionTemplate,
  MaintenanceLineAction,
  MaintenanceLogLine,
  MaintenanceServiceCategory,
} from "../../types/maintenance";

export type InspectionFindingDraft = {
  itemId: string;
  templateId: string;
  systemId?: string | null;
  componentId?: string | null;
  label: string;
  status: MaintenanceInspectionStatus | null;
  notes: string;
  declined: boolean;
};

type Props = {
  vehicleId: string;
  lines: MaintenanceLogLine[];
  onLinesChange: (lines: MaintenanceLogLine[]) => void;
  /** Optional catalog lookup for component field schemas / names. */
  catalogById?: Map<string, MaintenanceServiceCategory>;
  onContinue?: () => void;
  onSkip?: () => void;
};

function findingKey(itemId: string) {
  return `insp-${itemId}`;
}

function recommendedLineFromItem(
  item: MaintenanceInspectionItem,
  template: MaintenanceInspectionTemplate,
  catalogById?: Map<string, MaintenanceServiceCategory>,
): MaintenanceLogLine {
  const component = item.component_id ? catalogById?.get(item.component_id) : undefined;
  const action = (item.default_action || "replace") as MaintenanceLineAction;
  const safeAction: MaintenanceLineAction =
    action === "inspect" ? "replace" : action;
  return {
    categoryId: item.component_id || undefined,
    categoryCode: component?.code || `insp_${item.id}`,
    categoryName: component?.name || item.label,
    systemId: template.system_id || undefined,
    systemCode: undefined,
    systemName: template.name.replace(/\s+inspection$/i, "").trim() || template.name,
    action: safeAction,
    recommended: true,
    declined: false,
    notes: `Recommended from inspection: ${item.label}`,
    values: {},
  };
}

export function MaintenanceInspectionPanel({
  vehicleId,
  lines,
  onLinesChange,
  catalogById,
  onContinue,
  onSkip,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<MaintenanceInspectionTemplate[]>([]);
  const [findings, setFindings] = useState<Record<string, InspectionFindingDraft>>({});
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listInspectionTemplates()
      .then((res) => {
        if (cancelled) return;
        const items = res.items || [];
        setTemplates(items);
        setActiveTemplateId(items[0]?.id ?? null);
        const next: Record<string, InspectionFindingDraft> = {};
        for (const tpl of items) {
          for (const item of tpl.items || []) {
            next[item.id] = {
              itemId: item.id,
              templateId: tpl.id,
              systemId: tpl.system_id,
              componentId: item.component_id,
              label: item.label,
              status: null,
              notes: "",
              declined: false,
            };
          }
        }
        setFindings(next);
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) {
          setTemplates([]);
          toast.error("Could not load inspection templates");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [vehicleId]);

  const activeTemplate = useMemo(
    () => templates.find((t) => t.id === activeTemplateId) || null,
    [templates, activeTemplateId],
  );

  const scoredCount = useMemo(
    () => Object.values(findings).filter((f) => f.status != null).length,
    [findings],
  );
  const totalItems = useMemo(
    () => Object.keys(findings).length,
    [findings],
  );

  const upsertRecommendedLine = (
    item: MaintenanceInspectionItem,
    template: MaintenanceInspectionTemplate,
    declined: boolean,
  ) => {
    const key = findingKey(item.id);
    const base = recommendedLineFromItem(item, template, catalogById);
    onLinesChange([
      ...lines.filter(
        (l) =>
          !(
            l.recommended &&
            ((l.categoryId && l.categoryId === item.component_id) ||
              l.notes?.includes(item.label) ||
              l.categoryCode === `insp_${item.id}`)
          ),
      ),
      declined
        ? { ...base, declined: true, recommended: true, categoryCode: key }
        : { ...base, categoryCode: base.categoryCode || key },
    ]);
  };

  const removeRecommendedLine = (item: MaintenanceInspectionItem) => {
    onLinesChange(
      lines.filter(
        (l) =>
          !(
            l.recommended &&
            ((l.categoryId && l.categoryId === item.component_id) ||
              l.notes?.includes(item.label) ||
              l.categoryCode === `insp_${item.id}` ||
              l.categoryCode === findingKey(item.id))
          ),
      ),
    );
  };

  const setItemStatus = (
    item: MaintenanceInspectionItem,
    template: MaintenanceInspectionTemplate,
    status: MaintenanceInspectionStatus,
  ) => {
    setFindings((prev) => ({
      ...prev,
      [item.id]: {
        ...(prev[item.id] || {
          itemId: item.id,
          templateId: template.id,
          systemId: template.system_id,
          componentId: item.component_id,
          label: item.label,
          notes: "",
          declined: false,
        }),
        status,
        declined: false,
      },
    }));
    if (status === "pass") {
      removeRecommendedLine(item);
    } else {
      upsertRecommendedLine(item, template, false);
    }
  };

  const declineItem = (
    item: MaintenanceInspectionItem,
    template: MaintenanceInspectionTemplate,
  ) => {
    setFindings((prev) => ({
      ...prev,
      [item.id]: {
        ...(prev[item.id] || {
          itemId: item.id,
          templateId: template.id,
          systemId: template.system_id,
          componentId: item.component_id,
          label: item.label,
          notes: "",
          status: prev[item.id]?.status || "attention",
        }),
        declined: true,
        status: prev[item.id]?.status || "attention",
      },
    }));
    upsertRecommendedLine(item, template, true);
  };

  const statusBtnClass = (active: boolean, tone: "pass" | "attention" | "fail") => {
    const base =
      "flex-1 min-h-11 rounded-lg border text-xs font-semibold transition-colors px-2 py-2";
    if (!active) return `${base} border-slate-200 bg-white text-slate-600 hover:bg-slate-50`;
    if (tone === "pass") return `${base} border-emerald-300 bg-emerald-50 text-emerald-800`;
    if (tone === "attention") return `${base} border-amber-300 bg-amber-50 text-amber-900`;
    return `${base} border-rose-300 bg-rose-50 text-rose-800`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading inspection…
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="space-y-4 py-6 text-center">
        <p className="text-sm text-slate-500">No inspection templates available.</p>
        {(onContinue || onSkip) && (
          <Button
            type="button"
            className="bg-slate-900 text-white hover:bg-slate-800"
            onClick={() => (onContinue || onSkip)?.()}
          >
            Continue
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-slate-500">
          Scored {scoredCount} of {totalItems} items
        </p>
        {onSkip && (
          <Button type="button" variant="ghost" size="sm" onClick={onSkip}>
            Skip inspection
          </Button>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {templates.map((tpl) => {
          const active = tpl.id === activeTemplateId;
          const itemIds = (tpl.items || []).map((i) => i.id);
          const done = itemIds.filter((id) => findings[id]?.status != null).length;
          return (
            <button
              key={tpl.id}
              type="button"
              onClick={() => setActiveTemplateId(tpl.id)}
              className={`shrink-0 rounded-lg border px-3 py-2 text-left min-h-11 ${
                active
                  ? "border-indigo-300 bg-indigo-50/60"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              <span className="block text-sm font-medium text-slate-900">{tpl.name}</span>
              <span className="block text-[11px] text-slate-500">
                {done}/{itemIds.length}
              </span>
            </button>
          );
        })}
      </div>

      {activeTemplate && (
        <div className="space-y-3">
          {(activeTemplate.items || []).length === 0 ? (
            <p className="text-sm text-slate-500 py-4">No items in this template.</p>
          ) : (
            (activeTemplate.items || []).map((item) => {
              const draft = findings[item.id];
              const status = draft?.status ?? null;
              const declined = draft?.declined ?? false;
              return (
                <div
                  key={item.id}
                  className="rounded-xl border border-slate-200 bg-white p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                      {declined && (
                        <p className="text-xs text-slate-500 mt-0.5">Declined — not adding work</p>
                      )}
                    </div>
                    {status === "pass" && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                    {status === "attention" && !declined && (
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    )}
                    {status === "fail" && !declined && (
                      <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    )}
                    {declined && <Ban className="w-4 h-4 text-slate-400 shrink-0" />}
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      className={statusBtnClass(status === "pass", "pass")}
                      onClick={() => setItemStatus(item, activeTemplate, "pass")}
                    >
                      Pass
                    </button>
                    <button
                      type="button"
                      className={statusBtnClass(status === "attention" && !declined, "attention")}
                      onClick={() => setItemStatus(item, activeTemplate, "attention")}
                    >
                      Attention
                    </button>
                    <button
                      type="button"
                      className={statusBtnClass(status === "fail" && !declined, "fail")}
                      onClick={() => setItemStatus(item, activeTemplate, "fail")}
                    >
                      Fail
                    </button>
                  </div>

                  {(status === "attention" || status === "fail") && (
                    <div className="space-y-2 pt-1">
                      <div className="flex flex-wrap gap-2">
                        {!declined ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="min-h-11"
                            onClick={() => declineItem(item, activeTemplate)}
                          >
                            Decline recommended work
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="min-h-11"
                            onClick={() => setItemStatus(item, activeTemplate, status)}
                          >
                            Undo decline
                          </Button>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`insp-notes-${item.id}`}>Notes</Label>
                        <Textarea
                          id={`insp-notes-${item.id}`}
                          className="bg-slate-50 border-slate-200 min-h-[64px]"
                          value={draft?.notes || ""}
                          onChange={(e) =>
                            setFindings((prev) => ({
                              ...prev,
                              [item.id]: {
                                ...(prev[item.id] as InspectionFindingDraft),
                                notes: e.target.value,
                              },
                            }))
                          }
                          placeholder="What needs attention…"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {onContinue && (
        <div className="pt-2">
          <Button
            type="button"
            className="w-full sm:w-auto bg-slate-900 text-white hover:bg-slate-800 min-h-11"
            onClick={onContinue}
          >
            Continue to review
          </Button>
        </div>
      )}
    </div>
  );
}

/** Build API findings payload from panel draft map (exported for dialog save). */
export function findingsPayloadFromDrafts(
  findings: Record<string, InspectionFindingDraft>,
): Array<{
  itemId: string;
  systemId?: string | null;
  componentId?: string | null;
  status: MaintenanceInspectionStatus;
  notes?: string | null;
  declined?: boolean;
}> {
  return Object.values(findings)
    .filter((f): f is InspectionFindingDraft & { status: MaintenanceInspectionStatus } =>
      f.status != null,
    )
    .map((f) => ({
      itemId: f.itemId,
      systemId: f.systemId,
      componentId: f.componentId,
      status: f.status,
      notes: f.notes || null,
      declined: f.declined,
    }));
}
