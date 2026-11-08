/**
 * V8 Frame B — History, ported from docs/stitch/dominion-vehicles-catalog/toyota_roomy_sister_cars_history/code.html.
 * Plain sentences from platform_revision. Undo is left out until there is a revert behind it (no dead buttons).
 */
import type { CatalogRevisionRow } from "../vehiclesCatalogApi";
import { revisionPlainSentence } from "./vehiclesRevisionSentence";
import { D_CARD, D_MUTED, D_TXT, DIcon } from "../../parts-database/add-parts/catalog/dominionKit";

type Props = {
  revisions: CatalogRevisionRow[];
};

export function VehiclesHistoryTab({ revisions }: Props) {
  if (!revisions.length) {
    return <p className={`${D_CARD} p-6 text-[15px] ${D_MUTED}`}>No history on file yet.</p>;
  }
  return (
    <section className={`${D_CARD} p-6`}>
      <h2 className={`mb-4 text-[18px] font-semibold ${D_TXT}`}>History</h2>
      <ol className="relative flex flex-col gap-5 border-l-2 border-[#e6e7ee] pl-6 dark:border-[#1e293b]">
        {revisions.map((rev) => (
          <li key={rev.id} className="relative">
            <span className="absolute -left-[33px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-[#0153dc] dark:border-[#111a2e]" />
            <p className={`flex items-center gap-1.5 text-[13px] ${D_MUTED}`}>
              <DIcon name="schedule" className="text-[14px]" />
              {new Date(rev.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
            </p>
            <p className={`mt-0.5 text-[15px] ${D_TXT}`}>{revisionPlainSentence(rev)}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
