/**
 * Vehicles home — "Powertrain to check" + "Powertrain mix" cards, ported exactly from Stitch
 * docs/stitch/powertrain-job-fit-dominion/html/06. Counts come from the vehicle_catalog rows the home
 * page already loaded (Dominion data only). Dropped (audit 9): the invented stat cards and table
 * changes, "Updated 2m ago", "Export" / "Add" buttons.
 */
import type { VehicleCatalogRecord } from "../../../../types/vehicleCatalog";
import { POWERTRAINS } from "../../powertrain/powertrainModel";
import { DIcon, S, T } from "../../powertrain/ptStitch";

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

/** Stitch 06 bar colours, legend tiles and names. */
const SEG: Record<string, { label: string; bar: string; tile: string; name: string; num: string }> = {
  ice: { label: "Petrol / Diesel", bar: "bg-slate-400", tile: "bg-[#f2f3fe]/70 dark:bg-[#0b1220]", name: S.text, num: S.text },
  bev: { label: "Electric", bar: "bg-emerald-500", tile: "bg-emerald-50/70 dark:bg-emerald-950/40", name: "text-emerald-950 dark:text-emerald-200", num: "text-emerald-900 dark:text-emerald-300" },
  hev: { label: "Hybrid (HEV)", bar: "bg-teal-500", tile: "bg-teal-50/70 dark:bg-teal-950/40", name: "text-teal-950 dark:text-teal-200", num: "text-teal-900 dark:text-teal-300" },
  erev: { label: "Range-extender", bar: "bg-cyan-400", tile: "bg-cyan-50/70 dark:bg-cyan-950/40", name: "text-cyan-950 dark:text-cyan-200", num: "text-cyan-900 dark:text-cyan-300" },
  phev: { label: "Plug-in hybrid", bar: "bg-sky-500", tile: "bg-sky-50/70 dark:bg-sky-950/40", name: "text-sky-950 dark:text-sky-200", num: "text-sky-900 dark:text-sky-300" },
  mhev: { label: "Mild hybrid", bar: "bg-indigo-500", tile: "bg-indigo-50/70 dark:bg-indigo-950/40", name: "text-indigo-950 dark:text-indigo-200", num: "text-indigo-900 dark:text-indigo-300" },
  fcev: { label: "Hydrogen (FCEV)", bar: "bg-purple-500", tile: "bg-purple-50/70 dark:bg-purple-950/40", name: "text-purple-950 dark:text-purple-200", num: "text-purple-900 dark:text-purple-300" },
  needs_check: { label: "Needs checking", bar: "bg-amber-400", tile: "bg-amber-50 dark:bg-amber-950/40", name: "font-medium text-amber-950 dark:text-amber-200", num: "font-bold text-amber-900 dark:text-amber-300" },
};

function initials(make: string): string {
  const m = make.trim();
  return m.slice(0, 2).toUpperCase();
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
    ...POWERTRAINS.map((c) => ({ id: c as string, n: counts[c] })).sort((a, b) => b.n - a.n),
    { id: "needs_check", n: needsCheck },
  ].filter((s) => s.n > 0);
  const makes = [...new Set(items.filter((r) => r.powertrain_status === "needs_check").map((r) => r.make))];
  const pending = needsCheck > 0;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12" data-testid="powertrain-home-cards">
      <section
        className={`relative flex flex-col justify-between overflow-hidden rounded-xl p-6 shadow-sm lg:col-span-4 ${
          pending
            ? "bg-gradient-to-b from-amber-50/60 to-white dark:from-amber-950/40 dark:to-[#111a2e]"
            : "bg-white dark:bg-[#111a2e]"
        } dark:ring-1 dark:ring-[#1e293b]`}
      >
        {pending ? <div className="pointer-events-none absolute right-0 top-0 h-32 w-32 rounded-full bg-amber-400/10 blur-2xl" /> : null}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-lg shadow-sm ${
                pending ? "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200" : S.greenChip
              }`}
            >
              <DIcon name={pending ? "help_center" : "verified"} className="text-[22px]" />
            </div>
            {pending ? (
              <span className={`flex items-center gap-1 rounded-full bg-amber-200/70 px-2.5 py-1 uppercase tracking-wide text-amber-900 dark:bg-amber-900/60 dark:text-amber-200 ${T.labelSm}`}>
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-600" /> Action required
              </span>
            ) : null}
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className={`text-[40px] font-semibold leading-tight tracking-tight tabular-nums ${S.text}`} data-testid="pt-check-count">
              {fmt(needsCheck)}
            </span>
            <span className={`${T.labelMd} ${pending ? "text-amber-900 dark:text-amber-300" : S.muted}`}>
              {needsCheck === 1 ? "model to check" : "models to check"}
            </span>
          </div>
          <h3 className={`mt-2 ${T.headlineSm} ${S.text}`}>Powertrain to check</h3>
          <p className={`mt-1 ${T.bodyMd} ${S.muted}`}>
            {pending
              ? "Car models that need you to say what powers them before they're offered the right jobs."
              : "Every car model is confirmed or worked out."}
          </p>
        </div>
        <div className="mt-6 flex items-center justify-between pt-4">
          <div className="flex -space-x-1.5 overflow-hidden">
            {makes.slice(0, 2).map((m, i) => (
              <span
                key={m}
                className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                  i === 0 ? "bg-amber-200 text-amber-900" : "bg-amber-300 text-amber-950"
                }`}
                title={m}
              >
                {initials(m)}
              </span>
            ))}
            {makes.length > 2 ? (
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-400 text-[10px] font-bold text-amber-950">
                +{makes.length - 2}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onReview}
            className={`group flex h-9 items-center gap-1 rounded-lg bg-white px-4 shadow-sm ring-1 ring-[#e7e7f2] hover:bg-amber-100/50 active:scale-95 dark:bg-[#0b1220] dark:ring-[#1e293b] ${T.labelMd} font-semibold ${
              pending ? "text-amber-900 dark:text-amber-300" : S.text
            }`}
          >
            <span>Review</span>
            <DIcon name="arrow_forward" className="text-[16px] transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      </section>

      <section className="flex flex-col justify-between rounded-xl bg-white p-6 shadow-sm dark:bg-[#111a2e] dark:ring-1 dark:ring-[#1e293b] lg:col-span-8">
        <div>
          <div className="mb-4">
            <h3 className={`${T.headlineSm} ${S.text}`}>Powertrain mix</h3>
            <p className={`${T.bodySm} ${S.muted}`}>What powers the {fmt(total)} car models in the catalogue</p>
          </div>
          <div className="my-4 flex w-full flex-col gap-1.5">
            <div
              className={`flex h-4 w-full overflow-hidden rounded-full shadow-inner ${S.mid}`}
              role="img"
              aria-label={segments.map((s) => `${SEG[s.id].label} ${s.n}`).join(", ")}
            >
              {segments.map((s) => (
                <div
                  key={s.id}
                  className={`h-full ${SEG[s.id].bar}`}
                  title={`${SEG[s.id].label}: ${fmt(s.n)} (${((s.n / Math.max(total, 1)) * 100).toFixed(1)}%)`}
                  style={{ width: `${(s.n / Math.max(total, 1)) * 100}%` }}
                />
              ))}
            </div>
            <div className={`flex items-center justify-between px-1 text-[10px] uppercase ${S.mono} ${S.muted}`}>
              {["0%", "25%", "50%", "75%", "100%"].map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
          </div>
        </div>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-2 pt-2 sm:grid-cols-4">
          {segments.map((s) => (
            <li key={s.id} className={`flex items-center justify-between rounded-lg p-2 ${SEG[s.id].tile}`} data-testid={`mix-${s.id}`}>
              <span className="flex min-w-0 items-center gap-2">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${SEG[s.id].bar}`} />
                <span title={SEG[s.id].label} className={`truncate ${T.bodySm} ${SEG[s.id].name}`}>{SEG[s.id].label}</span>
              </span>
              <span className={`pl-1 tabular-nums ${T.labelMd} font-semibold ${SEG[s.id].num}`}>{fmt(s.n)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
