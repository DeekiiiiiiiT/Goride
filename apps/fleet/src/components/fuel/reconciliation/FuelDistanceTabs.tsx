/**
 * Step 5 → "Distance and who pays" in three tabs, so nothing sits a long scroll away (owner 23 Nov; same look as the
 * Tolls step's Disputes tabs): Who pays · Odometer checks · More details.
 */
import React, { useState } from 'react';

export type FuelDistanceTabId = 'who' | 'checks' | 'more';

export function FuelDistanceTabs({
  whoPays,
  whoPaysSub,
  checks,
  checksSub,
  checksNeedAttention,
  more,
}: {
  /** Gets a callback that opens the Odometer checks tab (Mark reviewed jumps there). */
  whoPays: (openChecks: () => void) => React.ReactNode;
  whoPaysSub: string;
  checks: React.ReactNode;
  checksSub: string;
  checksNeedAttention: boolean;
  more: React.ReactNode;
}) {
  const [tab, setTab] = useState<FuelDistanceTabId>('who');
  return (
    <div className="flex flex-col gap-5" data-testid="fuel-distance-tabs">
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-[#eff4ff] p-1" role="tablist" aria-label="Distance and who pays">
        <DistanceTab selected={tab === 'who'} onClick={() => setTab('who')} label="Who pays" sub={whoPaysSub} testId="fuel-distance-tab-who" />
        <DistanceTab
          selected={tab === 'checks'}
          onClick={() => setTab('checks')}
          label="Odometer checks"
          sub={checksSub}
          attention={checksNeedAttention}
          testId="fuel-distance-tab-checks"
        />
        <DistanceTab
          selected={tab === 'more'}
          onClick={() => setTab('more')}
          label="More details"
          sub="Economy · leftover split"
          testId="fuel-distance-tab-more"
        />
      </div>
      <div role="tabpanel">
        {tab === 'who' ? whoPays(() => setTab('checks')) : tab === 'checks' ? checks : more}
      </div>
    </div>
  );
}

function DistanceTab({
  selected,
  onClick,
  label,
  sub,
  attention,
  testId,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  sub: string;
  attention?: boolean;
  testId: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      data-testid={testId}
      className={`flex flex-col items-center rounded-lg px-3 py-2 text-center text-sm font-semibold ${
        selected ? 'bg-[#030213] text-white' : 'text-[#47464c] hover:bg-white'
      }`}
    >
      {label}
      <span
        className={`text-xs font-medium ${
          selected ? 'text-white/80' : attention ? 'text-[#ba1a1a]' : 'text-[#47464c]'
        }`}
      >
        {sub}
      </span>
    </button>
  );
}
