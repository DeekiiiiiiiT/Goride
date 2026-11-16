/**
 * DM2 — Add / Edit job drawer.
 * Look: Stitch service-items screen 2 (edit_job_drawer_may_need_list). Content: S43b plan + audit 9c
 * (Keep header, fields, Also do card, May need, footer; Drop "Browse all 120+" and "Auto-saves drafts" —
 * show every JOB_ICON_KEYS). Today's lock rules, helpers and "Suggested with" stay (built in the same style).
 */
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  addAlsoDo,
  createJob,
  JOB_ACTION_LABEL,
  JOB_ACTIONS,
  JOB_ICON_KEYS,
  removeAlsoDo,
  updateJob,
  type Job,
  type JobAction,
  type JobsPayload,
  type Supply,
} from "./jobsApi";
import { partIconKey } from "../MmChips";
import { inMayNeed } from "./mayNeedModel";
import { MayNeedSection } from "./MayNeedSection";
import { BlueButton, RedSoftButton, T, WhiteButton } from "./serviceItemsUi";
import { FitsSection, HvChip } from "./FitsSection";
import { FUELS, POWERTRAINS, rowFromSaved, rowToSave, type FitRow } from "../../powertrain/powertrainModel";

type Link = { relationId?: string; jobId: string; jobName: string; note: string };

type Props = {
  token: string;
  data: JobsPayload;
  mode: "add" | "edit";
  job: Job | null;
  presetGroupId?: string;
  canWrite: boolean;
  onClose: () => void;
  onSaved: () => void;
  onOpenJob: (job: Job) => void;
  /** May-need links save straight away; this refreshes the list behind the drawer. */
  onItemsChanged?: () => void;
};

const LOCK_REASON = "Locked — apps already use this job, so its group and type can't change.";

export function JobDrawer({ token, data, mode, job, presetGroupId, canWrite, onClose, onSaved, onOpenJob, onItemsChanged }: Props) {
  const locked = mode === "edit" && Boolean(job?.used);
  const [name, setName] = useState(job?.name ?? "");
  const [homeGroupId, setHomeGroupId] = useState(job?.homeGroupId ?? presetGroupId ?? data.groups[0]?.id ?? "");
  const [isPart, setIsPart] = useState(job?.isPart ?? false);
  const [defaultAction, setDefaultAction] = useState<JobAction>(job?.defaultAction ?? (job?.isPart ? "replace" : "inspect"));
  const [description, setDescription] = useState(job?.description ?? "");
  const [iconKey, setIconKey] = useState(job?.iconKey ?? (isPart ? "gears" : "wrench"));
  const [links, setLinks] = useState<Link[]>(
    (job?.alsoDo ?? []).map((l) => ({ relationId: l.relationId, jobId: l.jobId, jobName: l.jobName, note: l.note })),
  );
  const [removed, setRemoved] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [newLinkJobId, setNewLinkJobId] = useState("");
  const [newLinkNote, setNewLinkNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [localData, setLocalData] = useState(data);
  // Powertrain job fit (audit section 4): NULL on a job = "Same as group".
  const [fitPt, setFitPt] = useState<FitRow>(() => rowFromSaved(job?.fitsPowertrains, POWERTRAINS, false));
  const [fitFu, setFitFu] = useState<FitRow>(() => rowFromSaved(job?.fitsFuels, FUELS, false));
  const [hv, setHv] = useState(job?.isHighVoltage ?? false);
  const ptSave = rowToSave(fitPt, POWERTRAINS, false);
  const fuSave = rowToSave(fitFu, FUELS, false);
  const fitsInvalid = ptSave === undefined || fuSave === undefined;
  const sameList = (a: string[] | null | undefined, b: string[] | null | undefined) =>
    JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const fitPatch = () => {
    const p: { fitsPowertrains?: string[] | null; fitsFuels?: string[] | null; isHighVoltage?: boolean } = {};
    if (!sameList(ptSave, job?.fitsPowertrains)) p.fitsPowertrains = ptSave ?? null;
    if (!sameList(fuSave, job?.fitsFuels)) p.fitsFuels = fuSave ?? null;
    if (hv !== (job?.isHighVoltage ?? false)) p.isHighVoltage = hv;
    return p;
  };
  const alsoDoRef = useRef<HTMLDivElement | null>(null);

  const jobsById = useMemo(() => new Map(localData.jobs.map((j) => [j.id, j])), [localData.jobs]);
  const groupName = useMemo(() => new Map(localData.groups.map((g) => [g.id, g.name])), [localData.groups]);
  const linkChoices = useMemo(
    () =>
      localData.jobs
        .filter((j) => j.status === "active" && j.id !== job?.id && !links.some((l) => l.jobId === j.id))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [localData.jobs, job?.id, links],
  );

  const canSave = canWrite && name.trim() && homeGroupId && description.trim() && !busy && !fitsInvalid;
  const homeGroup = localData.groups.find((g) => g.id === homeGroupId);

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      const input = {
        name: name.trim(),
        homeGroupId,
        isPart,
        defaultAction,
        description: description.trim(),
        iconKey,
      };
      let id = job?.id;
      if (mode === "add") {
        id = (await createJob(token, input)).item.id;
        const fits = fitPatch();
        if (Object.keys(fits).length) await updateJob(token, id, fits);
      } else if (id) {
        // Home group and form type are never sent once the job has been used.
        const patch = {
          ...(locked ? { name: input.name, defaultAction, description: input.description, iconKey } : input),
          // Fits can change on a used job too: history keeps its own fit_at_log.
          ...fitPatch(),
        };
        await updateJob(token, id, patch);
      }
      if (id) {
        for (const relationId of removed) await removeAlsoDo(token, relationId);
        for (const l of links.filter((x) => !x.relationId)) await addAlsoDo(token, id, l.jobId, l.note);
      }
      toast.success(mode === "add" ? `${input.name} added` : `${input.name} saved`);
      onSaved();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the job");
    } finally {
      setBusy(false);
    }
  };

  const addLink = () => {
    const target = jobsById.get(newLinkJobId);
    if (!target || !newLinkNote.trim()) return;
    setLinks((prev) => [...prev, { jobId: target.id, jobName: target.name, note: newLinkNote.trim() }]);
    setNewLinkJobId("");
    setNewLinkNote("");
    setAdding(false);
  };

  const removeLink = (l: Link) => {
    if (l.relationId) setRemoved((prev) => [...prev, l.relationId!]);
    setLinks((prev) => prev.filter((x) => x !== l));
  };

  const onSupplyCreated = (s: Supply) => setLocalData((d) => ({ ...d, supplies: [...d.supplies, s] }));

  const label = `mb-1.5 block ${T.labelMd} text-[#565e74]`;
  const field = `w-full rounded-xl bg-[#f1f3ff] ${T.bodyMd} text-[#161b27] shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-[#0153dc]/30 disabled:cursor-not-allowed disabled:text-[#565e74]`;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-[#0f172a]/40 backdrop-blur-sm" />
      <div
        className="fixed inset-0 z-50 flex justify-end"
        onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}
      >
        <aside
          role="dialog"
          aria-modal="true"
          aria-labelledby="mm-job-drawer-title"
          className="flex h-full w-full max-w-[580px] flex-col overflow-hidden rounded-l-2xl bg-[#ffffff] shadow-[0_20px_25px_-5px_rgba(15,23,42,0.1),0_8px_10px_-6px_rgba(15,23,42,0.05)]"
        >
          <div className="flex shrink-0 items-start justify-between bg-[#ffffff] px-6 pb-4 pt-6">
            <div>
              <p className={`${T.labelMd} mb-0.5 text-[#565e74]`}>{mode === "add" ? "Add job" : "Edit job"}</p>
              {/* Stitch powertrain 08: the high-voltage chip sits beside the title. */}
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="mm-job-drawer-title" className={`${T.headlineXl} text-[#161b27]`}>
                  {mode === "add" ? name.trim() || "New job" : job?.name}
                </h2>
                {hv ? <HvChip /> : null}
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

          <div className="flex-1 space-y-7 overflow-y-auto px-6 py-3">
            <div className="space-y-4">
              <div>
                <label htmlFor="mm-job-name" className={label}>
                  Name <span className="text-[#ba1a1a]">*</span>
                </label>
                <input id="mm-job-name" className={`h-10 px-3.5 ${field}`} value={name} disabled={!canWrite} onChange={(e) => setName(e.target.value)} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between">
                    <label htmlFor="mm-job-group" className={label}>
                      Home group
                    </label>
                    {locked ? <LockedTag /> : null}
                  </div>
                  <div className="relative">
                    <select
                      id="mm-job-group"
                      className={`h-10 cursor-pointer appearance-none pl-3.5 pr-9 ${field}`}
                      value={homeGroupId}
                      disabled={locked || !canWrite}
                      onChange={(e) => setHomeGroupId(e.target.value)}
                    >
                      {localData.groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                    <Chevron />
                  </div>
                </div>
                <div>
                  <label htmlFor="mm-job-action" className={label}>
                    Default action
                  </label>
                  <div className="relative">
                    <select
                      id="mm-job-action"
                      className={`h-10 cursor-pointer appearance-none pl-3.5 pr-9 ${field}`}
                      value={defaultAction}
                      disabled={!canWrite}
                      onChange={(e) => setDefaultAction(e.target.value as JobAction)}
                    >
                      {JOB_ACTIONS.map((a) => (
                        <option key={a} value={a}>
                          {JOB_ACTION_LABEL[a]}
                        </option>
                      ))}
                    </select>
                    <Chevron />
                  </div>
                </div>
              </div>
              {locked ? <Helper icon="info">{LOCK_REASON}</Helper> : null}
              <p className={`${T.bodySm} -mt-2 text-[#565e74]`}>What a mechanic usually does with this job. Saved on every log line.</p>

              <div>
                <div className="flex items-center justify-between">
                  <span className={label}>Form type</span>
                  {locked ? <LockedTag /> : null}
                </div>
                <div className="inline-flex rounded-xl bg-[#f1f3ff] p-1" role="group">
                  {[
                    { v: false, t: "Service", i: "build" },
                    { v: true, t: "Part", i: "category" },
                  ].map((o) => (
                    <button
                      key={o.t}
                      type="button"
                      aria-pressed={isPart === o.v}
                      disabled={locked || !canWrite}
                      onClick={() => setIsPart(o.v)}
                      className={`flex items-center gap-1.5 rounded-lg px-5 py-1.5 ${T.labelMd} transition-all disabled:cursor-not-allowed ${
                        isPart === o.v ? "bg-[#0153dc] font-semibold text-white shadow-sm" : "text-[#565e74] hover:text-[#161b27]"
                      }`}
                    >
                      <span className="material-symbols-outlined text-[16px]">{o.i}</span>
                      <span>{o.t}</span>
                    </button>
                  ))}
                </div>
                <div className="mt-1.5">
                  <Helper icon="info">
                    {locked
                      ? LOCK_REASON
                      : isPart
                        ? "Logged with quantity, price, brand and part number. Also shows in Find parts."
                        : "Logged with a cost only."}
                  </Helper>
                </div>
              </div>

              <div>
                <label htmlFor="mm-job-desc" className={label}>
                  Description <span className="text-[#ba1a1a]">*</span>
                </label>
                <textarea
                  id="mm-job-desc"
                  rows={3}
                  className={`resize-none p-3 ${field}`}
                  value={description}
                  disabled={!canWrite}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="One plain sentence: what this job is and why it's done."
                />
                <div className="mt-1.5">
                  <Helper icon="info">Shown when someone taps ⓘ while logging.</Helper>
                </div>
              </div>

              <div>
                <span className={`${T.labelMd} mb-2 block text-[#565e74]`}>Icon</span>
                <div className="flex flex-wrap items-center gap-2.5 pb-1">
                  {JOB_ICON_KEYS.map((k) => {
                    const on = iconKey === k;
                    return (
                      <button
                        key={k}
                        type="button"
                        aria-label={`Icon ${k}`}
                        aria-pressed={on}
                        title={k}
                        disabled={!canWrite}
                        onClick={() => setIconKey(k)}
                        className={
                          on
                            ? "flex h-10 w-10 items-center justify-center rounded-full bg-[#dae2fd] text-[#003ea9] ring-2 ring-[#0153dc] ring-offset-2 ring-offset-white transition-all"
                            : "flex h-10 w-10 items-center justify-center rounded-full bg-[#f1f3ff] text-[#565e74] transition-all hover:bg-[#e4e8f8] hover:text-[#161b27]"
                        }
                      >
                        <span className="material-symbols-outlined text-[20px]">{partIconKey(k)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <FitsSection
              kind="job"
              token={token}
              canWrite={canWrite}
              jobId={mode === "edit" ? job?.id ?? null : null}
              groupPt={homeGroup?.fitsPowertrains ?? null}
              groupFu={homeGroup?.fitsFuels ?? null}
              groupName={homeGroup?.name ?? ""}
              pt={fitPt}
              fu={fitFu}
              onPt={setFitPt}
              onFu={setFitFu}
              hv={hv}
              onHv={setHv}
            />

            <div ref={alsoDoRef} className="space-y-3 rounded-2xl bg-[#f1f3ff]/60 p-4" data-testid="also-do-card">
              <div className="flex items-center gap-2">
                <span className={`${T.headlineMd} text-[#161b27]`}>Also do</span>
                <span className={`rounded-full bg-[#dee2f3] px-2 py-0.5 ${T.labelSm} text-[#434655]`}>{links.length}</span>
              </div>
              <p className={`${T.bodySm} text-[#565e74]`}>Separate service operations frequently paired alongside this task.</p>
              {links.map((l) => {
                const target = jobsById.get(l.jobId);
                return (
                  <div key={l.relationId ?? `new-${l.jobId}`} className="flex items-center justify-between gap-3 rounded-xl bg-[#ffffff] p-3.5 shadow-sm">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#e9edfe] text-[#003ea9]">
                        <span className="material-symbols-outlined text-[18px]">{partIconKey(target?.iconKey)}</span>
                      </div>
                      <div className="min-w-0">
                        <p className={`truncate ${T.labelMd} font-semibold text-[#161b27]`}>
                          {l.jobName}
                          {target && target.homeGroupId !== homeGroupId ? (
                            <span className="ml-1 font-normal text-[#565e74]">· {groupName.get(target.homeGroupId)}</span>
                          ) : null}
                        </p>
                        <p className={`truncate ${T.bodySm} text-[#565e74]`}>{l.note}</p>
                      </div>
                    </div>
                    {canWrite ? (
                      <RedSoftButton icon="delete" aria-label={`Remove ${l.jobName} from Also do`} onClick={() => removeLink(l)}>
                        Remove
                      </RedSoftButton>
                    ) : null}
                  </div>
                );
              })}
              {canWrite && !adding ? (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className={`flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#ffffff] py-2 ${T.labelMd} font-semibold text-[#003ea9] shadow-sm transition-colors hover:bg-[#e4e8f8]`}
                >
                  <span className="material-symbols-outlined text-[16px]">add</span>
                  <span>Add &lsquo;also do&rsquo;</span>
                </button>
              ) : null}
              {adding ? (
                <div className="space-y-2 rounded-xl bg-[#ffffff] p-3 shadow-sm">
                  <div className="relative">
                    <select
                      className={`h-10 cursor-pointer appearance-none pl-3.5 pr-9 ${field}`}
                      value={newLinkJobId}
                      onChange={(e) => setNewLinkJobId(e.target.value)}
                      aria-label="Job to suggest"
                    >
                      <option value="">Choose a job…</option>
                      {linkChoices.map((j) => {
                        const clash = inMayNeed(job, j.id);
                        return (
                          <option key={j.id} value={j.id} disabled={clash}>
                            {j.name} · {groupName.get(j.homeGroupId)}
                            {clash ? " — Already in May need" : ""}
                          </option>
                        );
                      })}
                    </select>
                    <Chevron />
                  </div>
                  <input
                    className={`h-10 px-3.5 ${field}`}
                    value={newLinkNote}
                    onChange={(e) => setNewLinkNote(e.target.value)}
                    placeholder="Why do them together? e.g. The head is already off."
                    aria-label="Note"
                  />
                  <div className="flex justify-end gap-2">
                    <RedSoftButton onClick={() => setAdding(false)}>Cancel</RedSoftButton>
                    <WhiteButton icon="add" disabled={!newLinkJobId || !newLinkNote.trim()} onClick={addLink}>
                      Add
                    </WhiteButton>
                  </div>
                </div>
              ) : null}
              <p className={`${T.bodySm} text-[#565e74]`}>
                Suggested with:{" "}
                {job?.suggestedBy.length ? (
                  job.suggestedBy.map((s, i) => (
                    <span key={s.relationId}>
                      {i > 0 ? ", " : ""}
                      <button
                        type="button"
                        className={`rounded border border-[#c3c6d7]/60 bg-[#ffffff] px-1.5 py-0.5 ${T.labelSm} text-[#161b27] hover:bg-[#e9edfe]`}
                        onClick={() => {
                          const target = jobsById.get(s.jobId);
                          if (target) onOpenJob(target);
                        }}
                      >
                        {s.jobName}
                      </button>
                    </span>
                  ))
                ) : (
                  <span>(none)</span>
                )}
              </p>
            </div>

            <MayNeedSection
              token={token}
              data={localData}
              job={mode === "edit" ? job : null}
              canWrite={canWrite}
              onViewAlsoDo={() => alsoDoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              onChanged={() => onItemsChanged?.()}
              onSupplyCreated={onSupplyCreated}
            />
          </div>

          {/* Stitch powertrain 07 / 09 footer: red-outline Cancel and one solid Save, on the right. */}
          <div className="flex shrink-0 items-center justify-end gap-4 border-t border-[#e7e7f2] bg-[#ffffff] px-6 py-6">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className={`flex h-10 items-center rounded-[10px] border border-[#a83836] px-5 ${T.labelMd} font-medium text-[#ba1a1a] transition-colors hover:bg-[#fdf2f2]`}
            >
              Cancel
            </button>
            {canWrite ? (
              <BlueButton icon="check" disabled={!canSave} onClick={() => void save()} className="px-6">
                {busy ? "Saving…" : mode === "add" ? "Add job" : "Save job"}
              </BlueButton>
            ) : null}
          </div>
        </aside>
      </div>
    </>
  );
}

function Chevron() {
  return (
    <span className="material-symbols-outlined pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[20px] text-[#565e74]">
      expand_more
    </span>
  );
}

function LockedTag() {
  return (
    <span className={`inline-flex items-center gap-1 ${T.labelSm} text-[#565e74]`}>
      <span className="material-symbols-outlined text-[14px]">lock</span>Locked
    </span>
  );
}

function Helper({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <p className={`flex items-start gap-1 ${T.bodySm} text-[#565e74]`}>
      <span className="material-symbols-outlined mt-px text-[14px]">{icon}</span>
      {children}
    </p>
  );
}
