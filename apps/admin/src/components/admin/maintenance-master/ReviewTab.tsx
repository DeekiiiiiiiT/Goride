import { useState } from "react";
import type { MaintenanceRule } from "./maintenanceMasterApi";
import { formatInterval, sourceLabel } from "./maintenanceMasterFormat";
import { NIGHTLY_COPY } from "./maintenanceMasterFormat";

type Props = {
  conflicts: Record<string, unknown>[];
  proposals: Record<string, unknown>[];
  rules: MaintenanceRule[];
  canWrite: boolean;
  onKeep: (conflictId: string, ruleId: string) => void;
  onRetireBoth: (conflictId: string) => void;
};

export function ReviewTab({ conflicts, proposals, rules, canWrite, onKeep, onRetireBoth }: Props) {
  const [inner, setInner] = useState<"conflicts" | "proposals">(
    conflicts.length ? "conflicts" : "proposals",
  );

  return (
    <div className="mt-6 space-y-4">
      <p className="text-sm text-on-surface-variant">Not blocking: the active schedule keeps working</p>
      <div className="flex gap-4 border-b border-outline-variant/30">
        <button
          type="button"
          className={`pb-2 text-sm font-medium ${inner === "conflicts" ? "border-b-2 border-secondary text-secondary" : "text-on-surface-variant"}`}
          onClick={() => setInner("conflicts")}
        >
          Two schedules for the same cars
          {conflicts.length ? (
            <span className="ml-1 rounded-full bg-amber-100 px-1.5 text-[10px] text-amber-900">{conflicts.length}</span>
          ) : null}
        </button>
        <button
          type="button"
          className={`pb-2 text-sm font-medium ${inner === "proposals" ? "border-b-2 border-secondary text-secondary" : "text-on-surface-variant"}`}
          onClick={() => setInner("proposals")}
        >
          Waiting for owner approval
          {proposals.length ? (
            <span className="ml-1 rounded-full bg-amber-100 px-1.5 text-[10px] text-amber-900">{proposals.length}</span>
          ) : null}
        </button>
      </div>

      {inner === "conflicts" ? (
        conflicts.length ? (
          conflicts.map((c) => {
            const id = String(c.id ?? "");
            const ruleA = rules.find((r) => r.id === String(c.rule_id_a ?? ""));
            const ruleB = rules.find((r) => r.id === String(c.rule_id_b ?? ""));
            return (
              <article key={id} className="rounded-2xl border border-outline-variant/30 bg-white p-4">
                <p className="text-sm font-medium">Two schedules for the same cars</p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <ConflictCol title="Schedule A" rule={ruleA} />
                  <ConflictCol title="Schedule B" rule={ruleB} />
                </div>
                {canWrite ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {ruleA ? (
                      <button
                        type="button"
                        className="rounded-lg border border-outline-variant/50 px-3 py-1.5 text-xs"
                        onClick={() => onKeep(id, ruleA.id)}
                      >
                        Keep A
                      </button>
                    ) : null}
                    {ruleB ? (
                      <button
                        type="button"
                        className="rounded-lg border border-outline-variant/50 px-3 py-1.5 text-xs"
                        onClick={() => onKeep(id, ruleB.id)}
                      >
                        Keep B
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium text-on-secondary"
                      onClick={() => onRetireBoth(id)}
                    >
                      Retire both
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })
        ) : (
          <p className="text-sm text-on-surface-variant">Nothing waiting in this tab.</p>
        )
      ) : proposals.length ? (
        proposals.map((p) => {
          const payload = (p.payload ?? {}) as Record<string, unknown>;
          return (
            <article key={String(p.id)} className="rounded-2xl border border-outline-variant/30 bg-white p-4 text-sm">
              <p className="font-medium">Change waiting for approval</p>
              <p className="mt-1 text-on-surface-variant">Requested by {String(p.requested_by ?? "Support")}</p>
              <p className="mt-2 font-code text-xs">
                {formatInterval(payload.interval_km as number, payload.interval_months as number)}
              </p>
              {canWrite ? (
                <div className="mt-4 flex gap-2">
                  <button type="button" className="rounded-lg border px-3 py-1.5 text-xs">
                    Reject
                  </button>
                  <button type="button" className="rounded-lg bg-secondary px-3 py-1.5 text-xs text-on-secondary">
                    Approve
                  </button>
                </div>
              ) : null}
            </article>
          );
        })
      ) : (
        <p className="text-sm text-on-surface-variant">Nothing waiting for approval.</p>
      )}

      {!conflicts.length && !proposals.length ? (
        <p className="text-sm text-on-surface-variant">Nothing waiting for review.</p>
      ) : null}
    </div>
  );
}

function ConflictCol({ title, rule }: { title: string; rule?: MaintenanceRule }) {
  if (!rule) return <div className="mm-conflict-col rounded-lg bg-surface-container-low p-3 text-xs">{title}: —</div>;
  return (
    <div className="mm-conflict-col rounded-lg bg-surface-container-low p-3 text-xs">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 font-code">{formatInterval(rule.interval_km, rule.interval_months)}</p>
      <p className="mt-1">{sourceLabel(rule.source_type)}</p>
      <p className="mt-2 text-on-surface-variant">Cars update {NIGHTLY_COPY} if you pick the other.</p>
    </div>
  );
}
