/**
 * Fuel Brain classifier — locked priority (keep in sync with
 * apps/fleet/src/utils/fuelBrainClassify.ts).
 */

export type SessionMode = "personal" | "off_duty" | "work";

export interface ClassifyWeekInput {
  totalOdometerKm: number;
  tripRideshareKm: number;
  companyOpsKm: number;
  sessions: Array<{
    mode: SessionMode;
    startAt: string;
    endAt?: string | null;
    startOdo?: number | null;
    endOdo?: number | null;
  }>;
  deadheadHintKm?: number;
}

export interface ClassifyWeekResult {
  rideShareKm: number;
  personalKm: number;
  offDutyKm: number;
  companyOpsKm: number;
  deadheadKm: number;
  unknownKm: number;
  totalOdometerKm: number;
  confidence: {
    rideShare: "high" | "medium" | "low";
    personal: "high" | "medium" | "low";
    deadhead: "high" | "medium" | "low";
    unknown: "high" | "medium" | "low";
  };
  unknownPct: number;
  method: "fuel_brain_v1";
}

function sessionDeclaredKm(
  sessions: ClassifyWeekInput["sessions"],
  modes: Array<"personal" | "off_duty">,
): number {
  let km = 0;
  for (const s of sessions) {
    if (!modes.includes(s.mode as "personal" | "off_duty")) continue;
    const start = Number(s.startOdo);
    const end = Number(s.endOdo);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      km += end - start;
    }
  }
  return Math.max(0, km);
}

export function classifyFuelWeek(input: ClassifyWeekInput): ClassifyWeekResult {
  const totalOdo = Math.max(0, Number(input.totalOdometerKm) || 0);
  const tripKm = Math.max(0, Number(input.tripRideshareKm) || 0);
  const companyOpsKm = Math.max(0, Number(input.companyOpsKm) || 0);

  const personalFromSessions = sessionDeclaredKm(input.sessions, ["personal"]);
  const offDutyFromSessions = sessionDeclaredKm(input.sessions, ["off_duty"]);
  let personalKm = personalFromSessions + offDutyFromSessions;

  if (totalOdo > 0) {
    const maxPersonal = Math.max(0, totalOdo - tripKm - companyOpsKm);
    personalKm = Math.min(personalKm, maxPersonal);
  }

  const afterKnown = totalOdo > 0
    ? Math.max(0, totalOdo - tripKm - companyOpsKm - personalKm)
    : 0;

  const deadheadHint = Math.max(0, Number(input.deadheadHintKm) || 0);
  const deadheadKm = Math.min(deadheadHint, afterKnown);
  // Never auto-Personal: leftover residual is Unknown
  const unknownKm = Math.max(0, afterKnown - deadheadKm);

  const unknownPct = totalOdo > 0 ? (unknownKm / totalOdo) * 100 : 0;

  return {
    rideShareKm: tripKm,
    personalKm,
    offDutyKm: offDutyFromSessions,
    companyOpsKm,
    deadheadKm,
    unknownKm,
    totalOdometerKm: totalOdo,
    confidence: {
      rideShare: tripKm > 0 ? "high" : "low",
      personal: personalKm > 0 ? "high" : "low",
      deadhead: deadheadKm > 0 ? "medium" : "low",
      unknown: unknownKm > 0 ? "low" : "high",
    },
    unknownPct: Number(unknownPct.toFixed(2)),
    method: "fuel_brain_v1",
  };
}
