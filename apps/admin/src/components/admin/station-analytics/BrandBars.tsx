import { formatJmd } from "./stationAnalyticsFormat";
import type { StationAnalytics } from "./stationAnalyticsApi";

const SCALE_MIN = 215;
const SCALE_MAX = 255;

const LOOK: Record<string, { pill: string; bar: string; track: string; price: string; name: string }> = {
  total: { pill: "bg-red-600 text-white", bar: "bg-gradient-to-r from-red-500 to-rose-600", track: "bg-slate-100 border-slate-200/50", price: "text-slate-900", name: "text-slate-900" },
  texaco: { pill: "bg-rose-700 text-white", bar: "bg-gradient-to-r from-rose-600 to-red-700", track: "bg-slate-100 border-slate-200/50", price: "text-red-700", name: "text-slate-900" },
  rubis: { pill: "bg-blue-700 text-white", bar: "bg-gradient-to-r from-blue-600 to-indigo-600", track: "bg-slate-100 border-slate-200/50", price: "text-slate-900", name: "text-slate-900" },
  fesco: { pill: "bg-emerald-600 text-white", bar: "bg-gradient-to-r from-emerald-500 to-teal-500", track: "bg-emerald-50 border-emerald-200/60", price: "text-emerald-700", name: "font-semibold text-emerald-800" },
  unipet: { pill: "bg-amber-600 text-white", bar: "bg-gradient-to-r from-amber-500 to-orange-500", track: "bg-slate-100 border-slate-200/50", price: "text-slate-900", name: "text-slate-900" },
  blaize: { pill: "bg-sky-600 text-white", bar: "bg-gradient-to-r from-sky-500 to-blue-500", track: "bg-slate-100 border-slate-200/50", price: "text-slate-900", name: "text-slate-900" },
  jampet: { pill: "bg-indigo-600 text-white", bar: "bg-gradient-to-r from-indigo-500 to-purple-600", track: "bg-slate-100 border-slate-200/50", price: "text-slate-900", name: "text-slate-900" },
  buds: { pill: "bg-teal-600 text-white", bar: "bg-gradient-to-r from-teal-500 to-emerald-600", track: "bg-slate-100 border-slate-200/50", price: "text-slate-900", name: "text-slate-900" },
};

const PLAIN = { pill: "bg-slate-600 text-white", bar: "bg-slate-500", track: "bg-slate-100 border-slate-200/50", price: "text-slate-900", name: "text-slate-900" };
const NONE = { pill: "bg-slate-300 text-slate-700", bar: "bg-slate-400", track: "bg-slate-100 border-slate-200/50", price: "text-slate-600", name: "italic text-slate-500" };

function styleFor(name: string) {
  const key = name.toLowerCase();
  if (key.includes("no brand")) return { ...NONE, initials: "?" };
  const hit = Object.keys(LOOK).find((token) => key.includes(token));
  const style = hit ? LOOK[hit] : PLAIN;
  const initials = name.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase() || "?";
  return { ...style, initials };
}

function barWidth(price: number) {
  const span = ((price - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100;
  return Math.min(100, Math.max(6, span));
}

export function BrandBars({
  brands,
  onSelect,
}: {
  brands: StationAnalytics["brands"];
  onSelect: (brandId: string) => void;
}) {
  const priced = brands.filter((brand) => brand.priced > 0 && brand.median != null);
  const empty = brands.filter((brand) => brand.priced === 0);

  return (
    <section className="overflow-hidden rounded-xl bg-white p-5 shadow-sm dark:bg-slate-900">
      <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm bg-gradient-to-r from-red-500 via-blue-500 to-emerald-500" />
            <h2 className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">By brand</h2>
          </div>
          <p className="mt-0.5 text-[11px] text-slate-500">Median pump price by retail petroleum brand across the Jamaican network (Scale J$215 – J$255)</p>
        </div>
        <div className="rounded-lg border border-slate-200/60 bg-slate-100 px-2.5 py-1 font-mono text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          {priced.length} active {priced.length === 1 ? "category" : "categories"}
        </div>
      </div>
      {priced.length === 0 ? (
        <p className="text-sm text-slate-500">No brand has a pump price this week.</p>
      ) : (
        <div className="space-y-3">
          {priced.map((brand) => {
            const look = styleFor(brand.name);
            return (
              <button
                key={brand.brandId || "none"}
                type="button"
                className="flex w-full items-center text-left text-xs"
                onClick={() => onSelect(brand.brandId || "none")}
              >
                <span className="flex w-32 items-center gap-2 truncate">
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${look.pill}`}>{look.initials}</span>
                  <span className={`truncate ${look.name}`}>{brand.name}</span>
                </span>
                <span className={`mx-3 flex h-5 flex-1 items-center overflow-hidden rounded-md border p-0.5 ${look.track}`}>
                  <span className={`h-full rounded-sm ${look.bar}`} style={{ width: `${barWidth(brand.median as number)}%` }} />
                </span>
                <span className={`w-20 text-right font-mono font-bold ${look.price}`}>{formatJmd(brand.median)}</span>
                <span className="ml-1 w-16 rounded bg-slate-50 py-0.5 text-right font-mono text-[10px] text-slate-500 dark:bg-slate-800">{brand.priced} / {brand.stations}</span>
              </button>
            );
          })}
        </div>
      )}
      <div className="mt-3 flex items-center border-t border-slate-100 pt-3 font-mono text-[10px] text-slate-500 dark:border-slate-800">
        <span className="w-32 font-semibold text-slate-700 dark:text-slate-300">Scale benchmark:</span>
        <span className="mx-3 flex flex-1 justify-between font-bold">
          <span>J$215</span><span>J$225</span><span>J$235</span><span>J$245</span><span>J$255</span>
        </span>
        <span className="w-36 text-right font-medium text-slate-400">Coverage</span>
      </div>
      {empty.length > 0 ? (
        <div className="mt-3 rounded-lg border border-slate-200/70 bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          <span className="font-bold text-slate-900 dark:text-slate-100">Unpriced brands:</span>{" "}
          {empty.map((brand) => `${brand.name} (${brand.stations})`).join(", ")}
        </div>
      ) : null}
    </section>
  );
}
