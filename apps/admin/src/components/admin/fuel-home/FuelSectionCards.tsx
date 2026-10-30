// Stitch: dominion-redesign/433e0f61d6af4258983945cb6684a948
import type { FuelOverview } from "./fuelHomeApi";
import {
  benchmarkName,
  freshnessLabel,
  headlineGrade,
  programsLine,
  refineryCountLine,
  ruleByKey,
  signedPercent,
  wholePercent,
} from "./fuelHomeFormat";

function Icon({ name, className }: { name: string; className?: string }) {
  return <span className={`material-symbols-outlined ${className || ""}`}>{name}</span>;
}

export function FuelSectionCards({
  data,
  onOpen,
}: {
  data: FuelOverview;
  onOpen: (page: string, params?: Record<string, string>) => void;
}) {
  const name = benchmarkName(data);
  const pins = ruleByKey(data.quality.rules, "pin_checked")?.fail ?? 0;
  const feature = headlineGrade(data);
  const gap = feature?.diff_pct == null ? "—" : signedPercent(feature.diff_pct);
  const fresh = data.benchmark.freshness === "stale"
    ? "bg-rose-600"
    : data.benchmark.freshness === "due"
      ? "bg-amber-600"
      : "bg-tertiary";
  const cards = [
    {
      page: "fuel-stations",
      icon: "local_gas_station",
      title: "Stations",
      detail: "The station list, including ones still in review.",
      status: `${data.stations.pending} pending · ${pins} pins unchecked`,
      fresh: "",
      freshLabel: "",
    },
    {
      page: "fuel-prices",
      icon: "factory",
      title: "Refineries",
      detail: `Refineries and their ex-refinery prices. ${name} is the benchmark.`,
      status: refineryCountLine(data.benchmark.refineries, data.benchmark.latest_week),
      fresh,
      freshLabel: freshnessLabel(data.benchmark.freshness),
    },
    {
      page: "fuel-price-engine",
      icon: "speed",
      title: "Price Engine",
      detail: "The pump price Plug is allowed to show, and the ones waiting for you.",
      status: `${data.prices.review_waiting} waiting · ${data.prices.live} live prices`,
      fresh: "",
      freshLabel: "",
    },
    {
      page: "fuel-analytics",
      icon: "analytics",
      title: "Station analytics",
      detail: "Pump prices against the benchmark, coverage and data trust by parish and brand.",
      status: `Coverage ${wholePercent(data.prices.coverage_pct)} · ${gap} vs benchmark`,
      fresh: "",
      freshLabel: "",
    },
    {
      page: "fuel-jaa-cards",
      icon: "credit_card",
      title: "Gas-card programs",
      detail: "Programs and the master list. Customer cards are in Fleet admin.",
      status: programsLine(data.gas_cards.programs),
      fresh: "",
      freshLabel: "",
    },
  ];

  return (
    <div className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-headline font-bold text-on-surface">Sections</h2>
          <p className="text-xs text-on-surface-variant">Fuel master architecture and sync destinations.</p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card) => (
          <button
            key={card.page}
            type="button"
            className="bg-surface-container-lowest rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow group flex flex-col justify-between text-left"
            onClick={() => onOpen(card.page)}
          >
            <div>
              <div className="flex items-start gap-3 mb-2">
                <div className="w-9 h-9 rounded-lg bg-secondary-container text-secondary flex items-center justify-center shrink-0">
                  <Icon name={card.icon} className="text-[20px]" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-secondary group-hover:underline">{card.title}</h3>
                  <p className="text-xs text-on-surface-variant mt-0.5 leading-relaxed">{card.detail}</p>
                </div>
              </div>
            </div>
            <div className="pt-3 mt-4 flex items-center justify-between text-xs font-mono text-on-surface-variant">
              <span className="flex items-center gap-1.5">
                {card.status}
                {card.fresh ? <span className={`w-1.5 h-1.5 rounded-full ${card.fresh}`} /> : null}
                {card.freshLabel}
              </span>
              <Icon name="chevron_right" className="text-[16px] text-outline-variant group-hover:text-secondary group-hover:translate-x-0.5 transition-all" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
