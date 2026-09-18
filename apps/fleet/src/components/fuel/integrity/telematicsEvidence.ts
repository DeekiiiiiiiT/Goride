/**
 * Future Amber Connect (and other telematics) evidence seam for Stop-to-stop.
 * Bucket engine remains SSOT for money/conservation; telematics is a second
 * distance/idle reference for confidence — never invents fill-flag rows.
 */
export type TelematicsEvidenceSource = 'amber' | 'none';

export type TelematicsGapSegment = {
  fromIso: string;
  toIso: string;
  distanceKm?: number;
  idleMinutes?: number;
};

export type VehicleWeekTelematicsEvidence = {
  vehicleId: string;
  weekStartYmd: string;
  weekEndYmd: string;
  gpsDistanceKm?: number;
  idleMinutes?: number;
  gapSegments?: TelematicsGapSegment[];
  source: TelematicsEvidenceSource;
};

export type TelematicsEvidenceQuery = {
  vehicleId: string;
  weekStart: string;
  weekEnd: string;
};

/**
 * Provider contract for a future Amber Connect integration.
 * v1 ships no implementation — Stop-to-stop works without this.
 */
export type TelematicsEvidenceProvider = {
  getVehicleWeekEvidence: (
    query: TelematicsEvidenceQuery,
  ) => Promise<VehicleWeekTelematicsEvidence | null>;
};
