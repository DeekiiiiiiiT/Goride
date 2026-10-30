// Stitch: dominion-redesign/433e0f61d6af4258983945cb6684a948
import type { FuelOverview } from "./fuelHomeApi";
import { oldestReviewLine, orderNeeds, ruleByKey, type NeedKey } from "./fuelHomeFormat";

function Icon({ name, className }: { name: string; className?: string }) {
  return <span className={`material-symbols-outlined ${className || ""}`}>{name}</span>;
}

type Row = {
  key: NeedKey;
  icon: string;
  title: string;
  detail: string;
  count: number;
  action: "Review" | "Open";
  urgent: boolean;
  page: string;
  params: Record<string, string>;
};

function rowsFor(data: FuelOverview, todayIso: string): Row[] {
  const pins = ruleByKey(data.quality.rules, "pin_checked")?.fail ?? 0;
  const parish = ruleByKey(data.quality.rules, "parish_match")?.fail ?? 0;
  const brand = ruleByKey(data.quality.rules, "brand_set")?.fail ?? 0;
  const catalog: Record<NeedKey, Row> = {
    review: {
      key: "review",
      icon: "rate_review",
      title: "Price reports waiting for review",
      detail: oldestReviewLine(data.prices.oldest_review_at, todayIso),
      count: data.prices.review_waiting,
      action: "Review",
      urgent: true,
      page: "fuel-price-engine",
      params: {},
    },
    pending: {
      key: "pending",
      icon: "verified",
      title: "Stations waiting to be verified",
      detail: "Incomplete onboarding profiles",
      count: data.stations.pending,
      action: "Open",
      urgent: false,
      page: "fuel-stations",
      params: { status: "pending" },
    },
    pins: {
      key: "pins",
      icon: "pin_drop",
      title: "Pins not checked on the map",
      detail: "Coordinates require geographic confirmation",
      count: pins,
      action: "Open",
      urgent: false,
      page: "fuel-stations",
      params: { issue: "pin_unchecked" },
    },
    parish: {
      key: "parish",
      icon: "wrong_location",
      title: "Parish text disagrees with the map",
      detail: "Boundary polygon discrepancy",
      count: parish,
      action: "Open",
      urgent: false,
      page: "fuel-stations",
      params: { issue: "parish_mismatch" },
    },
    brand: {
      key: "brand",
      icon: "branding_watermark",
      title: "Stations without a brand",
      detail: "Unassociated with Texaco, Total, Rubis or Sol",
      count: brand,
      action: "Open",
      urgent: false,
      page: "fuel-stations",
      params: { issue: "no_brand" },
    },
    sync: {
      key: "sync",
      icon: "sync_problem",
      title: "Refinery sync runs",
      detail: "None logged yet",
      count: 0,
      action: "Open",
      urgent: false,
      page: "fuel-prices",
      params: {},
    },
  };
  return orderNeeds({
    review: data.prices.review_waiting,
    pending: data.stations.pending,
    pins,
    parish,
    brand,
    syncLogged: Boolean(data.benchmark.last_run_at),
  }).map((key) => catalog[key]);
}

export function NeedsYouPanel({
  data,
  todayIso,
  onOpen,
}: {
  data: FuelOverview;
  todayIso: string;
  onOpen: (page: string, params: Record<string, string>) => void;
}) {
  const rows = rowsFor(data, todayIso);
  const countLabel = rows.length === 1 ? "1 item" : `${rows.length} items`;

  return (
    <div className="lg:col-span-8 bg-surface-container-lowest rounded-xl p-5 shadow-sm flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between pb-3 mb-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-headline font-bold text-on-surface">Needs you</span>
            <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant">{countLabel}</span>
          </div>
          <span className="text-xs text-on-surface-variant">Actionable master records</span>
        </div>
        {rows.length === 0 ? (
          <div className="p-4 rounded-xl bg-tertiary/5 flex flex-col items-center text-center">
            <div className="w-8 h-8 rounded-full bg-tertiary/10 text-tertiary flex items-center justify-center mb-2">
              <Icon name="check_circle" className="text-[18px]" />
            </div>
            <p className="text-xs font-semibold text-on-surface">Nothing waiting</p>
            <p className="text-[11px] text-on-surface-variant mt-1">Fuel data is up to date.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {rows.map((row) => (
              <div key={row.key} className="flex items-center justify-between p-3 rounded-lg hover:bg-surface-container-low transition-colors group">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${row.urgent ? "bg-amber-500/10 text-amber-600" : "bg-surface-container-high text-on-surface-variant"}`}>
                    <Icon name={row.icon} className="text-[20px]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-on-surface truncate">{row.title}</p>
                    <p className={`text-[11px] text-on-surface-variant ${row.key === "review" || row.key === "sync" ? "font-mono" : ""}`}>{row.detail}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`font-mono text-xs font-semibold px-2 py-0.5 rounded ${row.urgent ? "bg-amber-100 text-amber-800" : "bg-surface-container text-on-surface-variant"}`}>{row.count}</span>
                  <button
                    className={row.action === "Review"
                      ? "px-3 py-1.5 text-xs font-medium rounded-lg bg-secondary text-on-secondary hover:bg-secondary-dim transition-all shadow-sm"
                      : "px-3 py-1.5 text-xs font-medium rounded-lg bg-surface-container-high text-on-surface hover:bg-surface-container-highest transition-all"}
                    type="button"
                    onClick={() => onOpen(row.page, row.params)}
                  >
                    {row.action}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
