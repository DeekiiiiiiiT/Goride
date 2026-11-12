import { minorToMajor } from "./financial_ledger.ts";

export type TollSource = "legacy" | "toll_v2";

export type WeekDriversBundle = {
  state: string;
  weekKey: string;
  drivers: V2DriverTollLine[];
};

/** Pass E: week statements must not overwrite toll fields when v2 is the source of truth. */
export function shouldPassEOverrideTollStatement(tollSource: TollSource): boolean {
  return tollSource !== "toll_v2";
}

export function parseWeekDriversRpc(data: unknown): WeekDriversBundle {
  const payload = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const driversRaw = payload.drivers;
  const drivers = Array.isArray(driversRaw)
    ? (driversRaw as V2DriverTollLine[])
    : [];
  return {
    state: String(payload.state ?? "open"),
    weekKey: String(payload.weekKey ?? ""),
    drivers,
  };
}

export function findDriverTollLineInWeek(
  bundle: WeekDriversBundle,
  driverId: string,
): V2DriverTollLine | null {
  const want = String(driverId);
  for (const line of bundle.drivers) {
    if (String(line.driverId ?? "") === want) return line;
  }
  return null;
}

export async function getCachedWeekDrivers(
  cache: Map<string, WeekDriversBundle>,
  organizationId: string,
  weekKey: string,
  fetch: (org: string, week: string) => Promise<WeekDriversBundle>,
): Promise<WeekDriversBundle> {
  const key = `${organizationId}:${weekKey}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const bundle = await fetch(organizationId, weekKey);
  cache.set(key, bundle);
  return bundle;
}

export interface V2DriverTollLine {
  driverId?: string;
  owesFleetMinor?: number;
  fleetOwesMinor?: number;
  recoveredInPassengerCashMinor?: number;
  spendMinor?: number;
  tagSpendMinor?: number;
  cashSpendMinor?: number;
  platformMinor?: number;
  fleetMinor?: number;
}

export interface DriverTollSettlementInputs {
  tollChargedToDriver: number;
  tollCashWashEligible: number;
  tollSpend: number;
  tollCashSpend: number;
  tollTagSpend: number;
  tollReimbursed: number;
}

export interface ResolveTollInputsDeps {
  isTollsV2On: (organizationId: string) => Promise<boolean>;
  fetchDriverWeekTolls: (
    organizationId: string,
    weekKey: string,
    driverId: string,
  ) => Promise<{ line: V2DriverTollLine | null }>;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function minorField(line: V2DriverTollLine | null, key: keyof V2DriverTollLine): number {
  if (!line) return 0;
  const v = line[key];
  return Number(v ?? 0);
}

export function v2DriverTollInputs(line: V2DriverTollLine | null): DriverTollSettlementInputs {
  return {
    tollChargedToDriver: round2(minorToMajor(minorField(line, "owesFleetMinor"))),
    tollCashWashEligible: round2(minorToMajor(minorField(line, "fleetOwesMinor"))),
    tollSpend: round2(minorToMajor(minorField(line, "spendMinor"))),
    tollCashSpend: round2(minorToMajor(minorField(line, "cashSpendMinor"))),
    tollTagSpend: round2(minorToMajor(minorField(line, "tagSpendMinor"))),
    tollReimbursed: round2(minorToMajor(minorField(line, "platformMinor"))),
  };
}

export async function resolveTollInputs(
  organizationId: string,
  _driverId: string,
  _periodAnchor: string,
  legacy: DriverTollSettlementInputs,
  deps: ResolveTollInputsDeps,
): Promise<DriverTollSettlementInputs & { tollSource: TollSource }> {
  if (!organizationId) {
    return { ...legacy, tollSource: "legacy" };
  }

  const v2On = await deps.isTollsV2On(organizationId);
  if (!v2On) {
    return { ...legacy, tollSource: "legacy" };
  }

  const { line } = await deps.fetchDriverWeekTolls(organizationId, _periodAnchor, _driverId);
  return { ...v2DriverTollInputs(line), tollSource: "toll_v2" };
}
