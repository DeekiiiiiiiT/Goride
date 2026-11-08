// Stitch A1
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../../ui/alert-dialog";
import { PartsButton } from "../PartsButton";
import { MaterialIcon } from "../import/MaterialIcon";
import { fetchRecentSelfServeParts, undoSelfServePart } from "./addPartsApi";
import { PartTypeIcon } from "./addPartsShared";

function formatRecentWhen(iso: unknown): string {
  if (!iso) return "";
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function AddPartsHome({
  onCatalog,
  onExtend,
  onFluid,
  onJustOne,
  onBulk,
  onPartTypes,
  owner,
}: {
  onCatalog: () => void;
  onExtend: () => void;
  onFluid: () => void;
  onJustOne: () => void;
  onBulk: () => void;
  onPartTypes: () => void;
  owner: boolean;
}) {
  const qc = useQueryClient();
  const recentQuery = useQuery({ queryKey: ["self-serve-recent"], queryFn: fetchRecentSelfServeParts });
  const items = recentQuery.data?.items ?? [];
  const [undoTarget, setUndoTarget] = useState<Record<string, unknown> | null>(null);

  return (
    <div className="parts-database-stitch add-parts-flow w-full max-w-[960px] mx-auto px-margin flex flex-col gap-space-lg py-space-lg">
      <div>
        <h2 className="text-[30px] font-semibold tracking-tight text-[#30323b] dark:text-[#e2e8f0]">What are you adding?</h2>
        <p className="mt-1 text-[16px] text-[#5d5f68] dark:text-[#94a3b8]">Pick how you found the part.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-space-lg items-stretch">
        <ChoiceCard
          recommended
          icon="menu_book"
          title="Parts from a catalogue page"
          description="Several parts from one diagram, for the same cars. One save."
          action="Start"
          onClick={onCatalog}
        />
        <ChoiceCard
          icon="directions_car"
          title="Add more cars to a part already on file"
          description="Type its number, then add the cars."
          action="Find the part"
          onClick={onExtend}
        />
        <ChoiceCard
          icon="water_drop"
          title="A fluid, oil or size part"
          description="Brake fluid, engine oil, wiper blades, bulbs, batteries — and which cars use it."
          action="Start"
          onClick={onFluid}
        />
      </div>
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-[#e6e7ee] bg-white px-5 py-4 shadow-[0_4px_16px_rgba(1,83,220,0.04)] dark:border-[#1e293b] dark:bg-[#111a2e]">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eef0f6] dark:bg-[#1e293b]"><MaterialIcon name="bolt" className="text-[22px]" /></span>
        <p className="flex-1 text-[16px] text-[#30323b] dark:text-[#e2e8f0]"><span className="font-semibold">Need to add a single part?</span> <span className="text-[#5d5f68] dark:text-[#94a3b8]">Same steps, one row.</span></p>
        <PartsButton variant="secondary" onClick={onJustOne}><MaterialIcon name="edit_note" className="text-[18px]" /> Just one part</PartsButton>
      </div>
      {owner ? (
        <div className="flex flex-wrap gap-2">
          <PartsButton variant="secondary" onClick={onBulk}>Bulk upload (advanced)</PartsButton>
          <PartsButton variant="secondary" onClick={onPartTypes}>Part types</PartsButton>
        </div>
      ) : (
        <PartsButton variant="secondary" onClick={onBulk}>Bulk upload (advanced)</PartsButton>
      )}
      <section className="rounded-2xl border border-[#e6e7ee] bg-white shadow-[0_4px_16px_rgba(1,83,220,0.04)] overflow-hidden dark:border-[#1e293b] dark:bg-[#111a2e]">
        <div className="flex items-start gap-3 p-6">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#eef0f6] dark:bg-[#1e293b]"><MaterialIcon name="history" className="text-[22px]" /></span>
          <div>
            <h3 className="flex items-center gap-2 text-[22px] font-semibold text-[#30323b] dark:text-[#e2e8f0]">Recently added <span className="rounded-md bg-[#eef0f6] px-2 py-0.5 text-[12px] font-medium text-[#5d5f68] dark:bg-[#1e293b] dark:text-[#94a3b8]">Last 5 saves</span></h3>
            <p className="mt-0.5 text-[14px] text-[#5d5f68] dark:text-[#94a3b8]">Undo removes the whole save.</p>
          </div>
        </div>
        <ul className="divide-y divide-[#e6e7ee] border-t border-[#e6e7ee] dark:divide-[#1e293b] dark:border-[#1e293b]">
          {items.length === 0 ? (
            <li className="p-space-lg font-body-sm text-on-surface-variant">Nothing saved yet from Add parts.</li>
          ) : items.slice(0, 5).map((row) => {
            const r = row as Record<string, unknown>;
            const summary = String(r.summaryLine ?? r.plainWordsSentence ?? `${r.partNumber ?? "Part"}`);
            const carHint = String(r.vehicleHint ?? "").trim();
            const iconKey = String(r.iconKey ?? "");
            const savedBy = String(r.promotedByName ?? r.savedBy ?? "").trim();
            return (
              <li key={String(r.batchId)} className="px-6 py-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <span className="w-12 h-12 rounded-xl bg-[#dbe1ff] flex items-center justify-center shrink-0 dark:bg-[#1e3a8a]/40">
                    {iconKey ? (
                      <PartTypeIcon iconKey={iconKey} className="text-[22px] text-primary-container" />
                    ) : (
                      <MaterialIcon name="inventory_2" className="text-[22px] text-primary-container" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[16px] font-semibold truncate text-[#30323b] dark:text-[#e2e8f0]">{summary}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      {carHint ? (
                        <span className="px-2 py-0.5 rounded-md bg-[#dbe1ff] text-[#0153dc] text-[13px] font-medium truncate max-w-[240px] dark:bg-[#1e3a8a]/40 dark:text-[#93b4ff]">
                          {carHint}
                        </span>
                      ) : null}
                      <span className="font-body-sm text-on-surface-variant">{formatRecentWhen(r.promotedAt)}</span>
                      {savedBy ? (
                        <span className="font-body-sm text-on-surface-variant">· Saved by {savedBy}</span>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <PartsButton
                    variant="secondary"
                    onClick={() => {
                      window.location.assign("/?page=parts-catalog&tab=find-parts");
                    }}
                  >
                    <MaterialIcon name="visibility" className="text-[18px]" /> Open
                  </PartsButton>
                  {r.undoEligible ? (
                    <PartsButton variant="danger" onClick={() => setUndoTarget(r)}><MaterialIcon name="undo" className="text-[18px]" /> Undo</PartsButton>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
      <AlertDialog open={Boolean(undoTarget)} onOpenChange={(o) => !o && setUndoTarget(null)}>
        <AlertDialogContent className="parts-database-stitch">
          <AlertDialogHeader>
            <AlertDialogTitle>Undo this save?</AlertDialogTitle>
            <AlertDialogDescription>Parts and fits from this save will be removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild><PartsButton variant="secondary">Keep</PartsButton></AlertDialogCancel>
            <AlertDialogAction asChild>
              <PartsButton
                variant="danger"
                confirm
                onClick={() => {
                  const id = String(undoTarget?.batchId ?? "");
                  void undoSelfServePart(id)
                    .then(() => {
                      toast.success("Undone");
                      setUndoTarget(null);
                      void qc.invalidateQueries({ queryKey: ["self-serve-recent"] });
                    })
                    .catch((e) => toast.error(e instanceof Error ? e.message : "Undo failed"));
                }}
              >
                Undo save
              </PartsButton>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ChoiceCard({
  recommended,
  icon,
  title,
  description,
  action,
  onClick,
}: {
  recommended?: boolean;
  icon: string;
  title: string;
  description: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <div className={`relative flex min-h-[340px] flex-col justify-between rounded-2xl border bg-white p-7 shadow-[0_4px_16px_rgba(1,83,220,0.04)] dark:bg-[#111a2e] ${recommended ? "border-[#0153dc]/40 dark:border-[#1e3a8a]" : "border-[#e6e7ee] dark:border-[#1e293b]"}`}>
      {recommended ? (
        <span className="absolute -top-3 left-6 z-10 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#dbe1ff] text-[#0153dc] text-[12px] font-semibold shadow-sm dark:bg-[#1e3a8a] dark:text-[#93b4ff]">
          <MaterialIcon name="star" className="text-[12px]" filled />
          Recommended
        </span>
      ) : null}
      <div>
        <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-6 ${recommended ? "bg-[#dbe1ff] text-[#0153dc] dark:bg-[#1e3a8a]/40" : "bg-[#eef0f6] text-[#30323b] dark:bg-[#1e293b] dark:text-[#e2e8f0]"}`}>
          <MaterialIcon name={icon} className="text-[26px]" />
        </div>
        <h3 className="mb-3 text-[22px] font-semibold leading-snug text-[#30323b] dark:text-[#e2e8f0]">{title}</h3>
        <p className="text-[16px] leading-relaxed text-[#5d5f68] dark:text-[#94a3b8]">{description}</p>
      </div>
      <PartsButton variant={recommended ? "primary" : "secondary"} className="w-full mt-6 !h-12 text-[16px]" onClick={onClick}>
        {action}
        <MaterialIcon name={recommended ? "arrow_forward" : action === "Find the part" ? "search" : "tune"} className="text-[18px]" />
      </PartsButton>
    </div>
  );
}
