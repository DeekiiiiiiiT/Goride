import type { TollV2Charge, TollV2WeekResult } from './types';
import { fmtTollMinor } from './tollV2Format';

const DECIDED_STATES = new Set(['decided', 'rejected', 'duplicate']);
/** Unverified cash is not in week spend until verified (P3 posting). */
const STILL_TO_DECIDE_EXCLUDE = new Set([...DECIDED_STATES, 'unverified']);

export type TollV2TileSet = {
  spendMinor: number;
  platformMinor: number;
  driverMinor: number;
  fleetMinor: number;
  stillToDecideMinor: number;
  tilesAddUp: boolean;
};

export type TollV2TileSubcounts = {
  transactionCount: number;
  verifiedMatchCount: number;
  driverAssignedCount: number;
  driverAssignedLabel: string;
  fleetAbsorbedCount: number;
  itemsRemainingCount: number;
};

export function computeTiles(result: TollV2WeekResult, charges: TollV2Charge[]): TollV2TileSet {
  const spendMinor = result.spend?.totalMinor ?? 0;
  const platformMinor = result.bearers?.platformMinor ?? 0;
  const driverMinor = result.bearers?.driverMinor ?? 0;
  const fleetMinor = result.bearers?.fleetMinor ?? 0;
  const stillToDecideMinor = charges
    .filter((c) => !STILL_TO_DECIDE_EXCLUDE.has(c.state))
    .reduce((n, c) => n + (c.openMinor ?? 0), 0);
  const sum = platformMinor + driverMinor + fleetMinor + stillToDecideMinor;
  const tilesAddUp = sum === spendMinor;
  return { spendMinor, platformMinor, driverMinor, fleetMinor, stillToDecideMinor, tilesAddUp };
}

export function computeTileSubcounts(
  charges: TollV2Charge[],
  result: TollV2WeekResult,
): TollV2TileSubcounts {
  const transactionCount = charges.length;
  const verifiedMatchCount = charges.filter(
    (c) => c.section === 'decided' && c.decision?.kind === 'matched',
  ).length;
  const driverAssignedCount = charges.filter(
    (c) => c.decision?.kind === 'driver_pays' || (c.state === 'decided' && c.decision?.kind === 'driver_pays'),
  ).length;
  const owingDrivers =
    result.drivers?.filter((d) => (d.owesFleetMinor ?? 0) > 0) ?? [];
  let driverAssignedLabel = driverAssignedCount > 0 ? `${driverAssignedCount} assigned` : '0 assigned';
  if (owingDrivers.length === 1 && (owingDrivers[0]?.owesFleetMinor ?? 0) > 0) {
    const name = owingDrivers[0]?.driverName?.trim() || 'Driver';
    driverAssignedLabel = `1 toll · ${name}`;
  } else if (driverAssignedCount > 0) {
    driverAssignedLabel = `${driverAssignedCount} assigned`;
  }
  const fleetAbsorbedCount = charges.filter((c) =>
    ['fleet_pays', 'fleet_absorbs'].includes(c.decision?.kind ?? ''),
  ).length;
  const itemsRemainingCount = charges.filter((c) => !DECIDED_STATES.has(c.state)).length;
  return {
    transactionCount,
    verifiedMatchCount,
    driverAssignedCount,
    driverAssignedLabel,
    fleetAbsorbedCount,
    itemsRemainingCount,
  };
}

export function progressCounts(charges: TollV2Charge[]): { decided: number; total: number; left: number } {
  const total = charges.length;
  const decided = charges.filter((c) => DECIDED_STATES.has(c.state)).length;
  return { decided, total, left: total - decided };
}

export function tileSumLine(tiles: TollV2TileSet): string {
  const parts = [
    `Spend ${fmtTollMinor(tiles.spendMinor)}`,
    `Paid back ${fmtTollMinor(tiles.platformMinor)}`,
    `Driver pays ${fmtTollMinor(tiles.driverMinor)}`,
    `Fleet pays ${fmtTollMinor(tiles.fleetMinor)}`,
  ];
  if (tiles.stillToDecideMinor > 0) {
    parts.push(`Still to decide ${fmtTollMinor(tiles.stillToDecideMinor)}`);
  }
  return `${parts[0]} = ${parts.slice(1).join(' + ')}`;
}
