/** Step 16 (28 Nov 2026): hard use is decided by Roam each night from how far the car drives. */
export type HardUseMode = "auto" | "keep_normal" | "keep_hard";

export type HardUseSource = "auto" | "fleet_kept_normal" | "fleet_kept_hard";

export type VehicleHardUse = {
  hardUse: boolean;
  source: HardUseSource | string;
  why: string | null;
  signs: {
    km?: number | null;
    span_days?: number | null;
    km_per_day?: number | null;
    multiple?: number | null;
    baseline_km_per_year?: number | null;
    short_trip_share?: number | null;
    measured?: boolean;
  } | null;
  checkedAt: string | null;
  keptNormalUntil: string | null;
  keptHardUntil: string | null;
  policy: {
    baselineKmPerYear: number;
    highUseMultiple: number;
    windowDays: number;
    keptNormalDays: number;
    keptHardDays: number;
  } | null;
};
