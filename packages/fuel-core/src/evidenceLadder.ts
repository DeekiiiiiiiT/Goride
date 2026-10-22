/**
 * Evidence ladder for off-app kilometres. No 35% floor.
 * Online positioning already inside the trip file stays in rideshare.
 * Personal is evidenced adjustments only. Whatever is left is unattributed.
 */

export const INDUSTRY_ONLINE_DEADHEAD_BENCHMARK_PCT = 35;
export const DEFAULT_SHIFT_BREAK_HOURS = 6;
export const REPOSITION_GAP_MAX_MINUTES = 30;

export type LadderTrip = {
  id?: string;
  platform?: string;
  onTripKm?: number;
  enrouteKm?: number;
  openKm?: number;
  unavailableKm?: number;
  /** True when the file has no P1/P2 columns (InDrive, Roam). */
  positioningMissing?: boolean;
};

export type KmSource = {
  category: 'online' | 'commute' | 'reposition' | 'refuel' | 'personal' | 'unattributed';
  km: number;
  confidence: 'measured' | 'estimated' | 'none';
  note?: string;
};

export type EvidenceLadderInput = {
  spanKm: number;
  trips: LadderTrip[];
  companyOpsKm?: number;
  /** Explicit personal adjustments. Never the remainder. */
  evidencedPersonalKm?: number;
  /** Routed home ↔ shift ends. 0 when home is not set. */
  commuteKm?: number;
  homeMissing?: boolean;
  /** Routed dropoff → next pickup inside a shift, minus P1/P2 already counted. */
  repositionKm?: number;
  /** Method C time share is an estimate. A routed gap is measured. */
  repositionConfidence?: 'measured' | 'estimated';
  repositionNote?: string;
  refuelDetourKm?: number;
};

export type EvidenceLadderResult = {
  onlineKm: number;
  onlineEstimatedKm: number;
  commuteKm: number;
  repositionKm: number;
  refuelDetourKm: number;
  personalKm: number;
  companyOpsKm: number;
  unattributedKm: number;
  /** P1+P2 ÷ (on-trip + P1 + P2) for platforms that report them. Null when none. */
  onlinePositioningPct: number | null;
  industryBenchmarkPct: number;
  homeMissing: boolean;
  sources: KmSource[];
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildEvidenceLadder(input: EvidenceLadderInput): EvidenceLadderResult {
  const span = Math.max(0, Number(input.spanKm) || 0);
  const trips = input.trips || [];

  let measuredOn = 0;
  let measuredPos = 0;
  let bareOn = 0;
  for (const t of trips) {
    const on = Math.max(0, Number(t.onTripKm) || 0);
    const pos =
      Math.max(0, Number(t.enrouteKm) || 0) +
      Math.max(0, Number(t.openKm) || 0) +
      Math.max(0, Number(t.unavailableKm) || 0);
    if (t.positioningMissing) bareOn += on;
    else {
      measuredOn += on;
      measuredPos += pos;
    }
  }

  const uberRatio = measuredOn > 0 ? measuredPos / measuredOn : null;
  const estimatedExtra = uberRatio != null ? bareOn * uberRatio : 0;
  const onlineKm = measuredOn + measuredPos + bareOn + estimatedExtra;
  const onlinePositioningPct =
    measuredOn + measuredPos > 0
      ? round2((measuredPos / (measuredOn + measuredPos)) * 100)
      : null;

  const company = Math.max(0, Number(input.companyOpsKm) || 0);
  const personal = Math.max(0, Number(input.evidencedPersonalKm) || 0);
  const commute = Math.max(0, Number(input.commuteKm) || 0);
  const reposition = Math.max(0, Number(input.repositionKm) || 0);
  const refuel = Math.max(0, Number(input.refuelDetourKm) || 0);

  let claimed = onlineKm + company + personal + commute + reposition + refuel;
  let onlineOut = onlineKm;
  let commuteOut = commute;
  let repositionOut = reposition;
  let refuelOut = refuel;
  let personalOut = personal;
  let companyOut = company;
  if (span > 0 && claimed > span) {
    const scale = span / claimed;
    onlineOut *= scale;
    companyOut *= scale;
    personalOut *= scale;
    commuteOut *= scale;
    repositionOut *= scale;
    refuelOut *= scale;
    claimed = span;
  }
  const unattributed = span > 0 ? Math.max(0, span - claimed) : 0;

  const sources: KmSource[] = [
    {
      category: 'online',
      km: round2(onlineOut),
      confidence: estimatedExtra > 0 ? 'estimated' : 'measured',
      note: estimatedExtra > 0
        ? 'Platforms without positioning used this week’s own Uber ratio'
        : uberRatio == null && bareOn > 0
          ? 'No Uber ratio this week — those positioning kilometres stay unexplained'
          : undefined,
    },
    { category: 'commute', km: round2(commuteOut), confidence: input.homeMissing ? 'none' : 'measured' },
    {
      category: 'reposition',
      km: round2(repositionOut),
      confidence: repositionOut > 0 ? (input.repositionConfidence || 'estimated') : 'none',
      note: input.repositionNote,
    },
    { category: 'refuel', km: round2(refuelOut), confidence: refuelOut > 0 ? 'measured' : 'none' },
    { category: 'personal', km: round2(personalOut), confidence: personalOut > 0 ? 'measured' : 'none' },
    { category: 'unattributed', km: round2(unattributed), confidence: unattributed > 0 ? 'none' : 'measured' },
  ];

  return {
    onlineKm: round2(onlineOut),
    onlineEstimatedKm: round2(estimatedExtra),
    commuteKm: round2(commuteOut),
    repositionKm: round2(repositionOut),
    refuelDetourKm: round2(refuelOut),
    personalKm: round2(personalOut),
    companyOpsKm: round2(companyOut),
    unattributedKm: round2(unattributed),
    onlinePositioningPct,
    industryBenchmarkPct: INDUSTRY_ONLINE_DEADHEAD_BENCHMARK_PCT,
    homeMissing: !!input.homeMissing,
    sources,
  };
}
