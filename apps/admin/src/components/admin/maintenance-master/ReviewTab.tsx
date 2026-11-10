/** Review list — look: S43f. Decisions on Dominion's own schedule rules only (no Fleet data). */
import { useState } from "react";
import type { MaintenanceRule } from "./maintenanceMasterApi";
import { formatInterval } from "./maintenanceMasterFormat";
import { MmScopeChip, MmSourceChip } from "./MmChips";
import { DangerButton, OutlineButton, PrimaryButton } from "./jobs/jobsUi";

type Props = {
  conflicts: Record<string, unknown>[];
  proposals: Record<string, unknown>[];
  rules: MaintenanceRule[];
  canWrite: boolean;
  onKeep: (conflictId: string, ruleId: string) => void;
  onRetireBoth: (conflictId: string) => void;
  onApprove: (proposalId: string) => Promise<void>;
  onReject: (proposalId: string, note: string) => Promise<void>;
};

const fmtDate = (v: unknown) => {
  const d = new Date(String(v ?? ""));
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
};

export function ReviewTab({ conflicts, proposals, rules, canWrite, onKeep, onRetireBoth, onApprove, onReject }: Props) {
  const [inner, setInner] = useState<"conflicts" | "proposals">(conflicts.length || !proposals.length ? "conflicts" : "proposals");
  const total = conflicts.length + proposals.length;

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-outline-variant/30 bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#dbe1ff] text-[#0153dc]">
            <span className="material-symbols-outlined">rule</span>
          </span>
          <div>
            <p className="font-semibold text-on-surface">Things that need your decision</p>
            <p className="text-sm text-on-surface-variant">Nothing here blocks the live schedules.</p>
          </div>
        </div>
        {total ? (
          <div className="inline-flex rounded-lg border border-outline-variant/50 bg-[#f4f3fa] p-0.5" role="group">
            {(
              [
                ["conflicts", "Two schedules for the same cars", conflicts.length],
                ["proposals", "Waiting for owner approval", proposals.length],
              ] as const
            ).map(([id, label, n]) => (
              <button
                key={id}
                type="button"
                aria-pressed={inner === id}
                onClick={() => setInner(id)}
                className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium ${
                  inner === id ? "bg-white text-[#0153dc] shadow-sm" : "text-on-surface-variant"
                }`}
              >
                {label}
                <span className="rounded-full bg-[#eeedf6] px-1.5 font-code text-[11px] text-[#5d5f68]">{n}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {total === 0 ? (
        <div className="rounded-2xl border border-outline-variant/30 bg-white p-10 text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#dcfce7] text-[#166534]">
            <span className="material-symbols-outlined text-[36px]">check_circle</span>
          </span>
          <p className="mt-4 text-xl font-semibold text-on-surface">All clear</p>
          <p className="mt-1 text-sm text-on-surface-variant">Nothing waiting for review or approval.</p>
        </div>
      ) : inner === "conflicts" ? (
        conflicts.length ? (
          conflicts.map((c) => {
            const id = String(c.id ?? "");
            const ruleA = rules.find((r) => r.id === String(c.rule_id_a ?? ""));
            const ruleB = rules.find((r) => r.id === String(c.rule_id_b ?? ""));
            const name = String(ruleA?.task_name ?? ruleB?.task_name ?? "Schedule");
            return (
              <article key={id} className="mm-light-card rounded-2xl border border-outline-variant/30 border-l-4 border-l-amber-500 bg-white p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="material-symbols-outlined text-amber-700">call_split</span>
                  <h3 className="text-lg font-semibold text-on-surface">{name}</h3>
                  {ruleA ? <MmScopeChip scope={String(ruleA.template_scope)} code={(ruleA as { scope_code?: string }).scope_code} /> : null}
                </div>
                <p className="mt-1 text-sm text-on-surface-variant">Two schedules cover the same cars. Keep one.</p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <ConflictCol title="Schedule A" rule={ruleA} />
                  <ConflictCol title="Schedule B" rule={ruleB} />
                </div>
                {canWrite ? (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {ruleA ? (
                      <OutlineButton icon="check" onClick={() => onKeep(id, ruleA.id)}>
                        Keep A
                      </OutlineButton>
                    ) : null}
                    {ruleB ? (
                      <OutlineButton icon="check" onClick={() => onKeep(id, ruleB.id)}>
                        Keep B
                      </OutlineButton>
                    ) : null}
                    <DangerButton icon="close" onClick={() => onRetireBoth(id)}>
                      Retire both
                    </DangerButton>
                    <span className="text-sm italic text-on-surface-variant">The one you don&apos;t keep is retired.</span>
                  </div>
                ) : null}
              </article>
            );
          })
        ) : (
          <p className="rounded-2xl border border-outline-variant/30 bg-white p-6 text-center text-sm text-on-surface-variant">
            No conflicting schedules.
          </p>
        )
      ) : proposals.length ? (
        proposals.map((p) => (
          <ProposalCard key={String(p.id)} p={p} rules={rules} canWrite={canWrite} onApprove={onApprove} onReject={onReject} />
        ))
      ) : (
        <p className="rounded-2xl border border-outline-variant/30 bg-white p-6 text-center text-sm text-on-surface-variant">
          Nothing waiting for approval.
        </p>
      )}
    </div>
  );
}

function ConflictCol({ title, rule }: { title: string; rule?: MaintenanceRule }) {
  if (!rule) return <div className="mm-conflict-col rounded-xl bg-[#f4f3fa] p-4 text-sm">{title}: —</div>;
  return (
    <div className="mm-conflict-col rounded-xl bg-[#f4f3fa] p-4 text-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="font-code text-[12px] uppercase tracking-wider text-on-surface">{title}</p>
        <MmSourceChip source={rule.source_type} />
      </div>
      <p className="mt-3 font-code text-base text-on-surface">{formatInterval(rule.interval_km, rule.interval_months)}</p>
      <p className="mt-3 font-code text-[12px] text-on-surface-variant">added {fmtDate(rule.created_at)}</p>
    </div>
  );
}

function ProposalCard({
  p,
  rules,
  canWrite,
  onApprove,
  onReject,
}: {
  p: Record<string, unknown>;
  rules: MaintenanceRule[];
  canWrite: boolean;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string, note: string) => Promise<void>;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const id = String(p.id);
  const payload = (p.payload ?? {}) as Record<string, unknown>;
  const action = String(p.action ?? "");
  const current = rules.find((r) => r.id === String(p.entity_id ?? ""));
  const name = String(payload.task_name ?? current?.task_name ?? "Schedule");
  const after = formatInterval(payload.interval_km as number, payload.interval_months as number);
  const before = current ? formatInterval(current.interval_km, current.interval_months) : null;
  const change =
    action === "retire_rule"
      ? `Retire ${name} (${before ?? "—"})`
      : action === "create_active_rule"
        ? `New ${name} schedule: ${after}`
        : `${name}: ${before ?? "—"} → ${after}`;
  const reason = String(payload.reason ?? payload.change_reason ?? "").trim();

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="mm-light-card rounded-2xl border border-outline-variant/30 border-l-4 border-l-[#0153dc] bg-white p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#dbe1ff] text-[#0153dc]">
          <span className="material-symbols-outlined">support_agent</span>
        </span>
        <div>
          <p className="font-semibold text-on-surface">Support request</p>
          <p className="text-sm text-on-surface-variant">Sent {fmtDate(p.created_at)} for your approval.</p>
        </div>
      </div>
      <div className="mt-4 rounded-xl bg-[#f4f3fa] p-3">
        <p className="font-code text-[11px] uppercase tracking-wider text-on-surface-variant">Change</p>
        <p className="mt-1 rounded-lg bg-white px-3 py-2 font-code text-sm text-on-surface">{change}</p>
      </div>
      {reason ? <p className="mt-3 text-sm italic text-on-surface-variant">&ldquo;{reason}&rdquo;</p> : null}
      {canWrite ? (
        rejecting ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input
              autoFocus
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why are you rejecting it?"
              className="min-w-[260px] flex-1 rounded-lg border border-outline-variant/50 px-3 py-1.5 text-sm"
            />
            <OutlineButton disabled={busy} onClick={() => setRejecting(false)}>
              Back
            </OutlineButton>
            <DangerButton icon="cancel" disabled={busy || !note.trim()} onClick={() => void run(() => onReject(id, note.trim()))}>
              Reject request
            </DangerButton>
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            <DangerButton icon="cancel" disabled={busy} onClick={() => setRejecting(true)}>
              Reject
            </DangerButton>
            <PrimaryButton icon="check_circle" disabled={busy} onClick={() => void run(() => onApprove(id))}>
              Approve
            </PrimaryButton>
          </div>
        )
      ) : null}
    </article>
  );
}
