// Stitch AP1
import { useQuery } from "@tanstack/react-query";
import { PartsButton } from "../PartsButton";
import { MaterialIcon } from "../import/MaterialIcon";
import { fetchMyPartTypeRequests, fetchRecentSelfServeParts, undoSelfServePart } from "./addPartsApi";
import { AddPartsScreenFrame } from "./AddPartsScreenFrame";
import { fitModeDisplay, PartTypeIcon } from "./addPartsShared";
import { toast } from "sonner";

function formatRecentWhen(iso: unknown): string {
  if (!iso) return "";
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return `Today ${time}`;
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function rowIconKey(row: Record<string, unknown>): string | null {
  const ik = row.iconKey ?? row.partTypeIconKey;
  if (ik) return String(ik);
  return null;
}

export function AddPartsHome({
  owner,
  onStart,
  onBulk,
  onPlainWords,
  onPartTypes,
}: {
  owner: boolean;
  onStart: () => void;
  onBulk: () => void;
  onPlainWords: () => void;
  onPartTypes: () => void;
}) {
  const recentQuery = useQuery({ queryKey: ["self-serve-recent"], queryFn: fetchRecentSelfServeParts });
  const myRequests = useQuery({ queryKey: ["part-type-requests-mine"], queryFn: () => fetchMyPartTypeRequests("pending") });
  const items = recentQuery.data?.items ?? [];
  const verified = (label: string) => label.toLowerCase().includes("verified");

  return (
    <AddPartsScreenFrame
      ap="AP1"
      title="Add parts"
      subtitle="Found a part on a catalogue page? Add it in about 2 minutes."
    >
      <div className="w-full bg-surface-container-lowest rounded-xl p-10 shadow-sm flex flex-col items-center text-center">
        <div className="w-14 h-14 rounded-full bg-primary-fixed flex items-center justify-center mb-5 text-primary-container shadow-xs">
          <MaterialIcon name="travel_explore" className="text-[30px]" filled />
        </div>
        <h2 className="font-headline-lg text-headline-lg text-on-surface tracking-tight mb-2">I found a part</h2>
        <p className="font-body-md text-body-md text-on-surface-variant max-w-md mb-6">
          Tell us the part, how it fits, and where you saw it.
        </p>
        <button
          type="button"
          className="bg-primary-container hover:bg-primary text-on-primary px-8 py-2.5 rounded-lg font-label-md text-label-md font-semibold transition-all shadow-sm flex items-center gap-2 group cursor-pointer"
          onClick={onStart}
        >
          <span>Start</span>
          <MaterialIcon name="arrow_forward" className="text-[16px] transition-transform group-hover:translate-x-1" />
        </button>
        <div className="w-full mt-8 pt-6 flex items-center justify-center gap-3 flex-wrap">
          <PartsButton variant="secondary" className="flex items-center gap-1" onClick={onPlainWords}>
            <MaterialIcon name="help_outline" className="text-[16px]" />
            <span>What do these words mean?</span>
          </PartsButton>
          <PartsButton variant="secondary" className="flex items-center gap-1" onClick={onBulk}>
            <span>Bulk upload (advanced)</span>
            <MaterialIcon name="arrow_right_alt" className="text-[14px]" />
          </PartsButton>
          {owner ? (
            <PartsButton variant="secondary" onClick={onPartTypes}>Part types</PartsButton>
          ) : null}
        </div>
      </div>

      {(myRequests.data?.items?.length ?? 0) > 0 ? (
        <section className="rounded-xl bg-surface-container-lowest shadow-xs p-5">
          <h3 className="font-headline-md text-headline-md text-on-surface mb-2">Your requests</h3>
          <ul className="divide-y divide-surface-container-low font-body-sm">
            {myRequests.data!.items.map((r) => (
              <li key={String(r.id)} className="py-2 flex flex-wrap gap-2">
                <span className="font-label-md text-label-md font-semibold text-on-surface">{String(r.name)}</span>
                <span className="font-mono-sm text-mono-sm text-on-surface-variant">{String(r.status)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <h3 className="font-headline-md text-headline-md text-on-surface">Recently added</h3>
            <span className="font-mono-sm text-mono-sm bg-surface-container-high text-on-surface-variant px-2 py-0.5 rounded-full font-medium">
              {items.length} part{items.length === 1 ? "" : "s"}
            </span>
          </div>
          <span className="font-mono-sm text-mono-sm text-outline hidden sm:inline">
            Self-serve parts added by catalog editors · Reversible within 24h
          </span>
        </div>
        <div className="w-full bg-surface-container-lowest rounded-xl shadow-xs overflow-hidden divide-y divide-surface-container-low">
          {items.map((row) => {
            const r = row as Record<string, unknown>;
            const trust = String(r.trustLabel ?? "");
            const fit = fitModeDisplay(String(r.fitMode ?? ""));
            const partLabel = String(r.partTypeName ?? r.tradeTerm ?? "Part");
            const fitSummary = String(r.fitSummary ?? r.reachLabel ?? "");
            const sourceHost = String(r.sourceHost ?? r.evidenceHost ?? "");
            const whenIso = r.promotedAt ?? r.when;
            const undoOk = r.undoEligible === true || r.canUndo === true;
            return (
              <div key={String(r.batchId)} className="px-5 py-3.5 flex items-center justify-between hover:bg-surface-container-low transition-colors group gap-3">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-outline group-hover:text-primary-container transition-colors shrink-0">
                    <PartTypeIcon iconKey={rowIconKey(r)} className="text-[18px]" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2 truncate">
                      <span className="font-label-md text-label-md text-on-surface font-semibold">{String(r.brand)}</span>
                      <span className="font-mono-sm text-mono-sm text-on-surface bg-surface-container px-1.5 py-0.2 rounded font-semibold tracking-wide">
                        {String(r.partNumber)}
                      </span>
                      <span className="text-outline font-bold">·</span>
                      <span className="font-body-sm text-body-sm text-on-surface-variant truncate">{partLabel}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 font-mono-sm text-mono-sm text-on-surface-variant flex-wrap">
                      <span className="flex items-center gap-1 text-on-secondary-container bg-surface-container-high px-1.5 py-0.2 rounded">
                        <MaterialIcon name={fit.icon} className="text-[13px]" />
                        <span>{fit.label}</span>
                      </span>
                      {fitSummary ? (
                        <>
                          <span className="text-outline">·</span>
                          <span className="text-on-surface font-medium">{fitSummary}</span>
                        </>
                      ) : null}
                      {sourceHost ? (
                        <>
                          <span className="text-outline">·</span>
                          <span className="text-outline">{sourceHost}</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0 pl-4">
                  {verified(trust) ? (
                    <span className="font-mono-sm text-mono-sm text-[#006e31] bg-[rgba(0,110,49,0.08)] px-2 py-0.5 rounded flex items-center gap-1">
                      <MaterialIcon name="verified_user" className="text-[13px]" filled />
                      <span>Verified</span>
                    </span>
                  ) : (
                    <span className="font-mono-sm text-mono-sm text-[#b45309] bg-[#fff8e6] px-2 py-0.5 rounded flex items-center gap-1">
                      <MaterialIcon name="schedule" className="text-[13px]" />
                      <span>Needs checking</span>
                    </span>
                  )}
                  <span className="font-mono-sm text-mono-sm text-outline hidden md:inline">{formatRecentWhen(whenIso)}</span>
                  <PartsButton
                    variant="danger"
                    className="font-mono-sm text-mono-sm min-h-0 h-8 px-2"
                    disabled={!undoOk}
                    title={String(r.undoReason ?? "Undo")}
                    onClick={() => {
                      void undoSelfServePart(String(r.batchId))
                        .then(() => { toast.success("Undone"); void recentQuery.refetch(); })
                        .catch((e) => toast.error(e instanceof Error ? e.message : "Undo failed"));
                    }}
                  >
                    Undo
                  </PartsButton>
                </div>
              </div>
            );
          })}
          {items.length === 0 ? (
            <p className="py-8 text-center font-body-sm text-body-sm text-on-surface-variant">Nothing added yet — start above.</p>
          ) : null}
        </div>
      </section>

      <section className="rounded-xl bg-surface-container-low border border-outline-variant/30 p-space-lg flex flex-col sm:flex-row gap-space-md items-start sm:items-center">
        <MaterialIcon name="info" className="text-primary text-[22px] shrink-0" />
        <div>
          <h3 className="font-headline-md text-headline-md text-on-surface">Information only</h3>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
            Parts you add here are fitment and catalogue facts for Fleet — not prices, suppliers, or stock levels.
          </p>
        </div>
      </section>
    </AddPartsScreenFrame>
  );
}
