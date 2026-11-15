/**
 * Group "Fits" drawer — Stitch powertrain-job-fit-dominion screen 9 (2×2 preset cards, Custom…,
 * "Jobs that set their own", no high-voltage switch). Content: docs/powertrain-job-fit-audit.md section 4.
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { getPowertrainSummary } from "../../../../services/vehicleCatalogService";
import { updateGroupFits, type JobGroup, type JobsPayload } from "./jobsApi";
import { FitsSection, HvChip } from "./FitsSection";
import { BlueButton, T } from "./serviceItemsUi";
import { JobIcon } from "./jobsUi";
import {
  FUELS,
  FUEL_LABEL,
  FUEL_PRESETS,
  POWERTRAINS,
  POWERTRAIN_LABEL,
  POWERTRAIN_PRESETS,
  describeList,
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
          className="flex h-full w-full max-w-[580px] flex-col overflow-hidden rounded-l-2xl bg-[#ffffff] shadow-[0_20px_25px_-5px_rgba(15,23,42,0.1),0_8px_10px_-6px_rgba(15,23,42,0.05)]"
        >
          <div className="flex shrink-0 items-start justify-between bg-[#ffffff] px-6 pb-4 pt-6">
            <div className="flex items-start gap-3">
              <JobIcon iconKey={group.iconKey} className="h-10 w-10" />
              <div>
                <h2 id="mm-group-fits-title" className={`${T.headlineXl} text-[#161b27]`}>
                  {group.name}
                </h2>
                <p className={`${T.bodySm} text-[#565e74]`}>
                  Job group · {jobs.length} active job{jobs.length === 1 ? "" : "s"}
                </p>
              </div>
            </div>
            <button
              type="button"
              aria-label="Close"
              title="Close drawer"
              onClick={onClose}
              disabled={busy}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f1f3ff] text-[#565e74] transition-colors hover:bg-[#e4e8f8] hover:text-[#161b27]"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>

          <div className="flex-1 space-y-6 overflow-y-auto px-6 py-3">
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

            <section className="space-y-3 rounded-2xl bg-[#f1f3ff]/60 p-4" data-testid="jobs-set-own">
              <div className="flex items-center gap-2">
                <span className={`${T.headlineMd} text-[#161b27]`}>Jobs that set their own</span>
                <span className={`rounded-full bg-[#dee2f3] px-2 py-0.5 ${T.labelSm} text-[#434655]`}>{ownRules.length}</span>
              </div>
              <p className={`${T.bodySm} text-[#565e74]`}>These jobs use their own fit instead of the group&apos;s. Change them in the job drawer.</p>
              {ownRules.length === 0 ? (
                <p className={`${T.bodySm} text-[#565e74]`}>None. Every job in this group follows the group.</p>
              ) : (
                <ul className="space-y-2">
                  {ownRules.map((j) => (
                    <li key={j.id} className="flex items-center justify-between gap-3 rounded-xl bg-[#ffffff] px-3.5 py-2.5 shadow-sm">
                      <span className={`flex min-w-0 items-center gap-2 ${T.labelMd} font-semibold text-[#161b27]`}>
                        <span className="truncate">{j.name}</span>
                        {j.isHighVoltage ? <HvChip small /> : null}
                      </span>
                      <span className={`shrink-0 rounded-full bg-[#dae2fd] px-2.5 py-0.5 ${T.labelSm} text-[#003ea9]`}>{own(j)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="flex shrink-0 items-center justify-between bg-[#ffffff] px-6 py-6 shadow-[0_-4px_12px_rgba(0,0,0,0.03)]">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className={`flex h-10 items-center gap-1.5 rounded-xl bg-[#ffdad6]/40 px-5 ${T.labelMd} font-semibold text-[#ba1a1a] transition-colors hover:bg-[#ffdad6]`}
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
              <span>Cancel</span>
            </button>
            {canWrite ? (
              <BlueButton icon="check" disabled={busy || invalid || !changed} onClick={() => void save()} className="px-6">
                {busy ? "Saving…" : "Save"}
              </BlueButton>
            ) : null}
          </div>
        </aside>
      </div>
    </>
  );
}
