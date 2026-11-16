/**
 * Group "Fits" drawer — ported exactly from Stitch powertrain-job-fit-dominion screen 9 (header, 2×2 preset cards, Custom…,
 * "Jobs that set their own", no high-voltage switch). Content: docs/powertrain-job-fit-audit.md section 4.
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { getPowertrainSummary } from "../../../../services/vehicleCatalogService";
import { updateGroupFits, type JobGroup, type JobsPayload } from "./jobsApi";
import { FitsSection, HvChip } from "./FitsSection";
import { BlueButton } from "./serviceItemsUi";
import {
  FUELS,
  FUEL_LABEL,
  FUEL_PRESETS,
  POWERTRAINS,
  POWERTRAIN_LABEL,
  POWERTRAIN_PRESETS,
  describeList,
  presetFor,
  rowFromSaved,
  rowToSave,
  type FitRow,
} from "../../powertrain/powertrainModel";

type Props = {
  token: string;
  data: JobsPayload;
  group: JobGroup;
  canWrite: boolean;
  onClose: () => void;
  onSaved: () => void;
};

export function GroupFitsDrawer({ token, data, group, canWrite, onClose, onSaved }: Props) {
  const [pt, setPt] = useState<FitRow>(() => rowFromSaved(group.fitsPowertrains, POWERTRAINS, true));
  const [fu, setFu] = useState<FitRow>(() => rowFromSaved(group.fitsFuels, FUELS, true));
  const [byPowertrain, setByPowertrain] = useState<Record<string, number> | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    getPowertrainSummary(token)
      .then((s) => live && setByPowertrain(s.byPowertrain))
      .catch(() => live && setByPowertrain(null));
    return () => {
      live = false;
    };
  }, [token]);

  const jobs = useMemo(
    () => data.jobs.filter((j) => j.homeGroupId === group.id && j.status === "active"),
    [data.jobs, group.id],
  );
  const ownRules = jobs.filter((j) => j.fitsPowertrains != null || j.fitsFuels != null);
  // A job that inherits both lists counts exactly as the group does (exceptions aside).
  const sampleJobId = (jobs.find((j) => j.fitsPowertrains == null && j.fitsFuels == null) ?? jobs[0])?.id ?? null;

  const ptSave = rowToSave(pt, POWERTRAINS, true);
  const fuSave = rowToSave(fu, FUELS, true);
  const invalid = ptSave === undefined || fuSave === undefined;
  const changed =
    JSON.stringify(ptSave ?? null) !== JSON.stringify(group.fitsPowertrains ?? null) ||
    JSON.stringify(fuSave ?? null) !== JSON.stringify(group.fitsFuels ?? null);

  const save = async () => {
    if (invalid || !changed) return;
    setBusy(true);
    try {
      await updateGroupFits(token, group.id, { fitsPowertrains: ptSave ?? null, fitsFuels: fuSave ?? null });
      toast.success(`${group.name}: fits saved`);
      onSaved();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Couldn't save this. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const own = (j: (typeof jobs)[number]) =>
    [
      j.fitsPowertrains != null ? describeList(j.fitsPowertrains, POWERTRAIN_PRESETS, POWERTRAIN_LABEL) : null,
      j.fitsFuels != null ? describeList(j.fitsFuels, FUEL_PRESETS, FUEL_LABEL) : null,
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <>
      <div className="fixed inset-0 z-40 bg-[#0f172a]/40 backdrop-blur-sm" />
      <div className="fixed inset-0 z-50 flex justify-end" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
        <aside
          role="dialog"
          aria-modal="true"
          aria-labelledby="mm-group-fits-title"
          className="flex h-full w-full max-w-[560px] flex-col overflow-hidden border-l border-[#c3c6d7]/30 bg-[#ffffff] shadow-[-12px_0_36px_rgba(17,26,46,0.12)]"
        >
          {/* Stitch powertrain 09 header: folder tile + group name, "Job group" chip · active job count. */}
          <header className="shrink-0 border-b border-[#e7e7f2] bg-[#ffffff] p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#dbe1ff] text-[#003ea9]">
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>folder_managed</span>
                  </div>
                  <h2 id="mm-group-fits-title" className="truncate text-[24px] font-semibold leading-8 tracking-tight text-[#191b23]">
                    {group.name}
                  </h2>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#d9e2fe] px-2.5 py-0.5 text-[11px] font-semibold leading-[14px] text-[#121b2f]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#003ea9]" />
                    Job group
                  </span>
                  <span className="text-[11px] leading-[14px] text-[#737686]">•</span>
                  <span className="text-[12px] font-medium leading-4 text-[#434655]">
                    {jobs.length} active job{jobs.length === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close"
                title="Close drawer"
                onClick={onClose}
                disabled={busy}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-[#434655] transition-colors hover:bg-[#ecedf8] hover:text-[#191b23]"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
              </button>
            </div>
          </header>

          <div className="flex-1 space-y-6 overflow-y-auto bg-[#faf8ff]/50 p-6">
            <FitsSection
              kind="group"
              token={token}
              canWrite={canWrite}
              sampleJobId={sampleJobId}
              byPowertrain={byPowertrain}
              pt={pt}
              fu={fu}
              onPt={setPt}
              onFu={setFu}
            />

            <section className="space-y-4 rounded-2xl border border-[#e8e9f2] bg-[#ffffff] p-5 shadow-sm" data-testid="jobs-set-own">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-[18px] font-semibold leading-[26px] tracking-tight text-[#191b23]">Jobs that set their own</h3>
                    <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-[#e7e7f2] px-1.5 text-[11px] font-bold leading-[14px] text-[#434655]">
                      {ownRules.length}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[12px] leading-[18px] text-[#434655]">These jobs don&apos;t follow the group. Change them in the job drawer.</p>
                </div>
                <span className="material-symbols-outlined text-[#737686]" style={{ fontSize: 20 }}>rule_folder</span>
              </div>
              {ownRules.length === 0 ? (
                <p className="text-[12px] leading-[18px] text-[#434655]">None. Every job in this group follows the group.</p>
              ) : (
                <ul className="space-y-2">
                  {ownRules.map((j) => (
                    <li
                      key={j.id}
                      className="flex items-center justify-between gap-3 rounded-lg bg-[#f2f3fe]/40 p-2.5 transition-colors hover:bg-[#f2f3fe]"
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className="h-2 w-2 shrink-0 rounded-full bg-[#003ea9]" />
                        <span className="truncate text-[12px] font-medium leading-4 text-[#191b23]">{j.name}</span>
                        {j.isHighVoltage ? <HvChip small /> : null}
                      </span>
                      <span
                        className={`block max-w-[230px] shrink-0 truncate rounded-full px-2.5 py-0.5 text-[11px] font-medium leading-[14px] ${ownChip(j.fitsPowertrains)}`}
                      >
                        {own(j)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <footer className="flex shrink-0 items-center justify-end gap-4 border-t border-[#e7e7f2] bg-[#ffffff] p-6">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="h-10 rounded-[10px] border border-[#a83836] px-5 text-[14px] font-medium leading-5 text-[#ba1a1a] transition-colors hover:bg-[#fdf2f2]"
            >
              Cancel
            </button>
            {canWrite ? (
              <BlueButton icon="done" disabled={busy || invalid || !changed} onClick={() => void save()} className="rounded-[10px] px-6">
                {busy ? "Saving…" : "Save"}
              </BlueButton>
            ) : null}
          </footer>
        </aside>
      </div>
    </>
  );
}

/** Stitch 09 colours the "own" chip by the job's powertrain preset. */
function ownChip(list: string[] | null | undefined): string {
  switch (list == null ? "none" : presetFor(list, POWERTRAIN_PRESETS)) {
    case "plugin":
      return "bg-[#ccfbf1] text-[#0f766e]";
    case "electrified":
      return "bg-[#f0f5ff] text-[#003ea9]";
    case "combustion":
      return "bg-[#fef3e2] text-[#8a5a00]";
    case "all":
      return "bg-[#dbe1ff] text-[#0153dc]";
    default:
      return "bg-[#e1e2ec] text-[#434655]";
  }
}
