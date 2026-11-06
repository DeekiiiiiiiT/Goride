import type { MaintenanceServiceCategory } from "../../../types/maintenance";
import type { MaintenanceRule, PartScheduleIndexRow } from "./maintenanceMasterApi";
import { formatInterval, scopeLabel } from "./maintenanceMasterFormat";
import { MmConfidenceLabel, MmSourceChip, MmStatusChip, partIconKey } from "./MmChips";

const LADDER_STEPS: { scope: string; label: string }[] = [
  { scope: "variant", label: "One car version" },
  { scope: "platform", label: "Platform" },
  { scope: "platform_family", label: "Platform family" },
  { scope: "engine_family", label: "Engine" },
  { scope: "global", label: "Everyone" },
];

type Props = {
  category: MaintenanceServiceCategory;
  indexRow: PartScheduleIndexRow | null;
  rules: MaintenanceRule[];
  readOnly?: boolean;
  canWrite: boolean;
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
  onBack,
  onAddForScope,
  onEditRule,
  onRetireRule,
}: Props) {
  const forPart = rules.filter((r) => r.component_id === category.id && r.status !== "retired");

  return (
    <div className="mt-6 space-y-6">
      <button type="button" className="text-sm font-medium text-secondary" onClick={onBack}>
        ← Part schedules
      </button>
      <div className="flex flex-wrap items-start gap-3">
        <span className="material-symbols-outlined text-[28px] text-on-surface-variant">
          {partIconKey(category.icon_key)}
        </span>
        <div>
          <h2 className="font-headline text-headline-md text-on-surface">{category.name}</h2>
          {category.op_code ? (
            <p className="text-sm text-on-surface-variant">{category.op_code}</p>
          ) : null}
        </div>
      </div>

      {readOnly ? (
        <p className="rounded-lg bg-surface-container px-3 py-2 text-sm text-on-surface-variant">
          Edit on a larger screen.
        </p>
      ) : null}

      <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Who gets what</h3>
        <ol className="mt-4 space-y-4 border-l-2 border-secondary/30 pl-4">
          {LADDER_STEPS.map((step) => {
            const match = forPart.find((r) => String(r.template_scope) === step.scope);
            const active = Boolean(match);
            return (
              <li key={step.scope} className="relative">
                <span
                  className={`absolute -left-[1.35rem] top-1 h-3 w-3 rounded-full border-2 ${
                    active ? "border-secondary bg-secondary" : "border-outline-variant bg-surface-container-lowest"
                  }`}
                />
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-on-surface">{step.label}</p>
                    {match ? (
                      <>
                        <p className="font-code mt-1 text-xs text-on-surface">
                          {formatInterval(match.interval_km, match.interval_months)}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <MmSourceChip source={match.source_type} />
                          <MmStatusChip status={match.status} />
                          <MmConfidenceLabel confidence={match.confidence} />
                        </div>
                        <p className="mt-1 text-xs text-on-surface-variant">{scopeLabel(match)}</p>
                      </>
                    ) : (
                      <p className="mt-1 text-xs text-on-surface-variant">No schedule at this level</p>
                    )}
                  </div>
                  {!readOnly && canWrite ? (
                    <div className="flex gap-2">
                      {match ? (
                        <>
                          <button
                            type="button"
                            className="text-xs font-medium text-secondary"
                            onClick={() => onEditRule(match)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="text-xs text-on-surface-variant"
                            onClick={() => onRetireRule(match.id)}
                          >
                            Retire
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="text-xs font-medium text-secondary"
                          onClick={() => onAddForScope(step.scope)}
                        >
                          Add schedule for this part
                        </button>
                      )}
                    </div>
                  ) : null}
                </div>
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
          <p className="mt-2 text-on-surface-variant">
            {(indexRow?.package_names ?? []).join(" · ") || "—"}
          </p>
          {indexRow?.last_changed_at ? (
            <p className="mt-2 text-xs text-on-surface-variant">
              Last changed {String(indexRow.last_changed_at).slice(0, 10)}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
