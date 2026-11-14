import React from 'react';
import { Banknote, Car, CircleDollarSign, Sparkles, Tag, User } from 'lucide-react';
import type { TollV2TileSet, TollV2TileSubcounts } from './tollV2Tiles';
import { fmtTollMinor } from './tollV2Format';

export function TollV2TilesRow({
  tiles,
  tilesAddUp,
  subcounts,
  locked,
}: {
  tiles: TollV2TileSet;
  tilesAddUp: boolean;
  subcounts: TollV2TileSubcounts;
  locked?: boolean;
}) {
  const items = [
    {
      label: 'Toll spend',
      value: tiles.spendMinor,
      sub: `${subcounts.transactionCount} total transactions`,
      icon: <Tag className="h-4 w-4 text-[#47464c]" aria-hidden />,
      emphasize: true,
    },
    {
      // Uber and InDrive both pay tolls back on the trip (toll-core v2 adapters).
      label: 'Paid back by platforms',
      value: tiles.platformMinor,
      sub: `${subcounts.verifiedMatchCount} verified matches`,
      icon: <Sparkles className="h-4 w-4 text-[#1d4ed8]" aria-hidden />,
    },
    {
      label: 'Driver pays',
      value: tiles.driverMinor,
      sub: subcounts.driverAssignedLabel,
      icon: <User className="h-4 w-4 text-[#47464c]" aria-hidden />,
    },
    {
      label: 'Fleet pays',
      value: tiles.fleetMinor,
      sub: `${subcounts.fleetAbsorbedCount} absorbed`,
      icon: <Car className="h-4 w-4 text-[#47464c]" aria-hidden />,
    },
    {
      label: 'Still to decide',
      value: tiles.stillToDecideMinor,
      sub: `${subcounts.itemsRemainingCount} items remaining`,
      icon: <CircleDollarSign className="h-4 w-4 text-[#545f73]" aria-hidden />,
      highlight: true,
    },
  ];
  return (
    <div className="space-y-2" data-testid="toll-v2-tiles">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {items.map((it) => (
          <div
            key={it.label}
            className={`rounded-xl border p-3 shadow-sm ${
              locked ? 'opacity-80' : ''
            } ${it.highlight ? 'border-[#d5e0f8] bg-[#d5e0f8]/40' : 'border-[#e5eeff] bg-white'}`}
          >
            <div className="flex items-center gap-1.5">
              {it.icon ?? <Banknote className="h-4 w-4 opacity-0" aria-hidden />}
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#47464c]">{it.label}</p>
            </div>
            <p className="mt-1 text-lg font-semibold tabular-nums text-[#0b1c30]">{fmtTollMinor(it.value)}</p>
            <p className="text-xs text-[#47464c]">{it.sub}</p>
          </div>
        ))}
      </div>
      {!tilesAddUp ? (
        <p className="text-sm font-semibold text-[#ba1a1a]" data-testid="toll-v2-tiles-mismatch">
          The toll tiles do not add up to toll spend — please report this bug.
        </p>
      ) : null}
    </div>
  );
}
