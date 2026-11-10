/** DM3 — Manage sections for one group. Look: S43c. Content: plan Layer 3 (Keep / Drop / Add for S43c). */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  createSection,
  createSectionGroup,
  deleteSection,
  deleteSectionGroup,
  JOB_ICON_KEYS,
  renameSectionGroup,
  reorderSectionGroups,
  reorderSections,
  setSectionJobs,
  updateSection,
  type Job,
  type JobSection,
  type JobsPayload,
} from "./jobsApi";
import { moveId, sectionHoldingJob } from "./jobsModel";
import { partIconKey } from "../MmChips";
import {
  ActionChip,
  CountChip,
  DangerButton,
  FormTypeChip,
  IconButton,
  ListedFromChip,
  OutlineButton,
  PrimaryButton,
} from "./jobsUi";
import { sectionIcon } from "./JobsTab";

type Props = {
  token: string;
  canWrite: boolean;
  data: JobsPayload;
  groupId: string;
  onGroupChange: (groupId: string) => void;
  onBack: () => void;
  onChanged: () => Promise<void> | void;
};

const sortBy = <T extends { sortOrder: number; name: string }>(list: T[]) =>
  [...list].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

export function ManageSections({ token, canWrite, data, groupId, onGroupChange, onBack, onChanged }: Props) {
  const group = data.groups.find((g) => g.id === groupId);
  const sectionGroups = useMemo(() => sortBy(data.sectionGroups.filter((sg) => sg.groupId === groupId)), [data, groupId]);
  const jobsById = useMemo(() => new Map(data.jobs.map((j) => [j.id, j])), [data.jobs]);
  const groupName = useMemo(() => new Map(data.groups.map((g) => [g.id, g.name])), [data.groups]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(sectionGroups[0]?.sections.slice(0, 1).map((s) => s.id)));
  const [busy, setBusy] = useState(false);
  const [newGroupName, setNewGroupName] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(done);
      await onChanged();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <OutlineButton icon="arrow_back" onClick={onBack}>
            Jobs
          </OutlineButton>
          <h2 className="text-base font-semibold text-on-surface">Sections · {group?.name}</h2>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={groupId}
            onChange={(e) => onGroupChange(e.target.value)}
            className="rounded-lg border border-outline-variant/50 bg-surface-container-lowest px-3 py-2 text-sm"
            aria-label="Group"
          >
            {data.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          {canWrite ? (
            <PrimaryButton icon="add" disabled={busy} onClick={() => setNewGroupName("")}>
              Add section group
            </PrimaryButton>
          ) : null}
        </div>
      </div>

      {newGroupName !== null ? (
        <InlineName
          label="New section group"
          initial=""
          busy={busy}
          onCancel={() => setNewGroupName(null)}
          onSave={(name) =>
            void run(() => createSectionGroup(token, groupId, name), `${name} added`).then(() => setNewGroupName(null))
          }
        />
      ) : null}

      {sectionGroups.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-outline-variant/60 p-6 text-center text-sm text-on-surface-variant">
          {group?.name} has no sections yet. Jobs show as one list in the apps until you add some.
        </p>
      ) : null}

      {sectionGroups.map((sg, gi) => (
        <SectionGroupCard
          key={sg.id}
          index={gi}
          total={sectionGroups.length}
          sg={sg}
          canWrite={canWrite}
          busy={busy}
          expanded={expanded}
          onToggle={toggle}
          jobsById={jobsById}
          groupName={groupName}
          groupId={groupId}
          allSectionGroups={data.sectionGroups}
          allJobs={data.jobs}
          onRename={(name) => void run(() => renameSectionGroup(token, sg.id, name), "Renamed")}
          onMove={(dir) =>
            void run(
              () => reorderSectionGroups(token, groupId, moveId(sectionGroups.map((x) => x.id), sg.id, dir)),
              "Order saved",
            )
          }
          onDelete={() => void run(() => deleteSectionGroup(token, sg.id), `${sg.name} deleted`)}
          onAddSection={(input) => void run(() => createSection(token, sg.id, input), `${input.name} added`)}
          onUpdateSection={(s, input) => void run(() => updateSection(token, s.id, input), "Saved")}
          onDeleteSection={(s) => void run(() => deleteSection(token, s.id), `${s.name} deleted`)}
          onMoveSection={(s, dir) =>
            void run(
              () => reorderSections(token, sg.id, moveId(sortBy(sg.sections).map((x) => x.id), s.id, dir)),
              "Order saved",
            )
          }
          onSetJobs={(s, ids, msg) => void run(() => setSectionJobs(token, s.id, ids), msg)}
        />
      ))}
    </div>
  );
}

function SectionGroupCard(props: {
  index: number;
  total: number;
  sg: JobsPayload["sectionGroups"][number];
  canWrite: boolean;
  busy: boolean;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  jobsById: Map<string, Job>;
  groupName: Map<string, string>;
  groupId: string;
  allSectionGroups: JobsPayload["sectionGroups"];
  allJobs: Job[];
  onRename: (name: string) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  onAddSection: (input: { name: string; description: string; iconKey: string }) => void;
  onUpdateSection: (s: JobSection, input: { name: string; description: string; iconKey: string }) => void;
  onDeleteSection: (s: JobSection) => void;
  onMoveSection: (s: JobSection, dir: -1 | 1) => void;
  onSetJobs: (s: JobSection, ids: string[], msg: string) => void;
}) {
  const { sg, canWrite, busy } = props;
  const [renaming, setRenaming] = useState(false);
  const [addingSection, setAddingSection] = useState(false);
  const sections = sortBy(sg.sections);

  return (
    <section className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-code text-[11px] uppercase tracking-widest text-secondary">
            Group {String(props.index + 1).padStart(2, "0")}
          </p>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-on-surface">{sg.name}</h3>
            <CountChip>
              {sections.length} section{sections.length === 1 ? "" : "s"}
            </CountChip>
          </div>
        </div>
        {canWrite ? (
          <div className="flex flex-wrap items-center gap-2">
            <OutlineButton disabled={busy} onClick={() => setRenaming(true)}>
              Rename
            </OutlineButton>
            <IconButton icon="arrow_upward" aria-label="Move up" disabled={busy || props.index === 0} onClick={() => props.onMove(-1)} />
            <IconButton
              icon="arrow_downward"
              aria-label="Move down"
              disabled={busy || props.index === props.total - 1}
              onClick={() => props.onMove(1)}
            />
            <OutlineButton icon="add" disabled={busy} onClick={() => setAddingSection(true)}>
              Add section
            </OutlineButton>
            <span title={sections.length ? "Has sections — delete them first" : undefined}>
              <DangerButton icon="delete" disabled={busy || sections.length > 0} onClick={props.onDelete}>
                Delete
              </DangerButton>
            </span>
          </div>
        ) : null}
      </header>

      {renaming ? (
        <InlineName
          label="Section group name"
          initial={sg.name}
          busy={busy}
          onCancel={() => setRenaming(false)}
          onSave={(name) => {
            props.onRename(name);
            setRenaming(false);
          }}
        />
      ) : null}

      {addingSection ? (
        <SectionForm
          title="New section"
          initial={{ name: "", description: "", iconKey: "wrench" }}
          busy={busy}
          onCancel={() => setAddingSection(false)}
          onSave={(input) => {
            props.onAddSection(input);
            setAddingSection(false);
          }}
        />
      ) : null}

      {sections.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-outline-variant/60 px-3 py-3 text-sm text-on-surface-variant">
          0 sections — add one
        </p>
      ) : null}

      <div className="mt-3 space-y-2">
        {sections.map((s, si) => (
          <SectionRow key={s.id} s={s} si={si} count={sections.length} {...props} />
        ))}
      </div>
    </section>
  );
}

function SectionRow(props: Parameters<typeof SectionGroupCard>[0] & { s: JobSection; si: number; count: number }) {
  const { s, canWrite, busy, jobsById, groupName, groupId } = props;
  const open = props.expanded.has(s.id);
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const jobs = s.jobIds.map((id) => jobsById.get(id)).filter((j): j is Job => Boolean(j));

  return (
    <div className="rounded-xl border border-outline-variant/30 bg-[#f4f3fa]/40">
      <div className="flex flex-wrap items-start justify-between gap-3 p-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="material-symbols-outlined mt-0.5 text-[20px] text-secondary">{sectionIcon(s.iconKey)}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-on-surface">{s.name}</span>
              <CountChip>
                {jobs.length} job{jobs.length === 1 ? "" : "s"}
              </CountChip>
            </div>
            <p className="text-sm text-on-surface-variant">{s.description}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canWrite ? (
            <>
              <OutlineButton icon="edit" disabled={busy} onClick={() => setEditing(true)}>
                Edit
              </OutlineButton>
              <IconButton icon="arrow_upward" aria-label="Move section up" disabled={busy || props.si === 0} onClick={() => props.onMoveSection(s, -1)} />
              <IconButton
                icon="arrow_downward"
                aria-label="Move section down"
                disabled={busy || props.si === props.count - 1}
                onClick={() => props.onMoveSection(s, 1)}
              />
              <span title={jobs.length ? "Has jobs — remove them first" : undefined}>
                <DangerButton icon="delete" disabled={busy || jobs.length > 0} onClick={() => props.onDeleteSection(s)}>
                  Delete
                </DangerButton>
              </span>
            </>
          ) : null}
          <IconButton
            icon={open ? "expand_less" : "expand_more"}
            aria-label={open ? `Collapse ${s.name}` : `Expand ${s.name}`}
            aria-expanded={open}
            onClick={() => props.onToggle(s.id)}
          />
        </div>
      </div>

      {editing ? (
        <div className="px-3 pb-3">
          <SectionForm
            title="Edit section"
            initial={{ name: s.name, description: s.description, iconKey: s.iconKey }}
            busy={busy}
            onCancel={() => setEditing(false)}
            onSave={(input) => {
              props.onUpdateSection(s, input);
              setEditing(false);
            }}
          />
        </div>
      ) : null}

      {open ? (
        <div className="space-y-2 border-t border-outline-variant/20 p-3">
          {jobs.length === 0 ? (
            <p className="rounded-lg border border-dashed border-outline-variant/60 px-3 py-2 text-sm text-on-surface-variant">
              0 jobs — add some
            </p>
          ) : null}
          {jobs.map((job, ji) => (
            <div key={job.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-outline-variant/30 bg-white px-3 py-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="w-6 rounded bg-[#eeedf6] text-center font-code text-[11px] text-on-surface-variant">{ji + 1}</span>
                <span className="text-sm font-medium text-on-surface">{job.name}</span>
                <FormTypeChip isPart={job.isPart} />
                <ActionChip action={job.defaultAction} />
                {job.homeGroupId !== groupId ? <ListedFromChip groupName={groupName.get(job.homeGroupId) ?? ""} /> : null}
              </div>
              {canWrite ? (
                <div className="flex items-center gap-2">
                  <IconButton
                    icon="arrow_upward"
                    aria-label={`Move ${job.name} up`}
                    disabled={busy || ji === 0}
                    onClick={() => props.onSetJobs(s, moveId(s.jobIds, job.id, -1), "Order saved")}
                  />
                  <IconButton
                    icon="arrow_downward"
                    aria-label={`Move ${job.name} down`}
                    disabled={busy || ji === jobs.length - 1}
                    onClick={() => props.onSetJobs(s, moveId(s.jobIds, job.id, 1), "Order saved")}
                  />
                  <DangerButton
                    disabled={busy}
                    onClick={() => props.onSetJobs(s, s.jobIds.filter((id) => id !== job.id), `${job.name} removed from ${s.name}`)}
                  >
                    Remove
                  </DangerButton>
                </div>
              ) : null}
            </div>
          ))}
          {canWrite ? (
            <div className="relative">
              <OutlineButton icon="playlist_add" disabled={busy} onClick={() => setPicking((p) => !p)} aria-expanded={picking}>
                Add jobs to section
              </OutlineButton>
              {picking ? (
                <JobPicker
                  section={s}
                  groupId={groupId}
                  allJobs={props.allJobs}
                  allSectionGroups={props.allSectionGroups}
                  groupName={groupName}
                  onCancel={() => setPicking(false)}
                  onAdd={(ids) => {
                    props.onSetJobs(s, [...s.jobIds, ...ids], `${ids.length} job${ids.length === 1 ? "" : "s"} added to ${s.name}`);
                    setPicking(false);
                  }}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function JobPicker({
  section,
  groupId,
  allJobs,
  allSectionGroups,
  groupName,
  onCancel,
  onAdd,
}: {
  section: JobSection;
  groupId: string;
  allJobs: Job[];
  allSectionGroups: JobsPayload["sectionGroups"];
  groupName: Map<string, string>;
  onCancel: () => void;
  onAdd: (ids: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const rows = allJobs
    .filter((j) => j.status === "active" && !section.jobIds.includes(j.id))
    .filter((j) => !q.trim() || j.name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => Number(b.homeGroupId === groupId) - Number(a.homeGroupId === groupId) || a.name.localeCompare(b.name))
    .slice(0, 50);

  return (
    <div className="absolute left-0 z-20 mt-2 w-[360px] rounded-xl border border-outline-variant/40 bg-white shadow-xl">
      <div className="p-2">
        <input
          autoFocus
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find a job…"
          className="w-full rounded-lg border border-outline-variant/50 bg-[#f4f3fa] px-3 py-1.5 text-sm"
        />
      </div>
      <div className="flex items-center justify-between px-3 pb-1 text-[11px] text-on-surface-variant">
        <span>Jobs</span>
        <span className="font-code">{picked.length} selected</span>
      </div>
      <ul className="max-h-64 overflow-y-auto">
        {rows.map((j) => {
          const holding = sectionHoldingJob(allSectionGroups, groupId, j.id);
          const disabled = Boolean(holding);
          return (
            <li key={j.id}>
              <label className={`flex items-start gap-2 px-3 py-2 ${disabled ? "opacity-50" : "cursor-pointer hover:bg-surface-container-low"}`}>
                <input
                  type="checkbox"
                  className="mt-1"
                  disabled={disabled}
                  checked={picked.includes(j.id)}
                  onChange={(e) => setPicked((prev) => (e.target.checked ? [...prev, j.id] : prev.filter((x) => x !== j.id)))}
                />
                <span>
                  <span className="block text-sm text-on-surface">{j.name}</span>
                  <span className="block text-[11px] text-on-surface-variant">
                    {groupName.get(j.homeGroupId)}
                    {holding ? ` · in ${holding.name}` : ""}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="flex justify-between gap-2 border-t border-outline-variant/30 p-2">
        <DangerButton onClick={onCancel}>Cancel</DangerButton>
        <PrimaryButton icon="check" disabled={!picked.length} onClick={() => onAdd(picked)}>
          Add {picked.length} job{picked.length === 1 ? "" : "s"}
        </PrimaryButton>
      </div>
    </div>
  );
}

function InlineName({
  label,
  initial,
  busy,
  onCancel,
  onSave,
}: {
  label: string;
  initial: string;
  busy: boolean;
  onCancel: () => void;
  onSave: (name: string) => void;
}) {
  const [v, setV] = useState(initial);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-outline-variant/40 bg-white p-3">
      <input
        autoFocus
        aria-label={label}
        placeholder={label}
        value={v}
        onChange={(e) => setV(e.target.value)}
        className="min-w-[220px] flex-1 rounded-lg border border-outline-variant/50 px-3 py-1.5 text-sm"
      />
      <DangerButton onClick={onCancel} disabled={busy}>
        Cancel
      </DangerButton>
      <PrimaryButton disabled={busy || !v.trim()} onClick={() => onSave(v.trim())}>
        Save
      </PrimaryButton>
    </div>
  );
}

function SectionForm({
  title,
  initial,
  busy,
  onCancel,
  onSave,
}: {
  title: string;
  initial: { name: string; description: string; iconKey: string };
  busy: boolean;
  onCancel: () => void;
  onSave: (input: { name: string; description: string; iconKey: string }) => void;
}) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [iconKey, setIconKey] = useState(initial.iconKey);
  const ok = name.trim() && description.trim();
  return (
    <div className="mt-3 space-y-2 rounded-xl border border-outline-variant/40 bg-white p-3">
      <p className="text-sm font-semibold text-on-surface">{title}</p>
      <input
        aria-label="Section name"
        placeholder="Section name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded-lg border border-outline-variant/50 px-3 py-1.5 text-sm"
      />
      <textarea
        aria-label="Description"
        rows={2}
        placeholder="One plain sentence — shown when someone taps ⓘ while logging."
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="w-full rounded-lg border border-outline-variant/50 px-3 py-1.5 text-sm"
      />
      <div className="flex flex-wrap gap-2">
        {JOB_ICON_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            aria-label={`Icon ${k}`}
            aria-pressed={iconKey === k}
            onClick={() => setIconKey(k)}
            className={`flex h-9 w-9 items-center justify-center rounded-lg border ${
              iconKey === k ? "border-secondary bg-secondary-container text-secondary" : "border-outline-variant/40 bg-[#eeedf6] text-on-surface-variant"
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">{partIconKey(k)}</span>
          </button>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <DangerButton onClick={onCancel} disabled={busy}>
          Cancel
        </DangerButton>
        <PrimaryButton disabled={busy || !ok} onClick={() => onSave({ name: name.trim(), description: description.trim(), iconKey })}>
          Save
        </PrimaryButton>
      </div>
    </div>
  );
}
