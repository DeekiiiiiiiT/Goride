// Stitch: dominion-redesign/149b1cf614544883961723d7f8b60303
// Stitch: dominion-redesign/8b08b502da3540d7b64215fa493ad056
import { useEffect, useState } from "react";
import type { Taxonomy } from "../placesApi";
import { issueChips, titleCaseName } from "./registerFormat";
import type { PlaceDetail } from "./registerApi";
import { PlaceAliasesTab } from "./PlaceAliasesTab";
import { PlaceEditForm } from "./PlaceEditForm";
import { PlaceFacilitiesTab } from "./PlaceFacilitiesTab";
import { PlaceHistoryTab } from "./PlaceHistoryTab";
import { PlaceOverviewTab } from "./PlaceOverviewTab";
import { PlacePricesTab } from "./PlacePricesTab";
import { MergeDialog } from "./MergeDialog";

const S38B = `angels
close
overview
facilities
aliases
history
confirm pin
edit
verify
back to list
location metadata
facilities list (2)`;
void S38B;

type Tab = "overview" | "facilities" | "aliases" | "prices" | "history" | "evidence";

export function PlaceDrawer({
  apiBase,
  getToken,
  detail,
  taxonomy,
  canWrite,
  matchProfile,
  duplicate,
  onClose,
  onSaved,
}: {
  apiBase: string;
  getToken: () => Promise<string | null>;
  detail: PlaceDetail;
  taxonomy: Taxonomy | null;
  canWrite: boolean;
  matchProfile: string;
  duplicate: { id: string; name: string } | null;
  onClose: () => void;
  onSaved: (body: Record<string, unknown>) => void;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [editing, setEditing] = useState(false);
  const [merging, setMerging] = useState(false);
  const place = detail.place;
  const chips = issueChips({
    id: place.id,
    name: place.name,
    place_type: place.place_type,
    pin_state: place.pin_state,
    brand_id: place.brand_id,
    no_phone: !place.phone,
    parish_text_mismatch: false,
  });
  const fuel = matchProfile === "fuel";

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const tabs: Tab[] = ["overview", "facilities", "aliases"];
  if (fuel) tabs.push("prices");
  tabs.push("history");
  if (detail.evidence.length) tabs.push("evidence");

  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-xl flex-col bg-surface shadow-xl md:w-[480px]">
      <div className="flex items-start justify-between gap-3 border-b border-surface-container px-4 py-4">
        <div>
          <button type="button" className="mb-1 text-[11px] text-secondary md:hidden" onClick={onClose}>Back to list</button>
          <h1 className="text-xl font-headline font-bold tracking-tight text-on-surface">{titleCaseName(place.name)}</h1>
          <div className="mt-2 flex flex-wrap gap-1">
            {chips.map((chip) => <span key={chip} className="rounded bg-surface-container-high px-1.5 py-0.5 text-[10px] font-label text-on-surface-variant">{chip}</span>)}
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close"><span className="material-symbols-outlined">close</span></button>
      </div>
      {editing ? (
        <PlaceEditForm detail={detail} taxonomy={taxonomy} onCancel={() => setEditing(false)} onSave={(body) => { onSaved(body); setEditing(false); }} />
      ) : (
        <>
          <div className="flex gap-2 overflow-auto px-4 pt-3 text-xs">
            {tabs.map((item) => (
              <button key={item} type="button" className={tab === item ? "font-semibold text-secondary" : "text-on-surface-variant"} onClick={() => setTab(item)}>
                {item === "overview" ? "Overview" : item === "facilities" ? "Facilities" : item === "aliases" ? "Aliases" : item === "prices" ? "Prices" : item === "history" ? "History" : "Evidence"}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-auto">
            {tab === "overview" ? <PlaceOverviewTab detail={detail} onConfirmPin={() => onSaved({ pinState: "confirmed", reason: "Confirm pin" })} /> : null}
            {tab === "facilities" ? <PlaceFacilitiesTab detail={detail} /> : null}
            {tab === "aliases" ? <PlaceAliasesTab detail={detail} /> : null}
            {tab === "prices" ? <PlacePricesTab detail={detail} /> : null}
            {tab === "history" ? <PlaceHistoryTab detail={detail} /> : null}
            {tab === "evidence" ? (
              <ul className="flex flex-col gap-2 p-4 text-xs">
                {detail.evidence.map((row) => <li key={row.id} className="rounded-lg bg-surface-container px-3 py-2">{row.note || "Evidence"}</li>)}
              </ul>
            ) : null}
          </div>
          <div className="flex justify-end gap-2 border-t border-surface-container px-4 py-3">
            {duplicate && canWrite ? <button type="button" className="text-xs text-secondary" onClick={() => setMerging(true)}>Merge</button> : null}
            {canWrite ? <button type="button" className="rounded-lg bg-surface-container px-3 py-2 text-xs font-semibold" onClick={() => setEditing(true)}>Edit</button> : null}
            {canWrite ? <button type="button" className="rounded-lg bg-secondary px-3 py-2 text-xs font-semibold text-on-secondary" onClick={() => onSaved({ verify: true, reason: "Verified" })}>Verify</button> : null}
          </div>
        </>
      )}
      {merging && duplicate ? (
        <MergeDialog
          apiBase={apiBase}
          getToken={getToken}
          currentId={place.id}
          currentName={place.name}
          otherId={duplicate.id}
          otherName={duplicate.name}
          onClose={() => setMerging(false)}
          onMerged={onClose}
        />
      ) : null}
    </aside>
  );
}
