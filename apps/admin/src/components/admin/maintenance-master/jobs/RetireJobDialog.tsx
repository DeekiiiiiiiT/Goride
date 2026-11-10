/** DM4 — Retire job dialog. Look: S43d (dialog only). Content: plan Layer 3 (Keep / Drop / Add for S43d). */
import { useState } from "react";
import { toast } from "sonner";
import { retireJob, type Job, type JobsPayload } from "./jobsApi";
import { sectionsOfJob } from "./jobsModel";
import { DangerSolidButton, Modal, OutlineButton } from "./jobsUi";

export function RetireJobDialog({
  token,
  data,
  job,
  onClose,
  onRetired,
}: {
  token: string;
  data: JobsPayload;
  job: Job;
  onClose: () => void;
  onRetired: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const sections = sectionsOfJob(data, job.id);
  const links = job.alsoDo.length + job.suggestedBy.length;

  const confirm = async () => {
    setBusy(true);
    try {
      await retireJob(token, job.id);
      toast.success(`${job.name} retired`);
      onRetired();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Couldn't retire");
    } finally {
      setBusy(false);
    }
  };

  const lines: Array<{ icon: string; title: string; text: string }> = [
    { icon: "visibility_off", title: "Hidden from logging in the apps", text: "No one can pick it when logging." },
    {
      icon: "content_cut",
      title: `Removed from ${sections.length} section${sections.length === 1 ? "" : "s"}`,
      text: sections.length ? `It's taken out of ${sections.map((s) => s.name).join(", ")}.` : "It isn't in any section.",
    },
    {
      icon: "link_off",
      title: `Removed from ${links} 'also do' link${links === 1 ? "" : "s"}`,
      text: `It's taken out of ${links} link${links === 1 ? "" : "s"}, both ways.`,
    },
    { icon: "history", title: "Old service logs keep it", text: "Past service logs still show it." },
  ];

  return (
    <Modal labelledBy="mm-retire-job-title" onClose={() => !busy && onClose()} width="max-w-[480px]">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary-container text-secondary">
          <span className="material-symbols-outlined">warning</span>
        </div>
        <div>
          <h2 id="mm-retire-job-title" className="text-lg font-semibold text-on-surface">
            Retire {job.name}?
          </h2>
          <p className="font-code text-[11px] text-on-surface-variant">
            {job.code}
            {job.opCode ? ` · ${job.opCode}` : ""}
          </p>
        </div>
      </div>
      <ul className="mt-4 space-y-3 rounded-xl bg-[#f4f3fa] p-4">
        {lines.map((l) => (
          <li key={l.title} className="flex items-start gap-3">
            <span className="material-symbols-outlined text-[18px] text-on-surface-variant">{l.icon}</span>
            <span>
              <span className="block text-sm font-medium text-on-surface">{l.title}</span>
              <span className="block text-xs text-on-surface-variant">{l.text}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-5 flex justify-end gap-2">
        <OutlineButton onClick={onClose} disabled={busy}>
          Keep it
        </OutlineButton>
        <DangerSolidButton icon="inventory_2" disabled={busy} onClick={() => void confirm()}>
          {busy ? "Retiring…" : "Retire job"}
        </DangerSolidButton>
      </div>
    </Modal>
  );
}
