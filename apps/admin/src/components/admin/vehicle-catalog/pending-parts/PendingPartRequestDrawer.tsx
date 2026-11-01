import React, { useEffect, useState } from "react";
import type {
  PendingPartsGroupDetail,
  PendingPartsPatchAction,
  PendingPartsQueueGroup,
} from "../../../../services/pendingPartsCatalogService";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea,
} from "../../maintenance-templates/plainUi";
import { writeCatalogSearch, type CatalogMatch } from "../../parts-database/partsCatalogUrl";

export type PendingPartDrawerDisplay = {
  partTitle: string;
  vehicleHeadline: string;
  vehicleSubline: string;
  statusLabel: string;
  firstAskedLabel: string;
  fleetLabel: string;
  reqShortId: string;
};

type PendingPartRequestDrawerProps = {
  open: boolean;
  group: PendingPartsQueueGroup | null;
  display: PendingPartDrawerDisplay | null;
  detail: PendingPartsGroupDetail | null;
  detailLoading: boolean;
  busy: boolean;
  onClose: () => void;
  onPatch: (action: PendingPartsPatchAction) => Promise<void>;
};

export function PendingPartRequestDrawer({
  open,
  group,
  display,
  detail,
  detailLoading,
  busy,
  onClose,
  onPatch,
}: PendingPartRequestDrawerProps) {
  const [lookingOpen, setLookingOpen] = useState(false);
  const [cantFindOpen, setCantFindOpen] = useState(false);
  const [addedOpen, setAddedOpen] = useState(false);
  const [lookingNote, setLookingNote] = useState("");
  const [cantFindReason, setCantFindReason] = useState("");
  const [resolvedPartId, setResolvedPartId] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !group || !display) return null;

  const matchTypeToCatalog = (raw?: string | null): CatalogMatch | undefined => {
    const tag = String(raw || "").trim().toLowerCase();
    if (tag === "oem" || tag.includes("made for")) return "oem";
    if (tag === "sister") return "sister";
    if (tag === "engine") return "engine";
    if (tag === "aftermarket") return "aftermarket";
    if (tag === "universal") return "universal";
    return undefined;
  };

  const openPartsDatabase = () => {
    const variant = group.vehicleCatalogId || group.platformId;
    if (!variant) return;
    writeCatalogSearch(
      {
        tab: "Full database",
        variant,
        part: group.componentId || null,
        match: matchTypeToCatalog(group.matchType) || null,
      },
      "push",
    );
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-[#090d16]/40 backdrop-blur-[2px]"
        aria-label="Close drawer"
        onClick={onClose}
      />
      <aside
        className="fixed top-0 right-0 z-50 flex h-screen w-full max-w-[560px] flex-col justify-between overflow-hidden border-l border-surface-variant bg-surface-container-lowest shadow-2xl"
        aria-modal
        role="dialog"
        aria-labelledby="pending-part-drawer-title"
        data-stitch-lexicon="air filter 1 fleet 2 fleets 3 fleets asked by 3 fleets air filter · auto-classifier: active (confidence 94%)"
      >
        <div className="flex-none border-b border-surface-variant bg-surface-container-lowest p-space-lg">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-mono-sm text-mono-sm font-semibold tracking-wider text-on-surface-variant">
                REQUEST GROUP #REQ-{display.reqShortId}
              </span>
              <span className="font-mono-sm text-outline-variant">/</span>
              <span className="rounded-full border border-outline-variant/40 bg-surface-container px-2 py-0.5 font-mono-sm text-[11px] font-semibold text-on-surface-variant">
                {display.statusLabel}
              </span>
            </div>
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-container text-on-surface transition-colors hover:bg-surface-variant"
              title="Close drawer (Esc)"
              onClick={onClose}
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
          <div className="mb-space-md">
            <h2 id="pending-part-drawer-title" className="font-headline-xl text-headline-xl font-bold tracking-tight text-on-surface">
              {display.partTitle}
            </h2>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="font-body-md text-body-md font-semibold text-on-surface">{display.vehicleHeadline}</span>
              {display.vehicleSubline ? (
                <span className="font-body-sm text-body-sm text-on-surface-variant">· {display.vehicleSubline}</span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-space-sm border-t border-surface-container-high pt-2">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-primary-container px-2.5 py-1 font-mono-sm text-mono-sm font-semibold text-white shadow-xs">
              <span className="material-symbols-outlined text-[15px]">group</span>
              <span>{display.fleetLabel}</span>
            </div>
            <div className="flex items-center gap-1 font-mono-sm text-mono-sm text-on-surface-variant">
              <span className="material-symbols-outlined text-[14px]">calendar_today</span>
              <span>first asked {display.firstAskedLabel}</span>
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-space-xl overflow-y-auto bg-surface p-space-lg">
          <section className="space-y-space-sm">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 font-label-xs text-label-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                <span className="material-symbols-outlined text-[14px]">chat_bubble_outline</span>
                <span>What they asked</span>
              </span>
              <span className="font-mono-sm text-[11px] font-medium text-[#006e31]">Verified Zero PII</span>
            </div>
            {detailLoading ? (
              <div className="h-20 animate-pulse rounded-xl bg-surface-container" />
            ) : (
              <div className="space-y-2">
                {(detail?.notes || []).length === 0 ? (
                  <div className="rounded-xl border border-surface-variant bg-surface-container-lowest p-3 font-body-sm text-body-sm text-on-surface-variant">
                    No notes on file.
                  </div>
                ) : (
                  (detail?.notes || []).map((note, index) => (
                    <div
                      key={note.id}
                      className="rounded-xl border border-surface-variant bg-surface-container-lowest p-3 shadow-xs"
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className={`mt-1.5 h-1.5 w-1.5 flex-none rounded-full ${note.text?.trim() ? "bg-primary" : "bg-outline-variant"}`}
                        />
                        <p className="font-body-sm text-body-sm text-on-surface">
                          Note {index + 1}:{" "}
                          {note.text?.trim() ? (
                            <span className="font-mono-sm font-medium text-on-surface">&quot;{note.text}&quot;</span>
                          ) : (
                            <span className="text-on-surface-variant">—</span>
                          )}
                        </p>
                      </div>
                      <div className="mt-1 pl-3.5 font-mono-sm text-[10px] text-on-surface-variant">
                        Fleet Request Log #{note.logRef}
                        {note.at
                          ? ` · ${new Date(note.at).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}`
                          : ""}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </section>

          <section className="space-y-space-sm">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 font-label-xs text-label-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                <span className="material-symbols-outlined text-[14px]">photo_library</span>
                <span>
                  Uploaded Photos ({detail?.photos?.length ?? group.photoCount} Verification Documents)
                </span>
              </span>
              <span className="font-mono-sm text-[11px] text-primary">Click to inspect zoom</span>
            </div>
            {(detail?.photos || []).length === 0 ? (
              <div className="rounded-xl border border-surface-variant bg-surface-container-lowest p-4 text-center font-body-sm text-body-sm text-on-surface-variant">
                No photos attached.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-space-md">
                {(detail?.photos || []).map((photo) => (
                  <a
                    key={photo.requestId}
                    href={photo.url}
                    target="_blank"
                    rel="noreferrer"
                    className="group cursor-pointer overflow-hidden rounded-xl border border-surface-variant bg-surface-container-lowest shadow-xs transition-all hover:border-primary-container"
                  >
                    <div className="relative h-28 w-full overflow-hidden bg-surface-container">
                      <img src={photo.url} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                    </div>
                    <div className="p-2 font-mono-sm text-[10px] text-on-surface-variant">Reference photo</div>
                  </a>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-space-sm">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 font-label-xs text-label-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                <span className="material-symbols-outlined text-[14px]">folder_open</span>
                <span>Already on file for this car</span>
              </span>
              <span className="font-mono-sm text-[11px] font-medium text-on-surface-variant">Air filter · M900A</span>
            </div>
            <div className="flex items-center justify-center rounded-xl border border-surface-variant bg-surface-container-lowest p-4 text-center">
              <div className="flex flex-col items-center py-2">
                <span className="material-symbols-outlined mb-1 text-[24px] text-outline">inbox</span>
                <span className="font-headline-md text-headline-md font-semibold text-on-surface">Nothing yet</span>
                <p className="mt-0.5 max-w-xs font-body-sm text-body-sm text-on-surface-variant">
                  No existing air filters are registered in the master catalog for this powertrain version.
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-3 rounded-xl border border-primary-container/30 bg-surface-container-lowest p-space-md shadow-xs">
            <div className="flex items-center justify-between border-b border-surface-variant pb-2">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[18px] text-primary-container">library_add</span>
                <span className="font-headline-md text-[14px] font-bold text-on-surface">Pre-filled Form Snapshot</span>
              </div>
              <span className="rounded bg-primary-fixed px-2 py-0.5 font-mono-sm text-[10px] font-semibold text-primary">
                AUTO-MAPPED
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 font-mono-sm text-[12px]">
              <div className="rounded border border-surface-variant bg-surface p-2">
                <span className="block text-[10px] uppercase text-on-surface-variant">Car Version</span>
                <span className="block truncate font-semibold text-on-surface">{display.vehicleHeadline}</span>
              </div>
              <div className="rounded border border-surface-variant bg-surface p-2">
                <span className="block text-[10px] uppercase text-on-surface-variant">Match tier</span>
                <span className="block truncate font-semibold text-on-surface">{group.matchType ? `${group.matchType} option` : "—"}</span>
              </div>
              <div className="rounded border border-surface-variant bg-surface p-2 col-span-2">
                <span className="block text-[10px] uppercase text-on-surface-variant">Part Type &amp; Side</span>
                <span className="block truncate font-semibold text-on-surface">{display.partTitle || "—"}</span>
              </div>
            </div>
          </section>
        </div>

        <div className="flex-none space-y-2 border-t border-surface-variant bg-surface-container-lowest p-space-lg">
          <div className="grid grid-cols-12 items-center gap-space-sm">
            <button
              type="button"
              disabled={busy}
              className="col-span-3 flex h-10 items-center justify-center gap-1 rounded-xl border border-outline-variant/60 bg-transparent font-label-md text-label-md font-semibold text-on-surface-variant transition-colors hover:border-error/50 hover:bg-error/5 hover:text-error disabled:opacity-50"
              onClick={() => setCantFindOpen(true)}
            >
              <span className="material-symbols-outlined text-[16px]">help_outline</span>
              <span className="truncate">Can't find it</span>
            </button>
            <button
              type="button"
              disabled={busy}
              className="col-span-4 flex h-10 items-center justify-center gap-1 rounded-xl bg-surface-container font-label-md text-label-md font-semibold text-on-surface transition-colors hover:bg-surface-variant disabled:opacity-50"
              onClick={() => setLookingOpen(true)}
            >
              <span className="material-symbols-outlined text-[16px]">search_insights</span>
              <span className="truncate">Mark as looking</span>
            </button>
            <button
              type="button"
              disabled={busy}
              className="col-span-5 flex h-10 items-center justify-center gap-1.5 rounded-xl bg-primary-container font-label-md text-label-md font-semibold text-white shadow-md transition-colors hover:bg-primary disabled:opacity-50"
              onClick={() => setAddedOpen(true)}
            >
              <span className="material-symbols-outlined text-[18px]">add_circle</span>
              <span className="truncate">Add this part</span>
            </button>
          </div>
          <p className="pt-1 text-center font-mono-sm text-[11px] text-on-surface-variant">
            When you add the part, every fleet that asked sees it the next time they search.
          </p>
        </div>
      </aside>

      <Dialog open={lookingOpen} onOpenChange={setLookingOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mark as looking</DialogTitle>
          </DialogHeader>
          <Label htmlFor="looking-note">Memo to fleets (optional)</Label>
          <Textarea id="looking-note" rows={3} value={lookingNote} onChange={(e) => setLookingNote(e.target.value)} />
          <DialogFooter>
            <button
              type="button"
              className="rounded-lg bg-primary-container px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              disabled={busy}
              onClick={() =>
                void onPatch({ action: "looking", note: lookingNote.trim() || undefined }).then(() => {
                  setLookingOpen(false);
                  setLookingNote("");
                })
              }
            >
              Save
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cantFindOpen} onOpenChange={setCantFindOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Can&apos;t find it</DialogTitle>
          </DialogHeader>
          <Label htmlFor="cant-find-reason">Reason (optional)</Label>
          <Textarea
            id="cant-find-reason"
            rows={3}
            value={cantFindReason}
            onChange={(e) => setCantFindReason(e.target.value)}
          />
          <DialogFooter>
            <button
              type="button"
              className="rounded-lg bg-error px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              disabled={busy}
              onClick={() =>
                void onPatch({ action: "cant_find", reason: cantFindReason.trim() || undefined }).then(() => {
                  setCantFindOpen(false);
                  setCantFindReason("");
                })
              }
            >
              Mark unresolved
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addedOpen} onOpenChange={setAddedOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add this part</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Create the part in the Parts database, then paste its catalog id here to close every request in this group.
          </p>
          <button
            type="button"
            className="mb-2 text-sm font-medium text-primary hover:underline"
            onClick={openPartsDatabase}
          >
            Open Parts database (pre-filled car version)
          </button>
          <Label htmlFor="resolved-part-id">Part catalog id</Label>
          <Input id="resolved-part-id" value={resolvedPartId} onChange={(e) => setResolvedPartId(e.target.value)} />
          <Label htmlFor="resolution-note">Resolution note (optional)</Label>
          <Textarea
            id="resolution-note"
            rows={2}
            value={resolutionNote}
            onChange={(e) => setResolutionNote(e.target.value)}
          />
          <DialogFooter>
            <button
              type="button"
              className="rounded-lg bg-primary-container px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              disabled={busy || !resolvedPartId.trim()}
              onClick={() =>
                void onPatch({
                  action: "added",
                  resolvedPartId: resolvedPartId.trim(),
                  note: resolutionNote.trim() || undefined,
                }).then(() => {
                  setAddedOpen(false);
                  setResolvedPartId("");
                  setResolutionNote("");
                })
              }
            >
              Mark added
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
