const CAR_TIERS = [
  { tier: 1, title: "Direct OEM", body: "Made specifically for this VIN/Chassis", color: "#0153dc" },
  { tier: 2, title: "Badge Variant", body: "Shared platform (e.g. Jazz / Shuttle)", color: "#0e7490" },
  { tier: 3, title: "Engine Match", body: "Fits this engine across model lines", color: "#b45309" },
  { tier: 4, title: "Cross-Brand", body: "Another brand replaces the factory part", color: "#7c3aed" },
  { tier: 5, title: "Dimension Match", body: "Physical geometric tolerance match", color: "#006e31" },
];

const REFERENCE_TIERS = [
  { tier: 1, label: "Tier 1: Made for your car", className: "bg-primary/5 text-primary", dot: "bg-primary-container" },
  { tier: 2, label: "Tier 2: Same car, diff badge", className: "bg-secondary/10 text-on-surface-variant", dot: "bg-secondary" },
  { tier: 3, label: "Tier 3: Fits your engine", className: "bg-tertiary-container/15 text-on-surface", dot: "bg-tertiary-container" },
  { tier: 4, label: "Tier 4: Cross-brand alt", className: "bg-secondary-fixed text-on-secondary-fixed", dot: "bg-secondary-container" },
  { tier: 5, label: "Tier 5: Dimension match", className: "bg-surface-container text-on-surface-variant", dot: "bg-outline" },
];

export function MatchTypeStrip({ engine, reference }: { engine?: string; reference?: boolean }) {
  if (reference) {
    return (
      <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col gap-space-sm">
        <div className="flex items-center justify-between gap-space-md flex-wrap">
          <span className="font-label-xs text-label-xs uppercase tracking-wider text-secondary">Dominion fitment match types reference</span>
          <span className="font-mono-sm text-mono-sm text-secondary">ISO/SAE compatibility protocol</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-space-xs font-mono-sm text-mono-sm">
          {REFERENCE_TIERS.map((row) => (
            <div key={row.tier} className={"flex items-center gap-2 p-2 rounded-lg min-w-0 " + row.className}>
              <span className={"w-2 h-2 rounded-full shrink-0 " + row.dot} />
              <span className="font-medium truncate">{row.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  const rows = CAR_TIERS.map((row) => row.tier === 3 && engine
    ? { ...row, body: `Fits ${engine} across model lines` }
    : row);
  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-space-sm p-space-md rounded-2xl bg-surface-container-low shadow-sm">
      {rows.map((row) => (
        <div key={row.tier} className="flex flex-col gap-1 p-space-sm rounded-xl bg-surface-container-lowest shadow-sm">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: row.color }} />
            <span className="font-mono-sm text-mono-sm font-bold" style={{ color: row.color }}>TIER {row.tier}</span>
          </div>
          <span className="font-label-md text-label-md font-semibold text-on-surface">{row.title}</span>
          <span className="font-body-sm text-body-sm text-secondary">{row.body}</span>
        </div>
      ))}
    </div>
  );
}
