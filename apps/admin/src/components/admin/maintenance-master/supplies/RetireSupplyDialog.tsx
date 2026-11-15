/**
 * Service items — Retire a supply.
 * Look: Stitch screen 7 (retire_a_supply). Content: audit 9c (Drop "Retiring archives this consumable…",
 * "for technicians on the shop floor", "Dominion audit log preserves…").
 */
import { useState } from "react";
import { retireSupply, type Job, type Supply } from "../jobs/jobsApi";
import { T } from "../jobs/serviceItemsUi";

type Props = {
  token: string;
  supply: Supply;
  /** Active jobs listing this supply in May need. */
  jobs: Job[];
  onClose: () => void;
  onRetired: (s: Supply, hiddenFromJobs: number) => void;
};

export function RetireSupplyDialog({ token, supply, jobs, onClose, onRetired }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const confirm = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await retireSupply(token, supply.id);
      onRetired(res.item, res.hiddenFromJobs);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Couldn't retire this supply.");
      setBusy(false);
    }
  };

  const activeJobs = jobs.filter((j) => j.status === "active");

  return (
    <>
      <div className="fixed inset-0 z-[80] bg-[#0f172a]/45 backdrop-blur-[4px]" />
      <div
        className="fixed inset-0 z-[81] flex items-center justify-center p-4"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !busy) onClose();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="mm-retire-supply-title"
          className="relative flex w-full max-w-[480px] flex-col rounded-2xl bg-[#ffffff] p-6 shadow-2xl"
        >
          <div className="flex flex-col items-start">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#ffdad6]/40 text-[#ba1a1a]">
              <span className="material-symbols-outlined text-[26px]">archive</span>
            </div>
            <h2 id="mm-retire-supply-title" className="mb-2 mt-4 text-[20px] font-semibold leading-7 tracking-tight text-[#161b27]">
              Retire {supply.name}?
            </h2>
            <p className={`${T.bodyMd} mb-6 text-[#434655]`}>This item can be restored at any time.</p>
          </div>

          <div className="space-y-3">
            <ImpactTile icon="visibility_off" tone="amber">
              {activeJobs.length === 0 ? (
                <>
                  Not on the <b className="font-semibold">May-need list</b> of any job.
                </>
              ) : (
                <>
                  Hidden from the <b className="font-semibold">May-need list</b> of {activeJobs.length} job
                  {activeJobs.length === 1 ? "" : "s"} (<span className="font-medium">{activeJobs.map((j) => j.name).join(", ")}</span>) until
                  restored.
                </>
              )}
            </ImpactTile>
            <ImpactTile icon="smartphone" tone="slate">
              Hidden from logging in <b className="font-semibold">Roam Fleet</b>.
            </ImpactTile>
            <ImpactTile icon="verified_user" tone="primary">
              Past service logs keep the name — <b className="font-semibold">nothing is erased</b> or altered in audit history.
            </ImpactTile>
          </div>

          {error ? (
            <p role="alert" className={`mt-4 rounded-lg bg-[#ffdad6]/50 px-3 py-2 ${T.bodySm} text-[#93000a]`}>
              {error}
            </p>
          ) : null}

          <div className="mt-6 flex items-center justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className={`h-10 rounded-xl bg-[#e9edfe] px-4 ${T.labelMd} text-[#434655] transition-colors hover:bg-[#e4e8f8] hover:text-[#161b27]`}
            >
              Keep it
            </button>
            <button
              type="button"
              onClick={() => void confirm()}
              disabled={busy}
              className={`flex h-10 items-center gap-2 rounded-xl bg-[#ba1a1a] px-5 ${T.labelMd} text-white shadow-sm transition-all hover:opacity-95 active:scale-[0.98] disabled:opacity-50`}
            >
              <span className="material-symbols-outlined text-[18px]">archive</span>
              <span>{busy ? "Retiring…" : "Retire supply"}</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function ImpactTile({ icon, tone, children }: { icon: string; tone: "amber" | "slate" | "primary"; children: React.ReactNode }) {
  const toneCls =
    tone === "amber" ? "bg-[#f59e0b]/15 text-[#d97706]" : tone === "slate" ? "bg-[#64748b]/15 text-[#475569]" : "bg-[#003ea9]/10 text-[#003ea9]";
  return (
    <div className="flex items-start gap-3.5 rounded-xl bg-[#f1f3ff] p-3">
      <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${toneCls}`}>
        <span className="material-symbols-outlined text-[18px]">{icon}</span>
      </div>
      <p className={`${T.bodySm} min-w-0 flex-1 leading-snug text-[#161b27]`}>{children}</p>
    </div>
  );
}
