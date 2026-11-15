/**
 * Service items — "May need" section of the Edit job drawer.
 * Look: Stitch screen 2 (edit_job_drawer_may_need_list) + screen 9 states. Content: audit 9c.
 * Links save straight away through their own routes; "Save job" only saves the job's own fields.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  removeMayNeed,
  reorderMayNeed,
  updateMayNeed,
  type ItemNeed,
  type Job,
  type JobsPayload,
  type MayNeedItem,
  type Supply,
} from "./jobsApi";
import { moveId } from "./jobsModel";
import { formatQty, parseQtyHint, qtyLabel } from "./mayNeedModel";
import { DangerSolidButton, Modal } from "./jobsUi";
import {
  KindPill,
  NeedPill,
  NeedSwitch,
  RedOutlineButton,
  RedSoftButton,
  SoftButton,
  BlueButton,
  T,
  WhiteButton,
  supplyIcon,
} from "./serviceItemsUi";
import { AddMayNeedDialog } from "./AddMayNeedDialog";

type Props = {
  token: string;
  data: JobsPayload;
  /** null while adding a new job (not saved yet). */
  job: Job | null;
  canWrite: boolean;
  /** Scrolls the drawer to the Also do card (screen 9 "View 'Also do'"). */
  onViewAlsoDo: () => void;
  /** Tells the Jobs tab to refresh its counts in the background. */
  onChanged: () => void;
  onSupplyCreated: (s: Supply) => void;
};

type Failure = { message: string; retry: () => Promise<void> };

export function MayNeedSection({ token, data, job, canWrite, onViewAlsoDo, onChanged, onSupplyCreated }: Props) {
  const [items, setItems] = useState<MayNeedItem[]>(job?.items ?? []);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<MayNeedItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const focusAfterMove = useRef<string | null>(null);
  const moveButtons = useRef(new Map<string, HTMLButtonElement | null>());

  useEffect(() => {
    if (!focusAfterMove.current) return;
    const btn = moveButtons.current.get(focusAfterMove.current);
    focusAfterMove.current = null;
    if (btn && !btn.disabled) btn.focus();
  }, [items]);

  const suppliesById = useMemo(() => new Map(data.supplies.map((s) => [s.id, s])), [data.supplies]);
  const jobsById = useMemo(() => new Map(data.jobs.map((j) => [j.id, j])), [data.jobs]);

  const iconFor = (it: MayNeedItem) =>
    it.kind === "supply" ? supplyIcon(suppliesById.get(it.itemId)?.iconKey) : supplyIcon(jobsById.get(it.itemId)?.iconKey);

  /** Runs a save; on failure shows the screen-9 error card with Try again. */
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setFailure(null);
    try {
      await action();
      onChanged();
    } catch (e: unknown) {
      setFailure({ message: e instanceof Error ? e.message : "Something went wrong.", retry: () => run(action) });
    } finally {
      setBusy(false);
    }
  };

  const saveOrder = (next: MayNeedItem[], focusKey?: string) => {
    if (!job) return;
    const prev = items;
    if (focusKey) focusAfterMove.current = focusKey;
    setItems(next);
    void run(async () => {
      try {
        await reorderMayNeed(token, job.id, next.map((i) => i.linkId));
      } catch (e) {
        setItems(prev);
        throw e;
      }
    });
  };

  const move = (it: MayNeedItem, dir: -1 | 1) => {
    const ids = moveId(
      items.map((i) => i.linkId),
      it.linkId,
      dir,
    );
    const byId = new Map(items.map((i) => [i.linkId, i]));
    saveOrder(
      ids.map((id) => byId.get(id)!),
      `${it.linkId}:${dir}`,
    );
  };

  const dropOn = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const ids = items.map((i) => i.linkId).filter((id) => id !== dragId);
    ids.splice(ids.indexOf(targetId), 0, dragId);
    const byId = new Map(items.map((i) => [i.linkId, i]));
    setDragId(null);
    saveOrder(ids.map((id) => byId.get(id)!));
  };

  const confirmRemove = (it: MayNeedItem) => {
    setRemoving(null);
    void run(async () => {
      await removeMayNeed(token, it.linkId);
      setItems((prev) => prev.filter((i) => i.linkId !== it.linkId));
      toast.success(`${it.name} removed from May need`);
    });
  };

  const alsoDoClash = failure ? /also do/i.test(failure.message) : false;

  return (
    <div className="space-y-3" data-testid="may-need-section">
      <div className="flex items-center gap-2">
        <span className={`${T.headlineMd} text-[#161b27]`}>May need</span>
        <span className={`rounded-full bg-[#dae2fd] px-2.5 py-0.5 ${T.labelSm} font-semibold text-[#5c647a]`}>
          {items.length} item{items.length === 1 ? "" : "s"}
        </span>
      </div>
      <p className={`${T.bodySm} leading-relaxed text-[#565e74]`}>
        Parts and supplies used up doing this job. Suggested while logging, never ticked automatically. Separate work goes in
        Also do.
      </p>

      {failure ? (
        <div role="alert" className="flex flex-col gap-2 rounded-xl bg-[#ffdad6]/50 p-3.5 shadow-[inset_0_0_0_1px_#fca5a5]">
          <div className="flex items-start gap-2">
            <span className="material-symbols-outlined text-[18px] text-[#ba1a1a]">error</span>
            <div className="min-w-0">
              <p className={`${T.labelMd} font-semibold text-[#93000a]`}>Couldn&apos;t save this item.</p>
              <p className={`${T.bodySm} text-[#93000a]`}>{failure.message}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {alsoDoClash ? (
              <WhiteButton icon="arrow_upward" onClick={onViewAlsoDo}>
                View &ldquo;Also do&rdquo;
              </WhiteButton>
            ) : null}
            <WhiteButton icon="refresh" disabled={busy} onClick={() => void failure.retry()}>
              Try again
            </WhiteButton>
          </div>
        </div>
      ) : null}

      {!job ? (
        <div className="rounded-xl border border-dashed border-[#c3c6d7] bg-[#f1f3ff]/60 px-4 py-3">
          <p className={`${T.bodySm} text-[#565e74]`}>Save the job first, then add items.</p>
        </div>
      ) : (
        <>
          {items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#c3c6d7] bg-[#f1f3ff]/60 px-4 py-5 text-center">
              <span className="material-symbols-outlined text-[24px] text-[#737686]">inventory_2</span>
              <p className={`${T.labelMd} mt-1 text-[#161b27]`}>No items yet</p>
              <p className={`${T.bodySm} text-[#565e74]`}>
                Add the parts, consumables, and shop supplies this routine job typically consumes or may require under inspection.
              </p>
            </div>
          ) : (
            <ul className="space-y-2.5" aria-label="May need items">
              {items.map((it, idx) => {
                const retired = it.itemRetired;
                const firstActive = idx === 0;
                const lastActive = idx === items.length - 1;
                const qty = qtyLabel(it);
                return (
                  <li
                    key={it.linkId}
                    draggable={canWrite && !busy && editingId === null}
                    onDragStart={() => setDragId(it.linkId)}
                    onDragOver={(e) => {
                      if (dragId) e.preventDefault();
                    }}
                    onDrop={() => dropOn(it.linkId)}
                    onDragEnd={() => setDragId(null)}
                    data-testid={`may-need-row-${it.linkId}`}
                    className={
                      retired
                        ? "flex flex-col gap-2.5 rounded-xl bg-[#ffffff]/60 p-3.5 opacity-60 transition-opacity hover:opacity-90"
                        : `flex flex-col gap-2.5 rounded-xl bg-[#ffffff] p-3.5 shadow-sm transition-shadow hover:shadow-md ${
                            dragId === it.linkId ? "ring-2 ring-[#0153dc]/40" : ""
                          }`
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <div
                          className={
                            retired
                              ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e4e8f8] text-[#737686]"
                              : "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#dae2fd]/70 text-[#003ea9]"
                          }
                        >
                          <span className="material-symbols-outlined text-[22px]">{retired ? "archive" : iconFor(it)}</span>
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`truncate ${T.labelMd} font-semibold ${retired ? "text-[#565e74] line-through" : "text-[#161b27]"}`}
                            >
                              {it.name}
                            </span>
                            <KindPill kind={it.kind} retired={retired} />
                            <NeedPill need={it.need} retired={retired} />
                            {qty && !retired ? (
                              <span className={`rounded-full bg-[#f1f3ff] px-2 py-0.5 ${T.labelSm} text-[#565e74]`}>{qty}</span>
                            ) : null}
                            {retired ? (
                              <span
                                className={`flex items-center gap-1 rounded-full bg-[#dee2f3] px-2.5 py-0.5 ${T.labelSm} font-semibold text-[#434655]`}
                              >
                                <span className="material-symbols-outlined text-[14px]">archive</span>
                                Retired · hidden while logging
                              </span>
                            ) : null}
                          </div>
                          {it.note ? (
                            <p className={`${T.bodySm} mt-1 ${retired ? "text-[#737686]" : "text-[#565e74]"}`}>{it.note}</p>
                          ) : null}
                        </div>
                      </div>
                      {canWrite ? (
                        <div className="flex shrink-0 items-center gap-1.5">
                          {!retired ? (
                            <SoftButton
                              disabled={busy}
                              aria-label={`Edit ${it.name}`}
                              onClick={() => setEditingId(editingId === it.linkId ? null : it.linkId)}
                            >
                              Edit
                            </SoftButton>
                          ) : null}
                          <RedSoftButton disabled={busy} aria-label={`Remove ${it.name}`} onClick={() => setRemoving(it)}>
                            Remove
                          </RedSoftButton>
                          <div className="flex items-center rounded-lg bg-[#f1f3ff] p-0.5">
                            <button
                              type="button"
                              ref={(el) => moveButtons.current.set(`${it.linkId}:-1`, el)}
                              aria-label={`Move ${it.name} up`}
                              disabled={busy || firstActive}
                              onClick={() => move(it, -1)}
                              className="flex h-6 w-6 items-center justify-center rounded text-[#565e74] transition-colors hover:bg-[#e9edfe] hover:text-[#161b27] disabled:cursor-not-allowed disabled:text-[#737686]/40"
                            >
                              <span className="material-symbols-outlined text-[16px]">arrow_upward</span>
                            </button>
                            <button
                              type="button"
                              ref={(el) => moveButtons.current.set(`${it.linkId}:1`, el)}
                              aria-label={`Move ${it.name} down`}
                              disabled={busy || lastActive}
                              onClick={() => move(it, 1)}
                              className="flex h-6 w-6 items-center justify-center rounded text-[#565e74] transition-colors hover:bg-[#e9edfe] hover:text-[#161b27] disabled:cursor-not-allowed disabled:text-[#737686]/40"
                            >
                              <span className="material-symbols-outlined text-[16px]">arrow_downward</span>
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                    {editingId === it.linkId ? (
                      <EditLinkForm
                        item={it}
                        busy={busy}
                        onCancel={() => setEditingId(null)}
                        onSave={(patch) =>
                          void run(async () => {
                            const res = await updateMayNeed(token, it.linkId, patch);
                            setItems((prev) => prev.map((x) => (x.linkId === it.linkId ? res.item : x)));
                            setEditingId(null);
                            toast.success(`${it.name} saved`);
                          })
                        }
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}

          {canWrite ? (
            <button
              type="button"
              onClick={() => setAdding(true)}
              disabled={busy}
              className={`flex w-full items-center justify-center gap-2 rounded-xl bg-[#ffffff] py-2.5 ${T.labelMd} font-semibold text-[#161b27] shadow-sm transition-colors hover:bg-[#f1f3ff] disabled:opacity-40`}
            >
              <span className="material-symbols-outlined text-[18px] text-[#003ea9]">add_circle</span>
              <span>Add item</span>
            </button>
          ) : null}
        </>
      )}

      {removing ? (
        <Modal labelledBy="mm-may-need-remove-title" onClose={() => setRemoving(null)}>
          <h3 id="mm-may-need-remove-title" className={`${T.headlineMd} text-[#161b27]`}>
            Remove {removing.name}?
          </h3>
          <p className={`${T.bodySm} mt-2 text-[#565e74]`}>
            It stops being suggested for {job?.name}. Services already logged keep it.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <RedOutlineButton onClick={() => setRemoving(null)}>Cancel</RedOutlineButton>
            <DangerSolidButton icon="delete" onClick={() => confirmRemove(removing)}>
              Remove
            </DangerSolidButton>
          </div>
        </Modal>
      ) : null}

      {adding && job ? (
        <AddMayNeedDialog
          token={token}
          data={data}
          job={{ ...job, items }}
          onClose={() => setAdding(false)}
          onSupplyCreated={onSupplyCreated}
          onAdded={(item) => {
            setItems((prev) => [...prev, item]);
            setAdding(false);
            onChanged();
            toast.success(`${item.name} added to May need`);
          }}
        />
      ) : null}
    </div>
  );
}

function EditLinkForm({
  item,
  busy,
  onCancel,
  onSave,
}: {
  item: MayNeedItem;
  busy: boolean;
  onCancel: () => void;
  onSave: (patch: { need: ItemNeed; qtyHint: number | null; note: string | null }) => void;
}) {
  const [need, setNeed] = useState<ItemNeed>(item.need);
  const [qty, setQty] = useState(item.qtyHint != null ? formatQty(item.qtyHint) : "");
  const [note, setNote] = useState(item.note ?? "");
  const parsed = parseQtyHint(qty);
  const unit = item.kind === "supply" ? (qty.trim() === "1" ? item.unitLabelOne : item.unitLabelMany) : null;
  const field = `h-10 w-full rounded-lg border border-[#c3c6d7] bg-[#ffffff] px-3.5 ${T.bodySm} text-[#161b27] outline-none focus:border-[#0153dc] focus:ring-2 focus:ring-[#0153dc]/20`;
  return (
    <div className="space-y-3 border-t border-[#dee2f3]/60 pt-3">
      <div className="flex flex-col space-y-2">
        <span className={`${T.labelMd} text-[#161b27]`}>How often is it needed?</span>
        <NeedSwitch value={need} onChange={setNeed} disabled={busy} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <label className="flex flex-col space-y-1.5 sm:col-span-1">
          <span className={`${T.labelMd} text-[#161b27]`}>Usual quantity (optional)</span>
          <span className="relative">
            <input className={`${field} ${unit ? "pr-14" : ""}`} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
            {unit ? (
              <span className={`absolute right-3 top-1/2 -translate-y-1/2 rounded bg-[#e9edfe] px-2 py-0.5 ${T.labelSm} text-[#565e74]`}>{unit}</span>
            ) : null}
          </span>
        </label>
        <label className="flex flex-col space-y-1.5 sm:col-span-3">
          <span className={`${T.labelMd} text-[#161b27]`}>Note (optional)</span>
          <input className={field} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
      {!parsed.ok ? <p className={`${T.bodySm} text-[#ba1a1a]`}>{parsed.error}</p> : null}
      <div className="flex justify-end gap-2">
        <RedOutlineButton onClick={onCancel} disabled={busy}>
          Cancel
        </RedOutlineButton>
        <BlueButton
          icon="check"
          disabled={busy || !parsed.ok}
          onClick={() => parsed.ok && onSave({ need, qtyHint: parsed.value, note: note.trim() || null })}
        >
          Save
        </BlueButton>
      </div>
    </div>
  );
}
