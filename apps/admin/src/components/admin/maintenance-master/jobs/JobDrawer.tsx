/** DM2 — Add / Edit job drawer. Look: S43b. Content: plan Layer 3 (Keep / Drop / Add for S43b). */
import { useMemo, useState } from "react";
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
} from "./jobsApi";
import { partIconKey } from "../MmChips";
import { DangerButton, IconButton, OutlineButton, PrimaryButton } from "./jobsUi";

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
};

const LOCK_REASON = "Locked — apps already use this job, so its group and type can't change.";

export function JobDrawer({ token, data, mode, job, presetGroupId, canWrite, onClose, onSaved, onOpenJob }: Props) {
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

  const jobsById = useMemo(() => new Map(data.jobs.map((j) => [j.id, j])), [data.jobs]);
  const groupName = useMemo(() => new Map(data.groups.map((g) => [g.id, g.name])), [data.groups]);
  const linkChoices = useMemo(
    () =>
      data.jobs
        .filter((j) => j.status === "active" && j.id !== job?.id && !links.some((l) => l.jobId === j.id))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [data.jobs, job?.id, links],
  );

  const canSave = canWrite && name.trim() && homeGroupId && description.trim() && !busy;

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
      } else if (id) {
        // Home group and form type are never sent once the job has been used.
        const patch = locked
          ? { name: input.name, defaultAction, description: input.description, iconKey }
          : input;
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

  const label = "font-code text-[11px] uppercase tracking-wider text-on-surface-variant";
  const input =
    "w-full rounded-lg border border-outline-variant/50 bg-surface-container-lowest px-3 py-2 text-sm text-on-surface disabled:bg-surface-container disabled:text-on-surface-variant";

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="mm-job-drawer-title"
        className="mm-light-card flex h-full w-full max-w-[560px] flex-col bg-white shadow-xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-outline-variant/30 px-6 py-4">
          <h2 id="mm-job-drawer-title" className="text-lg font-semibold text-on-surface">
            {mode === "add" ? (
              "Add job"
            ) : (
              <>
                Edit job · <span className="text-secondary">{job?.name}</span>
              </>
            )}
          </h2>
          <IconButton icon="close" aria-label="Close" onClick={onClose} disabled={busy} />
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="space-y-1.5">
            <label htmlFor="mm-job-name" className={label}>
              Name <span className="text-error">*</span>
            </label>
            <input id="mm-job-name" className={input} value={name} disabled={!canWrite} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="mm-job-group" className={label}>
                Home group
              </label>
              {locked ? <LockedTag /> : null}
            </div>
            <select
              id="mm-job-group"
              className={input}
              value={homeGroupId}
              disabled={locked || !canWrite}
              onChange={(e) => setHomeGroupId(e.target.value)}
            >
              {data.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            {locked ? <Helper icon="info">{LOCK_REASON}</Helper> : null}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className={label}>Form type</span>
              {locked ? <LockedTag /> : null}
            </div>
            <div className="grid grid-cols-2 gap-1 rounded-lg border border-outline-variant/50 bg-[#eeedf6] p-1" role="group">
              {[
                { v: false, t: "Service", i: "build" },
                { v: true, t: "Part", i: "settings" },
              ].map((o) => (
                <button
                  key={o.t}
                  type="button"
                  aria-pressed={isPart === o.v}
                  disabled={locked || !canWrite}
                  onClick={() => setIsPart(o.v)}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium disabled:cursor-not-allowed ${
                    isPart === o.v ? "bg-white text-secondary shadow-sm" : "text-on-surface-variant"
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">{o.i}</span>
                  {o.t}
                </button>
              ))}
            </div>
            <Helper icon="info">
              {locked
                ? LOCK_REASON
                : isPart
                  ? "Logged with quantity, price, brand and part number. Also shows in Find parts."
                  : "Logged with a cost only."}
            </Helper>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="mm-job-action" className={label}>
              Default action
            </label>
            <select
              id="mm-job-action"
              className={input}
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
            <p className="text-xs text-on-surface-variant">What a mechanic usually does with this job. Saved on every log line.</p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="mm-job-desc" className={label}>
              Description <span className="text-error">*</span>
            </label>
            <textarea
              id="mm-job-desc"
              rows={3}
              className={input}
              value={description}
              disabled={!canWrite}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="One plain sentence: what this job is and why it's done."
            />
            <Helper icon="info">Shown when someone taps ⓘ while logging.</Helper>
          </div>

          <div className="space-y-1.5">
            <span className={label}>Icon</span>
            <div className="flex flex-wrap gap-2">
              {JOB_ICON_KEYS.map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-label={`Icon ${k}`}
                  aria-pressed={iconKey === k}
                  disabled={!canWrite}
                  onClick={() => setIconKey(k)}
                  className={`flex h-10 w-10 items-center justify-center rounded-lg border ${
                    iconKey === k ? "border-secondary bg-secondary-container text-secondary" : "border-outline-variant/40 bg-[#eeedf6] text-on-surface-variant"
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">{partIconKey(k)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 border-t border-outline-variant/30 pt-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-on-surface">Also do (outgoing)</h3>
                <p className="text-xs text-on-surface-variant">Suggested while logging. Never ticked automatically.</p>
              </div>
              <span className="rounded-full bg-[#eeedf6] px-2 py-0.5 font-code text-[11px] text-on-surface-variant">
                {links.length} linked
              </span>
            </div>
            {links.map((l) => (
              <div key={l.relationId ?? `new-${l.jobId}`} className="flex items-center justify-between gap-3 rounded-xl bg-[#f4f3fa] px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-on-surface">
                    {l.jobName}
                    {jobsById.get(l.jobId) && jobsById.get(l.jobId)!.homeGroupId !== homeGroupId ? (
                      <span className="ml-1 text-xs font-normal text-on-surface-variant">
                        · {groupName.get(jobsById.get(l.jobId)!.homeGroupId)}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-on-surface-variant">&ldquo;{l.note}&rdquo;</p>
                </div>
                {canWrite ? (
                  <DangerButton icon="remove_circle" onClick={() => removeLink(l)}>
                    Remove
                  </DangerButton>
                ) : null}
              </div>
            ))}
            {canWrite && !adding ? (
              <OutlineButton icon="add" onClick={() => setAdding(true)}>
                Add &lsquo;also do&rsquo;
              </OutlineButton>
            ) : null}
            {adding ? (
              <div className="space-y-2 rounded-xl border border-outline-variant/40 p-3">
                <select className={input} value={newLinkJobId} onChange={(e) => setNewLinkJobId(e.target.value)} aria-label="Job to suggest">
                  <option value="">Choose a job…</option>
                  {linkChoices.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.name} · {groupName.get(j.homeGroupId)}
                    </option>
                  ))}
                </select>
                <input
                  className={input}
                  value={newLinkNote}
                  onChange={(e) => setNewLinkNote(e.target.value)}
                  placeholder="Why do them together? e.g. The head is already off."
                  aria-label="Note"
                />
                <div className="flex justify-end gap-2">
                  <DangerButton onClick={() => setAdding(false)}>Cancel</DangerButton>
                  <OutlineButton icon="add" disabled={!newLinkJobId || !newLinkNote.trim()} onClick={addLink}>
                    Add
                  </OutlineButton>
                </div>
              </div>
            ) : null}
            <p className="text-xs text-on-surface-variant">
              Suggested with:{" "}
              {job?.suggestedBy.length ? (
                job.suggestedBy.map((s, i) => (
                  <span key={s.relationId}>
                    {i > 0 ? ", " : ""}
                    <button
                      type="button"
                      className="rounded border border-outline-variant/50 px-1.5 py-0.5 text-xs font-medium text-on-surface hover:bg-surface-container"
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
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-outline-variant/30 bg-white px-6 py-4">
          <DangerButton onClick={onClose} disabled={busy}>
            Cancel
          </DangerButton>
          {canWrite ? (
            <PrimaryButton icon="save" disabled={!canSave} onClick={() => void save()}>
              {busy ? "Saving…" : mode === "add" ? "Add job" : "Save job"}
            </PrimaryButton>
          ) : null}
        </footer>
      </aside>
    </div>
  );
}

function LockedTag() {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-on-surface-variant">
      <span className="material-symbols-outlined text-[14px]">lock</span>Locked
    </span>
  );
}

function Helper({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-1 text-xs text-on-surface-variant">
      <span className="material-symbols-outlined mt-px text-[14px]">{icon}</span>
      {children}
    </p>
  );
}
