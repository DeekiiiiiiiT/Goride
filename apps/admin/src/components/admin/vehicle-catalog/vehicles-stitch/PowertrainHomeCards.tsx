/**
 * Vehicles home — "Powertrain to check" + "Powertrain mix" cards (Stitch powertrain-job-fit-dominion
 * screen 6). Counts come from the vehicle_catalog rows the home page already loaded (Dominion data
 * only). Drop (audit 9): invented other cards, "Updated 2m ago", maker logos on the check card.
 */
import type { VehicleCatalogRecord } from "../../../../types/vehicleCatalog";
import { PartsButton } from "../../parts-database/PartsButton";
import { D_CARD, D_MONO, D_MUTED, D_TXT, DIcon } from "../../parts-database/add-parts/catalog/dominionKit";
import { POWERTRAINS, POWERTRAIN_COLOUR, POWERTRAIN_SHORT } from "../../powertrain/powertrainModel";

const fmt = (n: number) => n.toLocaleString("en-US");

export function powertrainMix(items: VehicleCatalogRecord[]) {
  const counts: Record<string, number> = Object.fromEntries(POWERTRAINS.map((c) => [c, 0]));
  let needsCheck = 0;
  for (const r of items) {
    if (r.powertrain_status === "needs_check") needsCheck += 1;
    else if (r.powertrain && r.powertrain in counts) counts[r.powertrain] += 1;
  }
  return { counts, needsCheck, total: items.length };
}

export function PowertrainHomeCards({
  items,
  onReview,
}: {
  items: VehicleCatalogRecord[];
  onReview: () => void;
}) {
  // Before D1 the columns don't exist; show nothing rather than a misleading empty mix.
  if (!items.some((r) => r.powertrain_status)) return null;
  const { counts, needsCheck, total } = powertrainMix(items);
  const segments = [
    ...POWERTRAINS.map((c) => ({ id: c as string, label: POWERTRAIN_SHORT[c], n: counts[c] })),
    { id: "needs_check", label: "Needs checking", n: needsCheck },
  ].filter((s) => s.n > 0);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12" data-testid="powertrain-home-cards">
      <section
        className={`${D_CARD} flex flex-col justify-between gap-4 p-5 lg:col-span-4 ${
          needsCheck > 0 ? "bg-gradient-to-br from-[#fffaf0] to-white dark:from-[#451a03]/40 dark:to-[#111a2e]" : ""
        }`}
      >
        <div className="flex items-start justify-between">
          <span
            className={`flex h-10 w-10 items-center justify-center rounded-xl ${
              needsCheck > 0
                ? "bg-[#fff4dc] text-[#8a5a00] dark:bg-[#451a03] dark:text-[#fbbf24]"
                : "bg-[#e6f4ea] text-[#006e31] dark:bg-[#14532d]/60 dark:text-[#4ade80]"
            }`}
          >
            <DIcon name={needsCheck > 0 ? "help" : "verified"} className="text-[22px]" />
          </span>
        </div>
        <div>
          <p className={`text-[32px] font-semibold leading-tight ${D_MONO} ${needsCheck > 0 ? "text-[#8a5a00] dark:text-[#fbbf24]" : D_TXT}`}>
            {fmt(needsCheck)}
          </p>
          <h3 className={`mt-1 text-[16px] font-semibold ${D_TXT}`}>Powertrain to check</h3>
          <p className={`text-[13px] ${D_MUTED}`}>
            {needsCheck > 0
              ? "Car models that need you to say what powers them before they're offered the right jobs."
              : "Every car model is confirmed or worked out."}
          </p>
        </div>
        <div className="flex justify-end">
          <PartsButton variant="secondary" onClick={onReview}>
            Review <DIcon name="arrow_forward" className="text-[16px]" />
          </PartsButton>
        </div>
      </section>

      <section className={`${D_CARD} flex flex-col gap-4 p-5 lg:col-span-8`}>
        <div>
          <h3 className={`text-[16px] font-semibold ${D_TXT}`}>Powertrain mix</h3>
          <p className={`text-[13px] ${D_MUTED}`}>What powers the {fmt(total)} car models in the catalogue.</p>
        </div>
        <div
          className="flex h-3 w-full overflow-hidden rounded-full bg-[#eef0f6] dark:bg-[#1e293b]"
          role="img"
          aria-label={segments.map((s) => `${s.label} ${s.n}`).join(", ")}
        >
          {segments.map((s) => (
            <div
              key={s.id}
              title={`${s.label}: ${fmt(s.n)}`}
              style={{ width: `${(s.n / Math.max(total, 1)) * 100}%`, background: POWERTRAIN_COLOUR[s.id as keyof typeof POWERTRAIN_COLOUR] }}
            />
          ))}
        </div>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {segments.map((s) => (
            <li
              key={s.id}
              className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-[13px] ${
                s.id === "needs_check" ? "bg-[#fff4dc] dark:bg-[#451a03]" : "bg-[#f3f4fb] dark:bg-[#0b1220]"
              }`}
            >
              <span className={`flex min-w-0 items-center gap-1.5 ${D_TXT}`}>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: POWERTRAIN_COLOUR[s.id as keyof typeof POWERTRAIN_COLOUR] }} />
                <span className="truncate">{s.label}</span>
              </span>
              <span className={`font-semibold ${D_MONO} ${D_TXT}`}>{fmt(s.n)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
