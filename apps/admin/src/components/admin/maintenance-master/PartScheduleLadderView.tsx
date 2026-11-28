import { useEffect, useMemo, useState } from "react";
import type { MaintenanceServiceCategory } from "../../../types/maintenance";
import type { MaintenanceRule, PartScheduleIndexRow } from "./maintenanceMasterApi";
import { formatInterval } from "./maintenanceMasterFormat";
import { MmConfidenceLabel, MmSourceChip, MmStatusChip, partIconKey } from "./MmChips";
import { listModelFamilies } from "./manuals/manualsApi";

/**
 * Who gets what, most specific first. Rebuild step 4 (MER-02): "One model" is a platform rule on the model
 * family, so one rung holds every model that has its own number; the old "Platform family" rung is gone.
 */
export const LADDER_STEPS: { scope: string; label: string }[] = [
  { scope: "variant", label: "One car version" },
  { scope: "platform", label: "One model" },
  { scope: "engine_family", label: "One engine" },
  { scope: "global", label: "Everyone" },
];

function rungOf(rule: MaintenanceRule): string {
  const s = String(rule.template_scope ?? "global");
  return s === "platform_family" ? "platform" : s;
}

type Props = {
  category: MaintenanceServiceCategory;
  indexRow: PartScheduleIndexRow | null;
  rules: MaintenanceRule[];
  readOnly?: boolean;
  canWrite: boolean;
  token?: string;
  onBack: () => void;
  onAddForScope: (scope: string) => void;
  onEditRule: (rule: MaintenanceRule) => void;
  onRetireRule: (ruleId: string) => void;
};

export function PartScheduleLadderView({
  category,
  indexRow,
  rules,
  readOnly,
  canWrite,
  token,
  onBack,
  onAddForScope,
  onEditRule,
  onRetireRule,
}: Props) {
  const forPart = useMemo(
    () => rules.filter((r) => r.component_id === category.id && r.status !== "retired"),
    [rules, category.id],
  );

  // Plain names for the models that have their own number.
  const [modelNames, setModelNames] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!token) return;
    const ids = [...new Set(forPart.filter((r) => rungOf(r) === "platform" && r.platform_id).map((r) => String(r.platform_id)))];
    const missing = ids.filter((id) => !modelNames[id]);
    if (!missing.length) return;
    let live = true;
    void Promise.all(
      missing.map((id) =>
        listModelFamilies(token, { platformId: id })
          .then((r) => [id, r.items[0]?.name ?? r.items[0]?.label ?? ""] as const)
          .catch(() => [id, ""] as const),
      ),
    ).then((pairs) => {
      if (!live) return;
      setModelNames((prev) => {
        const next = { ...prev };
        for (const [id, name] of pairs) if (name) next[id] = name;
        return next;
      });
    });
    return () => {
      live = false;
    };
  }, [token, forPart, modelNames]);

  const whoLine = (r: MaintenanceRule): string => {
    const rung = rungOf(r);
    if (rung === "platform") return r.platform_id ? modelNames[String(r.platform_id)] ?? "One model" : "One model";
    if (rung === "engine_family") return "One engine";
    if (rung === "variant") return "One car version";
    return "Every car";
  };

  return (
    <div className="mt-6 space-y-6">
      <button
        type="button"
        className="inline-flex h-10 items-center gap-1 rounded-[10px] border border-[#c5c6d0] bg-white px-3 text-[14px] font-medium text-[#30323b] hover:bg-[#f3f4fb]"
        onClick={onBack}
      >
        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        Part schedules
      </button>
      <div className="flex flex-wrap items-start gap-3">
        <span className="material-symbols-outlined text-[28px] text-on-surface-variant">{partIconKey(category.icon_key)}</span>
        <div>
          <h2 className="font-headline text-headline-md text-on-surface">{category.name}</h2>
          {category.op_code ? <p className="text-sm text-on-surface-variant">{category.op_code}</p> : null}
        </div>
      </div>

      {readOnly ? (
        <p className="rounded-lg bg-surface-container px-3 py-2 text-sm text-on-surface-variant">Edit on a larger screen.</p>
      ) : null}

      <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Who gets what</h3>
        <ol className="mt-4 space-y-5 border-l-2 border-secondary/30 pl-4">
          {LADDER_STEPS.map((step) => {
            const matches = forPart.filter((r) => rungOf(r) === step.scope);
            return (
              <li key={step.scope} className="relative" data-testid={`mm-ladder-${step.scope}`}>
                <span
                  className={`absolute -left-[1.35rem] top-1 h-3 w-3 rounded-full border-2 ${
                    matches.length ? "border-secondary bg-secondary" : "border-outline-variant bg-surface-container-lowest"
                  }`}
                />
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-sm font-medium text-on-surface">{step.label}</p>
                  {!readOnly && canWrite && (step.scope !== "global" || !matches.length) ? (
                    <button
                      type="button"
                      className="h-9 rounded-[10px] border border-[#c5c6d0] bg-white px-3 text-[13px] font-medium text-[#30323b] hover:bg-[#f3f4fb]"
                      onClick={() => onAddForScope(step.scope)}
                    >
                      Add schedule for this part
                    </button>
                  ) : null}
                </div>
                {matches.length ? (
                  <ul className="mt-2 space-y-3">
                    {matches.map((match) => {
                      const severe = (match as { severe_same_as_normal?: boolean }).severe_same_as_normal
                        ? "Same as normal (the manual gives one figure)"
                        : match.severe_interval_km != null || match.severe_interval_months != null
                          ? formatInterval(
                              match.severe_interval_km as number | null,
                              match.severe_interval_months as number | null,
                            )
                          : "";
                      const page = (match as { evidence_page?: number | null }).evidence_page;
                      return (
                        <li key={match.id} className="rounded-xl border border-[#e6e7ee] bg-white p-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="text-[14px] font-medium text-[#30323b]">{whoLine(match)}</p>
                              <p className="font-code mt-1 text-xs text-on-surface">
                                {formatInterval(match.interval_km, match.interval_months)}
                              </p>
                              {severe ? (
                                <p className="mt-0.5 text-xs text-on-surface-variant">Harder driving: {severe}</p>
                              ) : null}
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <MmSourceChip source={match.source_type} />
                                <MmStatusChip status={match.status} />
                                <MmConfidenceLabel confidence={match.confidence} />
                                {page ? <span className="text-[12px] text-[#5d5f68]">Owner's manual · page {page}</span> : null}
                              </div>
                            </div>
                            {!readOnly && canWrite ? (
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  className="h-9 rounded-[10px] border border-[#c5c6d0] bg-white px-3 text-[13px] font-medium hover:bg-[#f3f4fb]"
                                  onClick={() => onEditRule(match)}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="h-9 rounded-[10px] border border-[#a83836] bg-white px-3 text-[13px] font-medium text-[#a83836] hover:bg-[#fdecec]"
                                  onClick={() => onRetireRule(match.id)}
                                >
                                  Retire
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs text-on-surface-variant">No schedule at this level</p>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="mm-light-card rounded-2xl border border-outline-variant/30 bg-white p-4 text-sm">
          <p className="font-medium text-on-surface">Used by</p>
          <p className="mt-2 text-on-surface-variant">
            {(indexRow?.package_names ?? []).length
              ? `${indexRow?.package_names.length} service package(s)`
              : "Not in a service package"}
          </p>
        </div>
        <div className="mm-light-card rounded-2xl border border-outline-variant/30 bg-white p-4 text-sm">
          <p className="font-medium text-on-surface">Linked packages</p>
          <p className="mt-2 text-on-surface-variant">{(indexRow?.package_names ?? []).join(" · ") || "—"}</p>
          {indexRow?.last_changed_at ? (
            <p className="mt-2 text-xs text-on-surface-variant">Last changed {String(indexRow.last_changed_at).slice(0, 10)}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
