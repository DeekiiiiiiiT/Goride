/**
 * A7 — Saved, ported from docs/stitch/dominion-add-parts-self-serve/saved_confirmation_next_steps/code.html.
 * Dropped (audit A7): "Committed", batch codes, "Fast track", "30 days", checksum, session audit trail.
 */
import { PartsButton } from "../../PartsButton";
import { MaterialIcon } from "../../import/MaterialIcon";
import type { CatalogPageDraft, PartTypeRow } from "../addPartsTypes";
import { defaultPartNamePreview } from "../addPartsShared";
import { D_CARD, D_MONO, D_MUTED, D_TXT, DPill } from "./dominionKit";

export function CatalogSaved({
  saveResult,
  draft,
  types = [],
  onAddMoreFromPage,
  onSameCarsNewPage,
  onFindParts,
  onHome,
  onUndo,
}: {
  saveResult: Record<string, unknown>;
  draft: CatalogPageDraft;
  types?: PartTypeRow[];
  onAddMoreFromPage: () => void;
  onSameCarsNewPage: () => void;
  onFindParts: () => void;
  onHome: () => void;
  onUndo: () => void;
}) {
  const rows = draft.partRows.filter((r) => r.partNumber.trim());
  const partCount = Number(saveResult.partCount ?? rows.length ?? 0);
  const carCount = Number(saveResult.carCount ?? draft.vehicleListings.length ?? 0);
  const carsLine = draft.vehicleListings
    .map((v) => `${v.model ?? v.label ?? "Car"}${v.diffLabel ? ` ${v.diffLabel.split(" · ")[0]}` : ""}`)
    .join(" + ");

  function savedName(r: CatalogPageDraft["partRows"][number]): string {
    const t = r.partType ?? types.find((x) => x.id === r.partTypeId);
    return t ? defaultPartNamePreview(t.name, t.positionScheme, r.position, r.side, r.catalogueNumber) : "Part";
  }

  const nextCard = (opts: { icon: string; title: string; body: string; onClick: () => void; primary?: boolean }) => (
    <button
      type="button"
      onClick={opts.onClick}
      className={`group flex w-full items-center gap-4 rounded-xl border p-5 text-left transition-all ${
        opts.primary
          ? "border-[#0153dc] bg-[#0153dc] text-white hover:bg-[#0147bd]"
          : "border-[#c5c6d0] bg-[#f3f4fb] hover:border-[#0153dc] dark:border-[#1e293b] dark:bg-[#0b1220]"
      }`}
    >
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${opts.primary ? "bg-white/15" : "bg-white dark:bg-[#111a2e]"}`}>
        <MaterialIcon name={opts.icon} className={`text-[22px] ${opts.primary ? "text-white" : "text-[#30323b] dark:text-[#e2e8f0]"}`} />
      </span>
      <span className="flex-1">
        <span className={`block text-[18px] font-semibold ${opts.primary ? "text-white" : D_TXT}`}>{opts.title}</span>
        <span className={`block text-[14px] ${opts.primary ? "text-white/85" : D_MUTED}`}>{opts.body}</span>
      </span>
      <MaterialIcon name="arrow_forward" className={`text-[22px] ${opts.primary ? "text-white" : "text-[#5d5f68]"}`} />
    </button>
  );

  return (
    <div className="parts-database-stitch mx-auto w-full max-w-[900px] px-margin py-space-lg">
      <div className={`${D_CARD} flex flex-col gap-8 p-6 sm:p-10`}>
        <div className="flex items-start gap-5">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#e6f4ea] dark:bg-[#14532d]/40">
            <MaterialIcon name="check" className="text-[36px] text-[#006e31] dark:text-[#4ade80]" />
          </span>
          <div>
            <h2 className={`text-[28px] font-semibold tracking-tight ${D_TXT}`}>
              {partCount} part{partCount === 1 ? "" : "s"} saved to {carCount} car{carCount === 1 ? "" : "s"}
            </h2>
            <p className={`mt-1 text-[16px] ${D_MUTED}`}>Every part and car is in. You can undo the whole save from Recently added.</p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p className={`text-[14px] font-semibold ${D_MUTED}`}>Saved</p>
          <div className="flex flex-col gap-2 rounded-xl bg-[#f3f4fb] p-2 dark:bg-[#0b1220]">
            {rows.map((r) => (
              <div key={r.clientId} className="flex flex-wrap items-center gap-3 rounded-lg bg-white px-4 py-3 dark:bg-[#111a2e]">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e6f4ea] dark:bg-[#14532d]/40">
                  <MaterialIcon name="check" className="text-[18px] text-[#006e31] dark:text-[#4ade80]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-[16px] font-semibold ${D_TXT}`}>{savedName(r)}</p>
                  <p className={`text-[14px] ${D_MONO} ${D_MUTED}`}>{r.partNumber}</p>
                </div>
                {carsLine ? <DPill tone="blue">{r.existingPartId ? "Cars added: " : ""}{carsLine}</DPill> : null}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <p className={`text-[14px] font-semibold ${D_MUTED}`}>What next?</p>
          {nextCard({
            icon: "playlist_add",
            title: "Add more from this page",
            body: "Keeps the page and the cars, clears the part rows.",
            onClick: onAddMoreFromPage,
            primary: true,
          })}
          {nextCard({
            icon: "restart_alt",
            title: "Same cars, new page",
            body: "Keeps the cars and asks for a new catalogue page.",
            onClick: onSameCarsNewPage,
          })}
          {nextCard({
            icon: "manage_search",
            title: "See them in Find parts",
            body: "Open the parts you just saved.",
            onClick: onFindParts,
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#f3f4fb] px-5 py-4 dark:bg-[#0b1220]">
          <span className={`flex items-center gap-2 text-[15px] ${D_MUTED}`}>
            <MaterialIcon name="history" className="text-[20px]" /> Changed your mind? Undo from Recently added.
          </span>
          <div className="flex flex-wrap gap-2">
            <PartsButton variant="secondary" onClick={onHome}>Back to Add parts</PartsButton>
            <PartsButton variant="danger" onClick={onUndo}>
              <MaterialIcon name="undo" className="text-[18px]" /> Undo save
            </PartsButton>
          </div>
        </div>
      </div>
    </div>
  );
}
